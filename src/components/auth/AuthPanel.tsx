"use client";
import { useEffect, useState } from "react";
import { getCloud, register, login, logout, subscribeCloud } from "@/game/cloud";

export function AuthPanel() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [cloud, setCloudState] = useState(getCloud());

  useEffect(() => subscribeCloud(setCloudState), []);

  async function submit() {
    setBusy(true);
    try {
      if (mode === "login") await login(username, password);
      else await register(username, password);
    } finally {
      setBusy(false);
    }
  }

  if (cloud.user) {
    return (
      <div className="panel">
        <h3>账户</h3>
        <div style={{ fontSize: 14, marginBottom: 8 }}>
          已登录：<strong>{cloud.user.username}</strong>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
          云存档每 5 秒自动备份；换设备登录后自动恢复。
        </div>
        <button className="btn" onClick={() => void logout()}>退出登录</button>
      </div>
    );
  }

  return (
    <section className="panel auth-panel" aria-labelledby="auth-heading">
      <h3 id="auth-heading">账户（云存档 + 排行榜）</h3>
      <div className="auth-mode-tabs" role="group" aria-label="账户操作">
        <button
          type="button"
          className={`mini-btn ${mode === "login" ? "active" : ""}`}
          aria-pressed={mode === "login"}
          onClick={() => setMode("login")}
        >
          登录
        </button>
        <button
          type="button"
          className={`mini-btn ${mode === "register" ? "active" : ""}`}
          aria-pressed={mode === "register"}
          onClick={() => setMode("register")}
        >
          注册
        </button>
      </div>
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="visually-hidden" htmlFor="auth-username">用户名</label>
        <input
          id="auth-username"
          name="username"
          autoComplete="username"
          placeholder="用户名（2-16位）"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <label className="visually-hidden" htmlFor="auth-password">密码</label>
        <input
          id="auth-password"
          name="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder="密码（6-64位）"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {cloud.lastError && <div className="auth-error" role="alert">{cloud.lastError}</div>}
        <button className="btn primary" type="submit" disabled={busy || username.length < 2 || password.length < 6}>
          {busy ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}
        </button>
      </form>
      <p className="auth-hint">
        不登录也能本地游玩；登录后可云存档并上榜。
      </p>
    </section>
  );
}