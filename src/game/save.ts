// 存档系统：localStorage + 版本迁移 + checksum + 三槽备份 + 导入导出
// 存储可注入（Node 测试用 mock），浏览器端自动使用 localStorage
import { CONFIG } from "./config";
import type { AnimationFps, AutoPrestigeMetric, ChallengeId, GameState, ItemId, ThresholdComparator, ToolId } from "./types";
import { createNewState } from "./engine";
import { leapStartStage } from "./systems/leap";

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

function hadLegacyHigherLayerReset(state: Record<string, any>): boolean {
  return Number(state.leap?.totalLeaps ?? 0) > 0
    || Number(state.laws?.totalRewrites ?? 0) > 0
    || Boolean(state.nexus?.unlocked || state.nexus?.entered)
    || Boolean(state.echo?.unlocked || state.echo?.entered);
}

function repairLegacyLayerGates(state: Record<string, any>, sourceVersion: number): Record<string, any> {
  if (sourceVersion >= 7) return state;
  const leap = (state.leap ?? {}) as Record<string, any>;
  leap.nextRequiredStage = CONFIG.LEAP.STAGE;
  state.leap = leap;
  // v6 无法区分“刚跨层”与“跨层后已重推”；统一回到基础门槛是一次性防卡墙补偿。
  if (hadLegacyHigherLayerReset(state)) {
    const prestige = (state.prestige ?? {}) as Record<string, any>;
    prestige.nextRequiredStage = CONFIG.PRESTIGE.BASE_STAGE;
    state.prestige = prestige;
  }
  return state;
}

function normalizeLeapStageRequirement(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return CONFIG.LEAP.STAGE;
  return Math.min(CONFIG.LEAP.MAX_STAGE_REQUIREMENT, Math.max(CONFIG.LEAP.STAGE, Math.floor(numeric)));
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
  // v2 → v3：试炼赛季状态（缺省由 normalizeState 兜底）
  2: (s) => {
    const meta = (s.meta ?? {}) as Record<string, unknown>;
    if (!Array.isArray(meta.activeModifiers)) meta.activeModifiers = [];
    if (!s.season) {
      s.season = { unlocked: false, bestScore: 0, bestStage: 0, claimedTiers: [], lastModifiers: [] };
    }
    return s;
  },
  // v4 → v5：第 5 维度「超维回响」状态（缺省由 normalizeState 兜底）
  // v3 -> v4: no structural change; keep the migration chain continuous.
  3: (s) => s,
  4: (s) => {
    if (!s.echo) {
      s.echo = { unlocked: false, entered: false, dimension: 0, seals: 0, totalSealsEarned: 0, purchases: {} };
    }
    return s;
  },
  // v5 -> v6: tool levels, auto-prestige rule, dynamic prestige gate and discoveries.
  5: (s) => {
    const items = (s.items ?? {}) as Record<string, any>;
    const legacyTools = (items.tools ?? {}) as Partial<Record<ToolId, boolean>>;
    const levels = { ...((items.toolLevels ?? {}) as Partial<Record<ToolId, number>>) };
    for (const [id, owned] of Object.entries(legacyTools) as [ToolId, boolean][]) {
      if (!owned || (levels[id] ?? 0) > 0) continue;
      levels[id] = id === "auto_upgrade" ? 2 : 1;
    }
    items.toolLevels = levels;
    items.autoPrestigeRule ??= { enabled: false, metric: "stage", comparator: "gte", value: 1000 };
    s.items = items;
    return s;
  },
  // v6 -> v7: dynamic leap gate plus a one-time anti-wall repair for legacy higher-layer saves.
  6: (s) => repairLegacyLayerGates(s, 6),
  // v7 -> v8: runtime reset semantics changed; normalizeState performs a non-destructive baseline repair.
  7: (s) => s,

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
  const input = (raw ?? {}) as Record<string, any>;
  const sourceVersion = Number.isFinite(input.meta?.version) ? Number(input.meta.version) : 1;
  const r = repairLegacyLayerGates(input, sourceVersion);
  const state: GameState = { ...base, ...r };
  state.meta = { ...base.meta, ...(r.meta ?? {}) };
  const animationFpsOptions: AnimationFps[] = [30, 60, 120];
  state.meta.settings = {
    ...base.meta.settings,
    ...(r.meta?.settings ?? {}),
    animationFps: animationFpsOptions.includes(r.meta?.settings?.animationFps) ? r.meta.settings.animationFps : base.meta.settings.animationFps,
  };
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
  // 自愈：历史坏档可能出现负数可用点数（旧版本 cost 校验缺失）
  if (state.talents.points < 0) state.talents.points = 0;
  while (state.talents.presets.length < 3) {
    state.talents.presets.push({ name: "", talents: {}, keystones: {} });
  }
  state.prestige = { ...base.prestige, ...(r.prestige ?? {}) };
  state.prestige.purchases = { ...(r.prestige?.purchases ?? {}) };
  if (!Number.isFinite(r.prestige?.nextRequiredStage)) {
    const theoretical = Math.min(CONFIG.PRESTIGE.MAX_STAGE_REQUIREMENT, CONFIG.PRESTIGE.BASE_STAGE + Math.max(0, state.statistics?.totalPrestiges ?? r.statistics?.totalPrestiges ?? 0) * CONFIG.PRESTIGE.STAGE_PER_PRESTIGE);
    const reachable = Math.max(CONFIG.PRESTIGE.BASE_STAGE, Math.floor(Math.max(0, r.statistics?.allTimeMaxStage ?? 0) / 100) * 100);
    state.prestige.nextRequiredStage = Math.min(theoretical, reachable);
  }
  state.prestige.nextRequiredStage = Math.min(CONFIG.PRESTIGE.MAX_STAGE_REQUIREMENT, Math.max(CONFIG.PRESTIGE.BASE_STAGE, Math.floor(state.prestige.nextRequiredStage)));
  state.leap = { ...base.leap, ...(r.leap ?? {}) };
  state.leap.purchases = { ...(r.leap?.purchases ?? {}) };
  state.leap.nextRequiredStage = normalizeLeapStageRequirement(state.leap.nextRequiredStage);
  const rawAutoLeapRule = r.leap?.autoRule ?? {};
  const normalizeRuleWhole = (value: unknown, fallback: number, minimum: number) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(minimum, Math.floor(numeric)) : fallback;
  };
  state.leap.autoRule = {
    enabled: typeof rawAutoLeapRule.enabled === "boolean" ? rawAutoLeapRule.enabled : base.leap.autoRule.enabled,
    minStage: normalizeRuleWhole(rawAutoLeapRule.minStage, base.leap.autoRule.minStage, 0),
    minCores: normalizeRuleWhole(rawAutoLeapRule.minCores, base.leap.autoRule.minCores, 1),
    minTotalLeaps: normalizeRuleWhole(rawAutoLeapRule.minTotalLeaps, base.leap.autoRule.minTotalLeaps, 3),
  };
  state.laws = { ...base.laws, ...(r.laws ?? {}) };
  state.laws.purchases = { ...(r.laws?.purchases ?? {}) };
  state.nexus = { ...base.nexus, ...(r.nexus ?? {}) };
  state.nexus.purchases = { ...(r.nexus?.purchases ?? {}) };
  state.echo = { ...base.echo, ...(r.echo ?? {}) };
  state.echo.purchases = { ...(r.echo?.purchases ?? {}) };
  state.items = { ...base.items, ...(r.items ?? {}) };
  state.items.consumables = {};
  for (const id of Object.keys(CONFIG.CONSUMABLE_SHOP) as ItemId[]) {
    const rawCount = Number(r.items?.consumables?.[id] ?? 0);
    const count = Number.isFinite(rawCount)
      ? Math.min(CONFIG.CONSUMABLE_STACK_CAP, Math.max(0, Math.floor(rawCount)))
      : 0;
    if (count > 0) state.items.consumables[id] = count;
  }
  state.items.tools = { ...(r.items?.tools ?? {}) };
  state.items.toolLevels = { ...(r.items?.toolLevels ?? {}) };
  for (const id of Object.keys(CONFIG.TOOLS) as ToolId[]) {
    const rawLevel = Number(state.items.toolLevels[id] ?? 0);
    let level = Number.isFinite(rawLevel) ? Math.max(0, Math.floor(rawLevel)) : 0;
    if (level === 0 && state.items.tools[id]) level = id === "auto_upgrade" ? 2 : 1;
    level = Math.min(level, CONFIG.TOOLS[id].length);
    if (level > 0) {
      state.items.toolLevels[id] = level;
      state.items.tools[id] = true;
    } else {
      delete state.items.toolLevels[id];
    }
  }
  const metrics: AutoPrestigeMetric[] = ["stage", "energy", "multRatio"];
  const comparators: ThresholdComparator[] = ["gte", "lte", "eq"];
  const rawRule = r.items?.autoPrestigeRule ?? {};
  state.items.autoPrestigeRule = {
    enabled: typeof rawRule.enabled === "boolean" ? rawRule.enabled : base.items.autoPrestigeRule.enabled,
    metric: metrics.includes(rawRule.metric) ? rawRule.metric : base.items.autoPrestigeRule.metric,
    comparator: comparators.includes(rawRule.comparator) ? rawRule.comparator : base.items.autoPrestigeRule.comparator,
    value: Number.isFinite(rawRule.value) ? Math.max(0, rawRule.value) : base.items.autoPrestigeRule.value,
  };
  state.statistics = { ...base.statistics, ...(r.statistics ?? {}) };
  state.daily = { ...base.daily, ...(r.daily ?? {}) };
  state.daily.quests = Array.isArray(r.daily?.quests) ? r.daily.quests : [];
  state.daily.goldEarned = Array.isArray(r.daily?.goldEarned) ? r.daily.goldEarned : [0, 0];
  state.challenges = { ...base.challenges };
  let cycleChallengeTotal = 0;
  for (const id of Object.keys(base.challenges) as ChallengeId[]) {
    const source = r.challenges?.[id] ?? {};
    const rawReward = Number(source.cycleTalentRewarded ?? 0);
    const cycleTalentRewarded = Number.isFinite(rawReward)
      ? Math.min(CONFIG.CHALLENGE_TALENT_CAP_PER_CYCLE, Math.max(0, Math.floor(rawReward)))
      : 0;
    const remaining = Math.max(0, CONFIG.CHALLENGE_TALENT_TOTAL_CAP_PER_CYCLE - cycleChallengeTotal);
    const clampedReward = Math.min(cycleTalentRewarded, remaining);
    cycleChallengeTotal += clampedReward;
    state.challenges[id] = {
      best: Number.isFinite(source.best) ? Math.max(0, Math.floor(source.best)) : 0,
      claimed: Boolean(source.claimed),
      cycleBest: Number.isFinite(source.cycleBest) ? Math.max(0, Math.floor(source.cycleBest)) : 0,
      cycleTalentRewarded: clampedReward,
      runRewardClaimed: Boolean(source.runRewardClaimed),
    };
  }
  state.season = { ...base.season, ...(r.season ?? {}) };
  state.season.claimedTiers = Array.isArray(state.season.claimedTiers) ? state.season.claimedTiers : [];
  state.season.lastModifiers = Array.isArray(state.season.lastModifiers) ? state.season.lastModifiers : [];
  state.meta.activeModifiers = Array.isArray(state.meta.activeModifiers) ? state.meta.activeModifiers : [];
  state.meta.unlocks = Array.isArray(state.meta.unlocks) ? state.meta.unlocks : [];
  const inferredDiscoveries = [
    ...state.meta.unlocks,
    ...(state.statistics.totalPrestiges > 0 ? ["prestige"] : []),
    ...(state.leap.totalLeaps > 0 ? ["leap"] : []),
    ...(state.laws.totalRewrites > 0 ? ["lawRewrite"] : []),
    ...(state.nexus.unlocked || state.nexus.entered ? ["nexus"] : []),
    ...(state.echo.unlocked || state.echo.entered ? ["echo"] : []),
  ];
  state.meta.discoveries = Array.from(new Set([
    ...(Array.isArray(r.meta?.discoveries) ? r.meta.discoveries : []),
    ...inferredDiscoveries,
  ]));
  state.meta.achievements = Array.isArray(state.meta.achievements) ? state.meta.achievements : [];
  state.meta.milestonesSeen = Array.isArray(state.meta.milestonesSeen) ? state.meta.milestonesSeen : [];
  state.meta.lastScoreSubmit = {
    stage: state.meta.lastScoreSubmit?.stage,
    mag: state.meta.lastScoreSubmit?.mag,
    prestige: state.meta.lastScoreSubmit?.prestige,
    season: state.meta.lastScoreSubmit?.season,
  };
  const expectedLeapStartStage = leapStartStage(state);
  const expectedLeapStartLevel = Math.max(0, expectedLeapStartStage - 1);
  const prestigeAttackLevel = (state.prestige.purchases.startPower ?? 0) * CONFIG.PRESTIGE.SHOP.startPower.perLevel;
  const shouldRepairLegacyPrestigeStart = sourceVersion < 8
    && state.meta.activeChallenge === null
    && state.meta.activeModifiers.length === 0
    && expectedLeapStartStage > 1
    && state.prestige.totalEnergyEarned > 0;
  if (shouldRepairLegacyPrestigeStart) {
    // 一次性补偿旧版重构遗漏的跃迁基线：只提高，不降低玩家当前关卡或已购等级。
    state.combat.stage = Math.max(state.combat.stage, expectedLeapStartStage);
    state.player.upgrades = {
      attack: Math.max(state.player.upgrades.attack, expectedLeapStartLevel + prestigeAttackLevel),
      aspd: Math.max(state.player.upgrades.aspd, expectedLeapStartLevel),
      critChance: Math.max(state.player.upgrades.critChance, expectedLeapStartLevel),
      critDamage: Math.max(state.player.upgrades.critDamage, expectedLeapStartLevel),
      gold: Math.max(state.player.upgrades.gold, expectedLeapStartLevel),
    };
  }
  // Repair saves created by the old leap bug: stage x + 1 with every base upgrade left at zero.
  const isBrokenLeapStart = state.leap.totalLeaps > 0
    && expectedLeapStartStage > 1
    && state.combat.stage === expectedLeapStartStage
    && Object.values(state.player.upgrades).every((level) => level === 0);
  if (isBrokenLeapStart) {
    const level = expectedLeapStartStage - 1;
    state.player.upgrades = { attack: level, aspd: level, critChance: level, critDamage: level, gold: level };
  }
  state.meta.version = CONFIG.SAVE_VERSION;
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