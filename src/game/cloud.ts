// 客户端云同步：登录 / 云存档 / 排行榜提交
import type { GameState } from "./types";
import { CONFIG } from "./config";
import {
  apiLogin, apiLogout, apiMe, apiRegister, apiUploadSave, apiFetchSave, apiSubmitScore,
  type AuthUser, type ScoreKind,
} from "../lib/api";
import { normalizeState } from "./save";

export interface CloudState {
  user: AuthUser | null;
  syncing: boolean;
  lastError: string | null;
}

let cloud: CloudState = { user: null, syncing: false, lastError: null };
const listeners = new Set<(c: CloudState) => void>();

export function getCloud(): CloudState {
  return cloud;
}
export function subscribeCloud(cb: (c: CloudState) => void): () => void {
  listeners.add(cb);
  cb(cloud);
  return () => listeners.delete(cb);
}
function setCloud(patch: Partial<CloudState>): void {
  cloud = { ...cloud, ...patch };
  for (const l of listeners) l(cloud);
}

// 页面加载时恢复会话
export async function initCloud(): Promise<void> {
  try {
    const { user } = await apiMe();
    setCloud({ user });
  } catch {
    setCloud({ user: null });
  }
}

export async function register(username: string, password: string): Promise<boolean> {
  try {
    const { user } = await apiRegister(username, password);
    setCloud({ user, lastError: null });
    return true;
  } catch (e) {
    setCloud({ lastError: (e as Error).message });
    return false;
  }
}

export async function login(username: string, password: string): Promise<boolean> {
  try {
    const { user } = await apiLogin(username, password);
    setCloud({ user, lastError: null });
    return true;
  } catch (e) {
    setCloud({ lastError: (e as Error).message });
    return false;
  }
}

export async function logout(): Promise<void> {
  try {
    await apiLogout();
  } catch {
    // 忽略登出网络错误
  }
  setCloud({ user: null });
}

export function isLoggedIn(): boolean {
  return cloud.user !== null;
}

// 上传当前存档（登录时每 5 秒调用）
export async function uploadSave(state: GameState): Promise<void> {
  if (!cloud.user) return;
  try {
    await apiUploadSave(state, Date.now());
    state.meta.cloudSyncedAt = Date.now();
  } catch {
    // 静默失败，下次重试
  }
}

// 下载云存档：返回远端存档或 null
export async function fetchCloudSave(): Promise<GameState | null> {
  if (!cloud.user) return null;
  try {
    const { save } = await apiFetchSave();
    return save ? normalizeState(save) : null;
  } catch {
    return null;
  }
}

// 排行榜提交（幂等 runId）
export async function submitScore(
  state: GameState,
  kind: ScoreKind,
  runValue: number,
  depth: number
): Promise<boolean> {
  if (!cloud.user) return false;
  const now = Date.now();
  const prev = state.meta.lastScoreSubmit[kind];
  if (prev && now - prev.at < CONFIG.LEADERBOARD.SUBMIT_INTERVAL_MS) return false;
  const runId = `${CONFIG.LEADERBOARD.RUN_ID_PREFIX}_${state.meta.createdAt.toString(36)}_${now.toString(36)}_${kind}`;
  try {
    await apiSubmitScore(runId, runValue, depth, kind);
    state.meta.lastScoreSubmit[kind] = { runId, at: now };
    return true;
  } catch {
    return false;
  }
}

// 排行榜指标提取
export function leaderboardMetrics(state: GameState): { mag: number; stage: number; prestige: number; season: number } {
  const totalDamage = state.statistics.totalDamage;
  const mag = totalDamage && Array.isArray(totalDamage)
    ? Math.floor((totalDamage[1] ?? 0) + Math.log10(Math.max(1e-300, totalDamage[0] ?? 1)))
    : 0;
  return {
    mag,
    stage: state.statistics.allTimeMaxStage,
    prestige: state.statistics.totalPrestiges,
    season: state.season.bestScore,
  };
}
