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
    if (mode === "login") await login(username, password);
    else await register(username, password);
    setBusy(false);
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
    <div className="panel">
      <h3>账户（云存档 + 排行榜）</h3>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button className={`mini-btn ${mode === "login" ? "" : ""}`} onClick={() => setMode("login")}>登录</button>
        <button className="mini-btn" onClick={() => setMode("register")}>注册</button>
      </div>
      <div className="auth-form">
        <input placeholder="用户名（2-16位）" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input placeholder="密码（6-64位）" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {cloud.lastError && <div className="auth-error">{cloud.lastError}</div>}
        <button className="btn primary" disabled={busy || username.length < 2 || password.length < 6} onClick={() => void submit()}>
          {busy ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}
        </button>
      </div>
      <p style={{ marginTop: 10, fontSize: 12, color: "var(--text-dim)" }}>
        不登录也能本地游玩；登录后可云存档并上榜。
      </p>
    </div>
  );
}