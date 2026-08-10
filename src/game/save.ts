// 存档系统：localStorage + 版本迁移 + checksum + 三槽备份 + 导入导出
// 存储可注入（Node 测试用 mock），浏览器端自动使用 localStorage
import { CONFIG } from "./config";
import type { GameState } from "./types";
import { createNewState } from "./engine";

export interface SaveFile {
  format: string;
  version: number;
  timestamp: number;
  checksum: string;
  state: GameState;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let injected: StorageLike | null = null;
export function setStorage(s: StorageLike | null): void {
  injected = s;
}
function storage(): StorageLike | null {
  if (injected) return injected;
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

const KEY = "index-boundary-save";
const BACKUP_KEY = "index-boundary-save-bak";

// FNV-1a 32bit
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function makeSave(state: GameState): SaveFile {
  const timestamp = Date.now();
  const version = CONFIG.SAVE_VERSION;
  const body = JSON.stringify(state) + String(version) + String(timestamp);
  return { format: "index-boundary-save", version, timestamp, checksum: fnv1a(body), state };
}

// ---------------- 版本迁移 ----------------
// 迁移链：v1 → v2 → v3 …
const MIGRATIONS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2：被动技能从单一 passiveLevel 迁移为 3 条独立被动（节律/聚能/贪婪）
  1: (s) => {
    const skills = (s.skills ?? {}) as Record<string, unknown>;
    if (typeof skills.passiveLevel === "number") {
      skills.passives = { rhythm: skills.passiveLevel as number, focus: 0, greed: 0 };
      delete skills.passiveLevel;
    }
    return s;
  },
};

export function migrateState(raw: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
  let v = fromVersion;
  let s = raw;
  while (v < CONFIG.SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) break;
    s = m(s);
    v += 1;
  }
  return s;
}

// 合并缺失字段（向前兼容，坏档自愈）
export function normalizeState(raw: unknown): GameState {
  const base = createNewState(0);
  const r = (raw ?? {}) as Record<string, any>;
  const state: GameState = { ...base, ...r };
  state.meta = { ...base.meta, ...(r.meta ?? {}) };
  state.player = { ...base.player, ...(r.player ?? {}) };
  state.player.upgrades = { ...base.player.upgrades, ...(r.player?.upgrades ?? {}) };
  state.combat = { ...base.combat, ...(r.combat ?? {}) };
  state.equipment = { ...base.equipment, ...(r.equipment ?? {}) };
  state.equipment.slots = { ...(r.equipment?.slots ?? {}) };
  state.equipment.inventory = Array.isArray(r.equipment?.inventory) ? r.equipment.inventory : [];
  state.skills = { ...base.skills, ...(r.skills ?? {}) };
  state.skills.actives = Array.isArray(r.skills?.actives) ? r.skills.actives : [];
  state.skills.passives = { ...base.skills.passives, ...(r.skills?.passives ?? {}) };
  state.talents = { ...base.talents, ...(r.talents ?? {}) };
  state.talents.allocations = { ...(r.talents?.allocations ?? {}) };
  state.talents.keystones = { ...(r.talents?.keystones ?? {}) };
  state.talents.presets = Array.isArray(r.talents?.presets) ? [...r.talents.presets] : [];
  while (state.talents.presets.length < 3) {
    state.talents.presets.push({ name: "", talents: {}, keystones: {} });
  }
  state.prestige = { ...base.prestige, ...(r.prestige ?? {}) };
  state.prestige.purchases = { ...(r.prestige?.purchases ?? {}) };
  state.items = { ...base.items, ...(r.items ?? {}) };
  state.items.consumables = { ...(r.items?.consumables ?? {}) };
  state.items.tools = { ...(r.items?.tools ?? {}) };
  state.statistics = { ...base.statistics, ...(r.statistics ?? {}) };
  state.daily = { ...base.daily, ...(r.daily ?? {}) };
  state.daily.quests = Array.isArray(r.daily?.quests) ? r.daily.quests : [];
  state.daily.goldEarned = Array.isArray(r.daily?.goldEarned) ? r.daily.goldEarned : [0, 0];
  state.challenges = { ...base.challenges, ...(r.challenges ?? {}) };
  state.meta.unlocks = Array.isArray(state.meta.unlocks) ? state.meta.unlocks : [];
  state.meta.achievements = Array.isArray(state.meta.achievements) ? state.meta.achievements : [];
  state.meta.milestonesSeen = Array.isArray(state.meta.milestonesSeen) ? state.meta.milestonesSeen : [];
  state.meta.lastScoreSubmit = { ...(state.meta.lastScoreSubmit ?? {}) };
  return state;
}

function parseSave(raw: string): GameState | null {
  try {
    const file = JSON.parse(raw) as SaveFile;
    if (!file || file.format !== "index-boundary-save" || !file.state) return null;
    const body = JSON.stringify(file.state) + String(file.version) + String(file.timestamp);
    if (fnv1a(body) !== file.checksum) return null;
    const migrated = migrateState(file.state as unknown as Record<string, unknown>, file.version ?? 1);
    return normalizeState(migrated);
  } catch {
    return null;
  }
}

export function saveGame(state: GameState): void {
  const st = storage();
  if (!st) return;
  const file = makeSave(state);
  const raw = JSON.stringify(file);
  // 三槽滚动备份
  for (let i = CONFIG.SAVE_BACKUP_SLOTS - 1; i > 0; i--) {
    const prev = st.getItem(`${BACKUP_KEY}${i - 1}`);
    if (prev) st.setItem(`${BACKUP_KEY}${i}`, prev);
  }
  const cur = st.getItem(KEY);
  if (cur) st.setItem(`${BACKUP_KEY}0`, cur);
  st.setItem(KEY, raw);
}

export function loadGame(): { state: GameState; fromBackup: boolean } | null {
  const st = storage();
  if (!st) return null;
  const raw = st.getItem(KEY);
  if (raw) {
    const parsed = parseSave(raw);
    if (parsed) return { state: parsed, fromBackup: false };
  }
  for (let i = 0; i < CONFIG.SAVE_BACKUP_SLOTS; i++) {
    const b = st.getItem(`${BACKUP_KEY}${i}`);
    if (!b) continue;
    const parsed = parseSave(b);
    if (parsed) return { state: parsed, fromBackup: true };
  }
  return null;
}

export function clearSave(): void {
  const st = storage();
  if (!st) return;
  st.removeItem(KEY);
  for (let i = 0; i < CONFIG.SAVE_BACKUP_SLOTS; i++) st.removeItem(`${BACKUP_KEY}${i}`);
}

export function exportSave(state: GameState): string {
  return JSON.stringify(makeSave(state));
}

export function importSave(text: string): GameState | null {
  return parseSave(text);
}