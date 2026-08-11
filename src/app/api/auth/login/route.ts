import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  hashPassword,
  rateLimitAuthRequest,
  readLimitedJsonObject,
  resetAuthUsernameRateLimit,
  verifyPassword,
  verifyPasswordAgainstDummy,
} from "@/lib/auth";
import { findUserByUsername, updateUserPasswordHash } from "@/lib/db";

const USERNAME_RE = /^[\w\u4e00-\u9fa5]{2,16}$/;
const MAX_BODY_BYTES = 4096;

function invalidCredentials() {
  return NextResponse.json({ error: "用户名或密码不正确" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const parsed = await readLimitedJsonObject(req, MAX_BODY_BYTES);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.reason === "too_large" ? "\u8bf7\u6c42\u5185\u5bb9\u8fc7\u5927" : "\u8bf7\u6c42\u683c\u5f0f\u9519\u8bef" },
      { status: parsed.reason === "too_large" ? 413 : 400 },
    );
  }
  const data = parsed.value;
  const username = typeof data.username === "string" ? data.username.trim().normalize("NFC") : "";
  const password = typeof data.password === "string" ? data.password : "";
  if (!USERNAME_RE.test(username) || password.length < 1 || password.length > 64) {
    return invalidCredentials();
  }

  const rateLimit = rateLimitAuthRequest("login", req.headers, username);
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: "登录尝试过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const user = findUserByUsername(username);
  if (!user) {
    verifyPasswordAgainstDummy(password);
    return invalidCredentials();
  }

  let valid = verifyPassword(password, user.password_hash);
  if (!valid && user.password_hash.indexOf(":") === -1 && password === user.password_hash) {
    valid = true;
    updateUserPasswordHash(user.id, hashPassword(password));
  }
  if (!valid) return invalidCredentials();

  resetAuthUsernameRateLimit("login", username);
  await createSessionToken(user.id);
  return NextResponse.json({ ok: true, user: { id: user.id, username: user.username } });
}
