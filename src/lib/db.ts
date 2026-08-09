import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

export const SCORE_KINDS = ["stage", "mag", "prestige"] as const;
export type ScoreKind = (typeof SCORE_KINDS)[number];

let db: DatabaseSync | null = null;

function databasePath(): string {
  const configured = process.env.IB_DB_PATH?.trim();
  if (!configured) return path.join(process.cwd(), "data", "game.db");
  return configured === ":memory:" ? configured : path.resolve(process.cwd(), configured);
}

export function isScoreKind(value: unknown): value is ScoreKind {
  return typeof value === "string" && SCORE_KINDS.includes(value as ScoreKind);
}

export function getDb(): DatabaseSync {
  if (db) return db;

  const dbPath = databasePath();
  if (dbPath !== ":memory:") mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      run_value INTEGER NOT NULL,
      depth INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      run_id TEXT,
      kind TEXT NOT NULL DEFAULT 'stage'
    );
    CREATE TABLE IF NOT EXISTS user_saves (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      save_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id);
  `);
  return db;
}

export type UserRow = { id: number; username: string; password_hash: string; created_at: number };

export function findUserByUsername(username: string): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
}

export function findUserById(id: number): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function createUser(username: string, passwordHash: string): number {
  const info = getDb()
    .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
    .run(username, passwordHash, Date.now());
  return Number(info.lastInsertRowid);
}

export function insertSession(token: string, userId: number, expiresAt: number): void {
  getDb().prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    token, userId, Date.now(), expiresAt
  );
}

export function findSession(token: string): { user_id: number; expires_at: number } | undefined {
  return getDb().prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?").get(token) as
    | { user_id: number; expires_at: number }
    | undefined;
}

export function deleteSession(token: string): void {
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function deleteExpiredSessions(): void {
  getDb().prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}

export function updateUserPasswordHash(userId: number, passwordHash: string): void {
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
}

// ---------------- 云存档 ----------------

export type UserSaveRow = { user_id: number; save_json: string; updated_at: number };

export function getUserSave(userId: number): UserSaveRow | undefined {
  return getDb().prepare("SELECT user_id, save_json, updated_at FROM user_saves WHERE user_id = ?").get(userId) as
    | UserSaveRow
    | undefined;
}

export function upsertUserSave(userId: number, saveJson: string, updatedAt: number): void {
  getDb()
    .prepare(
      `INSERT INTO user_saves (user_id, save_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET save_json = excluded.save_json, updated_at = excluded.updated_at`
    )
    .run(userId, saveJson, updatedAt);
}

// ---------------- 排行榜 ----------------
// 指标定义：
//   stage    run_value = 最大关卡
//   mag      run_value = floor(log10(全时间总伤害))
//   prestige run_value = 重构次数

// 幂等提交：同一用户的同一 run_id 只能写入一次。
export function addScoreIdempotent(
  userId: number,
  runValue: number,
  depth: number,
  runId: string,
  kind: ScoreKind = "stage"
): boolean {
  const normalizedValue = Math.max(0, Math.round(runValue));
  const normalizedDepth = Math.max(0, Math.round(depth));
  const info = getDb()
    .prepare(
      `INSERT OR IGNORE INTO scores
         (user_id, run_value, depth, created_at, run_id, kind)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(userId, normalizedValue, normalizedDepth, Date.now(), runId, kind);
  return Number(info.changes) > 0;
}

// 限流：统计该用户最近 sinceMs 时间点之后的成功提交次数。
export function countRecentScores(userId: number, sinceMs: number): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM scores WHERE user_id = ? AND created_at >= ?")
    .get(userId, sinceMs) as { n: number };
  return Number(row.n);
}

type LeaderboardStats = {
  username: string;
  best_value: number;
  best_depth: number;
  runs: number;
  last_run_at: number;
};

export type LeaderboardEntry = LeaderboardStats & {
  rank: number;
  best: number;
};

export type UserBest = Omit<LeaderboardStats, "username"> & { best: number };

function leaderboardOrder(kind: ScoreKind): string {
  if (kind === "stage") return "best_value DESC, best_depth DESC, last_run_at DESC";
  if (kind === "prestige") return "best_value DESC, best_depth DESC, last_run_at DESC";
  return "best_value DESC, best_depth DESC, last_run_at DESC";
}

export function getLeaderboard(limit = 50, kind: ScoreKind = "stage"): LeaderboardEntry[] {
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit) || 50));
  const rows = getDb()
    .prepare(
      `SELECT u.username AS username,
              MAX(s.run_value) AS best_value,
              MAX(s.depth) AS best_depth,
              COUNT(*) AS runs,
              MAX(s.created_at) AS last_run_at
       FROM scores s
       JOIN users u ON u.id = s.user_id
       WHERE s.kind = ?
       GROUP BY s.user_id, u.username
       ORDER BY ${leaderboardOrder(kind)}
       LIMIT ?`
    )
    .all(kind, safeLimit) as LeaderboardStats[];

  return rows.map((row, index) => ({
    ...row,
    best: Number(row.best_value),
    rank: index + 1,
  }));
}

export function getUserBest(userId: number, kind: ScoreKind = "stage"): UserBest {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(MAX(run_value), 0) AS best_value,
              COALESCE(MAX(depth), 0) AS best_depth,
              COUNT(*) AS runs,
              COALESCE(MAX(created_at), 0) AS last_run_at
       FROM scores
       WHERE user_id = ? AND kind = ?`
    )
    .get(userId, kind) as Omit<LeaderboardStats, "username">;

  return { ...row, best: Number(row.best_value) };
}