import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { cookies } from "next/headers";
import { deleteSession, findSession, findUserById, insertSession, deleteExpiredSessions } from "./db";

const COOKIE_NAME = "ib_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RATE_LIMIT_CLEANUP_INTERVAL = 100;
const MAX_RATE_LIMIT_BUCKETS = 2048;
const DUMMY_PASSWORD_HASH = "00000000000000000000000000000000:f57c24b9761f49aaebe32af3b5b207b1c304dfc03af20c5b92844cdc7fdd41eba7c0b12d9aa8dd932e1f0501d65651d272a30fd74c453fc9d9a860f35d2b5577";

type AuthAction = "login" | "register";
type RateLimitEntry = { count: number; resetAt: number };
type RateLimitRule = { max: number; windowMs: number };

const rateLimits = new Map<string, RateLimitEntry>();
let rateLimitOperations = 0;

const RATE_LIMIT_RULES: Record<AuthAction, { ip: RateLimitRule; username: RateLimitRule }> = {
  login: {
    ip: { max: 30, windowMs: 10 * 60 * 1000 },
    username: { max: 10, windowMs: 10 * 60 * 1000 },
  },
  register: {
    ip: { max: 8, windowMs: 60 * 60 * 1000 },
    username: { max: 3, windowMs: 60 * 60 * 1000 },
  },
};

export type AuthRateLimitResult =
  | { limited: false }
  | { limited: true; retryAfterSeconds: number };

export type LimitedJsonResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: "malformed" | "too_large" };

function usernameRateLimitKey(value: string): string {
  // Keep case-sensitive semantics aligned with the current SQLite username lookup.
  return value.trim().normalize("NFC").slice(0, 64) || "unknown";
}

function requestIp(headers: Headers): string | null {
  const trustProxy = process.env.AUTH_TRUST_PROXY;
  if (!trustProxy) return null;

  const candidate = trustProxy === "cloudflare"
    ? headers.get("cf-connecting-ip")?.trim()
    : headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return candidate && isIP(candidate) ? candidate.toLowerCase() : null;
}

function evictRateLimitBuckets(now: number): void {
  for (const [key, entry] of rateLimits) {
    if (entry.resetAt <= now) rateLimits.delete(key);
  }
  while (rateLimits.size >= MAX_RATE_LIMIT_BUCKETS) {
    const oldest = rateLimits.keys().next().value as string | undefined;
    if (!oldest) break;
    rateLimits.delete(oldest);
  }
}

function consumeRateLimit(key: string, rule: RateLimitRule, now: number): AuthRateLimitResult {
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    if (!current) evictRateLimitBuckets(now);
    rateLimits.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { limited: false };
  }
  if (current.count >= rule.max) {
    return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { limited: false };
}

function cleanExpiredRateLimits(now: number): void {
  rateLimitOperations += 1;
  if (rateLimitOperations % RATE_LIMIT_CLEANUP_INTERVAL === 0) evictRateLimitBuckets(now);
}

/**
 * Lightweight single-instance limiter. Trust forwarded IP headers only when AUTH_TRUST_PROXY=1
 * AUTH_TRUST_PROXY=cloudflare reads the validated Cloudflare client IP header.
 */
export function rateLimitAuthRequest(
  action: AuthAction,
  headers: Headers,
  username: string,
  now = Date.now(),
): AuthRateLimitResult {
  cleanExpiredRateLimits(now);
  const rules = RATE_LIMIT_RULES[action];
  const ip = requestIp(headers);
  const ipResult: AuthRateLimitResult = ip
    ? consumeRateLimit(`${action}:ip:${ip}`, rules.ip, now)
    : { limited: false };
  const usernameResult = consumeRateLimit(
    `${action}:username:${usernameRateLimitKey(username)}`,
    rules.username,
    now,
  );

  if (!ipResult.limited && !usernameResult.limited) return { limited: false };
  return {
    limited: true,
    retryAfterSeconds: Math.max(
      ipResult.limited ? ipResult.retryAfterSeconds : 0,
      usernameResult.limited ? usernameResult.retryAfterSeconds : 0,
    ),
  };
}

export function resetAuthUsernameRateLimit(action: AuthAction, username: string): void {
  rateLimits.delete(`${action}:username:${usernameRateLimitKey(username)}`);
}

export function clearAuthRateLimitsForTests(): void {
  rateLimits.clear();
  rateLimitOperations = 0;
}

export function authRateLimitBucketCountForTests(): number {
  return rateLimits.size;
}

/** Limit JSON by bytes actually read instead of trusting Content-Length. */
export async function readLimitedJsonObject(request: Request, maxBytes: number): Promise<LimitedJsonResult> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
  if (!request.body) return { ok: false, reason: "malformed" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "malformed" };
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash, extra] = stored.split(":");
  if (extra !== undefined || !/^[0-9a-f]{32}$/i.test(salt ?? "") || !/^[0-9a-f]{128}$/i.test(hash ?? "")) {
    return false;
  }
  try {
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/** 用户不存在时执行等价的密码计算，降低用户名枚举的计时差异。 */
export function verifyPasswordAgainstDummy(password: string): void {
  verifyPassword(password, DUMMY_PASSWORD_HASH);
}

export async function createSessionToken(userId: number): Promise<string> {
  deleteExpiredSessions();
  const token = randomBytes(32).toString("hex");
  insertSession(token, userId, Date.now() + SESSION_TTL_MS);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) deleteSession(token);
  store.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentUser(): Promise<{ id: number; username: string } | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = findSession(token);
  if (!session || session.expires_at < Date.now()) {
    if (session) deleteSession(token);
    return null;
  }
  const user = findUserById(session.user_id);
  return user ? { id: user.id, username: user.username } : null;
}
