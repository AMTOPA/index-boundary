// ============ 契约文件：只读，修改需主 Agent 审批 ============
import type { Big, BigTuple } from "./bignum";

export type UpgradeId = "attack" | "aspd" | "critChance" | "critDamage" | "gold";
export type Rarity = "common" | "fine" | "rare" | "epic" | "legendary";
export type EquipSlot = "weapon" | "core" | "engine";
export type SkillId = "overclock" | "critical_strike" | "gold_collapse" | "singularity_cannon";
export type TreeId = "destruction" | "automation";
export type ItemId = "overclock_chip" | "gold_protocol" | "singularity_battery";
export type ToolId = "auto_upgrade" | "auto_boss" | "auto_breakdown" | "combat_recorder";
export type PrestigeUpgradeId = "startPower" | "goldKeep" | "fastSkip" | "startSkill" | "singularityAmp";
export type BossAffix = "armor" | "regen" | "antiCrit" | "rage";
export type WorldId = "data_wastes" | "mech_city";
export type ScoreSubmitKind = "stage" | "mag" | "prestige";

// 词条属性（加池型用 % 表达，独立乘区用 × 表达）
export type AffixStat =
  | "atkPct"
  | "aspdPct"
  | "critRate"
  | "critDmg"
  | "goldPct"
  | "bossDmg"
  | "skillDmg"
  | "overflowEff"
  | "clickDmg"
  | "comboCap"
  | "comboWindow"
  | "everyNAttack";

export interface EquipInstance {
  uid: string;
  slot: EquipSlot;
  rarity: Rarity;
  level: number; // 强化等级 0~10
  main: { stat: AffixStat; mult: number }; // 主词条：倍率型（如攻击 ×2.2）
  affixes: { stat: AffixStat; value: number }[]; // 副词条：加池% 或 独立×
  legendary?: { label: string; mult: number }; // 传说专属独立乘区词条
}

export interface SkillInstance {
  id: SkillId;
  level: number;
  cdRemaining: number; // 秒
  activeUntil: number; // 秒（引擎时间）
  active: boolean;
}

export interface PlayerState {
  upgrades: Record<UpgradeId, number>;
  gold: BigTuple;
  clickCount: number;
}

export interface CombatState {
  stage: number;
  enemyHp: BigTuple;
  enemyMaxHp: BigTuple;
  isBoss: boolean;
  bossAffixes: BossAffix[];
  bossTimer: number; // 剩余秒；非 Boss 时为 -1
  combo: number;
  comboTimer: number;
  crushStreak: number;
  skipMode: boolean;
  lastHitWasCrit: boolean;
  lastHitWasSuper: boolean;
  lastHitWasCrush: boolean;
}

export interface EquipmentState {
  slots: Partial<Record<EquipSlot, EquipInstance>>;
  inventory: EquipInstance[];
  fragments: BigTuple;
  autoBreakdown: Rarity | null; // null=不自动分解；否则分解 ≤ 该稀有度
}

export interface SkillState {
  actives: SkillInstance[];
  passiveLevel: number;
  cores: BigTuple;
}

export interface TalentState {
  points: number;
  allocations: Record<string, number>; // nodeId -> 已投点数
  keystones: Partial<Record<TreeId, string>>; // treeId -> keystone nodeId
}

export interface PrestigeState {
  energy: number;
  totalEnergyEarned: number;
  purchases: Partial<Record<PrestigeUpgradeId, number>>;
}

export interface ItemState {
  consumables: Partial<Record<ItemId, number>>;
  tools: Partial<Record<ToolId, boolean>>;
}

export interface StatisticsState {
  totalDamage: BigTuple; // 全时总伤（里程碑 / 排行榜）
  runDamage: BigTuple; // 本局总伤（重构结算用，重构后清零）
  totalGold: BigTuple;
  totalKills: number;
  totalBossKills: number;
  highestHit: BigTuple;
  totalClicks: number;
  totalCrits: number;
  totalSuperCrits: number;
  totalPrestiges: number;
  totalPlayTimeMs: number;
  totalOfflineMs: number;
  allTimeMaxStage: number;
}

export interface MetaState {
  createdAt: number;
  lastSeenAt: number;
  rngState: number;
  version: number;
  unlocks: string[]; // 已解锁系统 id（stage-5 等）
  achievements: string[];
  milestonesSeen: number[]; // 已庆祝的数量级
  settings: { sound: boolean; reduceMotion: boolean };
  lastScoreSubmit: Record<ScoreSubmitKind, { runId: string; at: number } | undefined>;
  cloudSyncedAt: number;
}

export interface GameState {
  meta: MetaState;
  player: PlayerState;
  combat: CombatState;
  equipment: EquipmentState;
  skills: SkillState;
  talents: TalentState;
  prestige: PrestigeState;
  items: ItemState;
  statistics: StatisticsState;
  // 运行期（不持久化）的瞬时数据放 engine 层，不入存档
}

// 引擎事件（引擎 → UI）
export type GameEvent =
  | { type: "hit"; damage: BigTuple; crit: boolean; superCrit: boolean; crush: boolean; isClick: boolean }
  | { type: "bossFail"; stage: number }
  | { type: "kill"; stage: number; boss: boolean }
  | { type: "crit"; super: boolean }
  | { type: "crush"; stage: number }
  | { type: "bossSpawn"; affixes: BossAffix[] }
  | { type: "bossKill" }
  | { type: "unlock"; key: string; label: string }
  | { type: "milestone"; magnitude: number }
  | { type: "prestige"; energyGained: number }
  | { type: "drop"; rarity: Rarity; slot: EquipSlot }
  | { type: "achievement"; id: string }
  | { type: "levelUp"; upgrade: UpgradeId; level: number }
  | { type: "skillCast"; skill: SkillId }
  | { type: "offline"; seconds: number; gold: BigTuple };

export type GameEventListener = (event: GameEvent) => void;

// 派生属性（不持久化，每次计算）
export interface DerivedStats {
  baseAttack: Big;
  attackMult: Big;
  critChance: number;
  critDamage: number;
  panelAps: number;
  effectiveAps: number;
  goldMult: Big;
  clickMult: Big;
  comboBonus: number;
  damagePerHit: Big;
  dps: Big;
  bossDmgMult: Big;
  skillDmgMult: Big;
  overflowEffMult: Big;
  dropMult: Big;
  talentMult: Big;
  prestigeMult: Big;
  globalMult: Big;
  critLayersExtra: number;
  offlineEffTalent: number;
  skipBaseTalent: number;
  hasKeystone: string[];
  everyNAttack: number;
  comboCapAdd: number;
  comboWindowAdd: number;
}