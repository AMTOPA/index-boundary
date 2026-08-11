import { beforeEach, describe, expect, it } from "vitest";
import {
  authRateLimitBucketCountForTests,
  clearAuthRateLimitsForTests,
  hashPassword,
  rateLimitAuthRequest,
  readLimitedJsonObject,
  resetAuthUsernameRateLimit,
  verifyPassword,
} from "../lib/auth";

function requestHeaders(ip = "203.0.113.8"): Headers {
  return new Headers({ "x-forwarded-for": ip, "user-agent": "vitest" });
}

describe("认证安全基础", () => {
  beforeEach(() => clearAuthRateLimitsForTests());

  it("密码哈希可验证且拒绝错误或畸形哈希", () => {
    const stored = hashPassword("safe-password");
    expect(verifyPassword("safe-password", stored)).toBe(true);
    expect(verifyPassword("wrong-password", stored)).toBe(false);
    expect(verifyPassword("safe-password", "bad:hash")).toBe(false);
    expect(verifyPassword("safe-password", `${stored}:extra`)).toBe(false);
  });

  it("登录按用户名限流，并可在成功后重置用户名桶", () => {
    const headers = requestHeaders();
    for (let index = 0; index < 10; index += 1) {
      expect(rateLimitAuthRequest("login", headers, "tester", index).limited).toBe(false);
    }
    const limited = rateLimitAuthRequest("login", headers, "tester", 10);
    expect(limited.limited).toBe(true);
    if (limited.limited) expect(limited.retryAfterSeconds).toBeGreaterThan(0);

    resetAuthUsernameRateLimit("login", "tester");
    expect(rateLimitAuthRequest("login", headers, "tester", 11).limited).toBe(false);
  });

  it("注册对单一用户名使用更严格的限流", () => {
    const headers = requestHeaders("198.51.100.10");
    expect(rateLimitAuthRequest("register", headers, "new-user", 0).limited).toBe(false);
    expect(rateLimitAuthRequest("register", headers, "new-user", 1).limited).toBe(false);
    expect(rateLimitAuthRequest("register", headers, "new-user", 2).limited).toBe(false);
    expect(rateLimitAuthRequest("register", headers, "new-user", 3).limited).toBe(true);
  });

  it("limits actual body bytes even with a forged Content-Length", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "1" },
      body: JSON.stringify({ username: "tester", password: "x".repeat(5000) }),
    });
    await expect(readLimitedJsonObject(request, 4096)).resolves.toEqual({ ok: false, reason: "too_large" });
  });

  it("keeps username case semantics and bounds limiter memory", () => {
    const headers = requestHeaders();
    for (let index = 0; index < 10; index += 1) {
      rateLimitAuthRequest("login", headers, "Alice", index);
    }
    expect(rateLimitAuthRequest("login", headers, "alice", 11).limited).toBe(false);

    for (let index = 0; index < 2200; index += 1) {
      rateLimitAuthRequest("register", headers, `user-${index}`, 100 + index);
    }
    expect(authRateLimitBucketCountForTests()).toBeLessThanOrEqual(2048);
  });

  it("does not put every client into one shared IP bucket when proxy trust is disabled", () => {
    const previous = process.env.AUTH_TRUST_PROXY;
    delete process.env.AUTH_TRUST_PROXY;
    try {
      const headers = requestHeaders("192.0.2.99");
      for (let index = 0; index < 40; index += 1) {
        expect(rateLimitAuthRequest("login", headers, `distinct-${index}`, index).limited).toBe(false);
      }
    } finally {
      if (previous !== undefined) process.env.AUTH_TRUST_PROXY = previous;
    }
  });

  it("uses validated forwarded IP only when proxy trust is explicit", () => {
    const previous = process.env.AUTH_TRUST_PROXY;
    process.env.AUTH_TRUST_PROXY = "1";
    try {
      const headers = requestHeaders("192.0.2.20");
      for (let index = 0; index < 30; index += 1) {
        expect(rateLimitAuthRequest("login", headers, `user${index}`, index).limited).toBe(false);
      }
      expect(rateLimitAuthRequest("login", headers, "last-user", 31).limited).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.AUTH_TRUST_PROXY;
      else process.env.AUTH_TRUST_PROXY = previous;
    }
  });

});
