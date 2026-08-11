import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  hashPassword,
  rateLimitAuthRequest,
  readLimitedJsonObject,
} from "@/lib/auth";
import { createUser, findUserByUsername } from "@/lib/db";

const USERNAME_RE = /^[\w\u4e00-\u9fa5]{2,16}$/;
const MAX_BODY_BYTES = 4096;

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "请求过于频繁，请稍后再试" },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
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
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ error: "用户名需为 2-16 位字母/数字/下划线/中文" }, { status: 400 });
  }
  if (password.length < 6 || password.length > 64) {
    return NextResponse.json({ error: "密码长度需为 6-64 位" }, { status: 400 });
  }

  const rateLimit = rateLimitAuthRequest("register", req.headers, username);
  if (rateLimit.limited) return tooManyRequests(rateLimit.retryAfterSeconds);

  if (findUserByUsername(username)) {
    return NextResponse.json({ error: "该用户名已被注册" }, { status: 409 });
  }

  try {
    const userId = createUser(username, hashPassword(password));
    await createSessionToken(userId);
    return NextResponse.json({ ok: true, user: { id: userId, username } });
  } catch (error) {
    // 并发注册同一用户名时数据库唯一约束是最终防线。
    if (error instanceof Error && /UNIQUE constraint failed: users\.username/i.test(error.message)) {
      return NextResponse.json({ error: "该用户名已被注册" }, { status: 409 });
    }
    console.error("注册失败：", error);
    return NextResponse.json({ error: "注册暂时不可用，请稍后重试" }, { status: 500 });
  }
}
