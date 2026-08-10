// ============ 契约文件：只读，修改需主 Agent 审批 ============
import type { Big, BigTuple } from "./bignum";

export type UpgradeId = "attack" | "aspd" | "critChance" | "critDamage" | "gold";
export type Rarity = "common" | "fine" | "rare" | "epic" | "legendary" | "mythic" | "aberrant" | "singularity";
export type EquipSlot = "weapon" | "core" | "engine" | "charm" | "module" | "beacon" | "relic";
export type SkillId = "overclock" | "critical_strike" | "gold_collapse" | "singularity_cannon" | "emp_burst" | "time_freeze" | "overload_combo" | "data_flood" | "charged_hit" | "split_matrix" | "quantum_replay" | "final_protocol";
export type PassiveId = "rhythm" | "focus" | "greed";
export type ChallengeId = "no_crit" | "slow_universe" | "poverty" | "durable" | "skill_slow";
export type ChallengePermKind = "click" | "aspd" | "gold" | "boss" | "skill";
export type SeasonTierId = "bronze" | "silver" | "gold";
export type DailyQuestType = "kills" | "bossKills" | "skillCasts" | "gold" | "stageReach";
export type TreeId = "destruction" | "automation" | "greed" | "singularity";
export type ItemId = "overclock_chip" | "gold_protocol" | "singularity_battery";
export type ToolId = "auto_upgrade" | "auto_boss" | "auto_breakdown" | "combat_recorder" | "auto_skill" | "auto_equip" | "auto_prestige";
export type PrestigeUpgradeId = "startPower" | "goldKeep" | "fastSkip" | "startSkill" | "singularityAmp";
export type LeapUpgradeId = "lawExponent" | "startStage" | "allStats" | "newWorld" | "autoLeap";
export type LawId = "critExp" | "goldBoost" | "apsCap" | "goldToDmg";
export type BossAffix = "armor" | "regen" | "antiCrit" | "rage" | "harden" | "deflect" | "time" | "shield" | "void";
export type EnemyKind = "normal" | "elite" | "mimic";
export type VoidTarget = "crit" | "click" | "skill" | "gold";
export type SetBonusKind = "aspdMult" | "critDmgAdd" | "goldPool" | "bossDmgMult";
export type WorldId = "data_wastes" | "mech_city" | "star_factory" | "black_hole" | "singularity_furnace" | "law_terminus";
export type ScoreSubmitKind = "stage" | "mag" | "prestige" | "season";

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
  | "everyNAttack"
  | "skillCd"
  | "skillDuration";

export interface EquipInstance {
  uid: string;
  slot: EquipSlot;
  rarity: Rarity;
  level: number; // 强化等级 0~10
  main: { stat: AffixStat; mult: number }; // 主词条：倍率型（如攻击 ×2.2）
  affixes: { stat: AffixStat; value: number }[]; // 副词条：加池% 或 独立×
  legendary?: { label: string; mult: number }; // 传说专属独立乘区词条
  overclock?: number; // 超频次数（+10 后重置强化并提升基础倍率）
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
  enemyKind: EnemyKind; // special enemy kind: normal | elite | mimic
  bossShieldHits: number; // shield affix: remaining absorbed hits
  bossVoidTarget: VoidTarget | null; // void affix: nullified multiplier bucket
}

export interface EquipmentState {
  slots: Partial<Record<EquipSlot, EquipInstance>>;
  inventory: EquipInstance[];
  fragments: BigTuple;
  autoBreakdown: Rarity | null; // null=不自动分解；否则分解 ≤ 该稀有度
}

export interface SkillState {
  actives: SkillInstance[];
  passives: Record<PassiveId, number>; // 被动技能等级（节律/聚能/贪婪）
  cores: BigTuple;
}

export interface BuildPreset {
  name: string;
  talents: Record<string, number>; // nodeId -> 点数快照
  keystones: Partial<Record<TreeId, string>>;
}

export interface TalentState {
  points: number;
  allocations: Record<string, number>; // nodeId -> 已投点数
  keystones: Partial<Record<TreeId, string>>; // treeId -> keystone nodeId
  presets: BuildPreset[]; // 构筑预设槽（3 个）
}

export interface DailyQuest {
  id: string;
  type: DailyQuestType;
  target: number; // kills/boss/skill 为次数；gold 为数量级 log10；stageReach 为关卡数
  progress: number;
  claimed: boolean;
}

export interface DailyState {
  date: string; // YYYY-MM-DD
  quests: DailyQuest[];
  goldEarned: BigTuple; // 当日在线金币累计
  bestStage: number; // 当日最高关卡
}

export interface ChallengeProgress {
  best: number; // 挑战模式下最高到达关卡
  claimed: boolean; // 通关奖励是否已领取
}

export interface SeasonState {
  unlocked: boolean; // 试炼赛季是否已解锁（通关全部基础挑战）
  bestScore: number; // 历史最高赛季分
  bestStage: number; // 历史最高赛季关
  claimedTiers: SeasonTierId[]; // 已领取的档位
  lastModifiers: ChallengeId[]; // 上次赛季使用的修饰符组合（UI 记忆）
}

export interface PrestigeState {
  energy: number;
  totalEnergyEarned: number;
  purchases: Partial<Record<PrestigeUpgradeId, number>>;
}

export interface LeapState {
  cores: number;
  totalCoresEarned: number;
  totalLeaps: number;
  lastLeapMaxStage: number; // 上次跃迁时的最大关卡（用于 ×2 判定）
  purchases: Partial<Record<LeapUpgradeId, number>>;
}

export interface LawState {
  shards: number; // 法则碎片（第三层货币）
  totalShardsEarned: number;
  totalRewrites: number;
  lastRewriteMaxStage: number; // 上次法则重写时的最大关卡（×2 判定）
  purchases: Partial<Record<LawId, number>>;
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
  totalEliteKills: number;
  totalMimicKills: number;
  highestHit: BigTuple;
  totalClicks: number;
  totalCrits: number;
  totalSuperCrits: number;
  totalSkillCasts: number;
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
  activeChallenge: ChallengeId | null; // 当前生效的单挑战修饰符
  activeModifiers: ChallengeId[]; // 试炼赛季当前生效的修饰符组合（互斥于 activeChallenge）
}

export interface GameState {
  meta: MetaState;
  player: PlayerState;
  combat: CombatState;
  equipment: EquipmentState;
  skills: SkillState;
  talents: TalentState;
  prestige: PrestigeState;
  leap: LeapState;
  laws: LawState;
  items: ItemState;
  statistics: StatisticsState;
  daily: DailyState;
  challenges: Record<ChallengeId, ChallengeProgress>;
  season: SeasonState;
  // 运行期（不持久化）的瞬时数据放 engine 层，不入存档
}

// 引擎事件（引擎 → UI）
export type GameEvent =
  | { type: "hit"; damage: BigTuple; crit: boolean; superCrit: boolean; crush: boolean; isClick: boolean }
  | { type: "bossFail"; stage: number }
  | { type: "kill"; stage: number; boss: boolean; kind: EnemyKind }
  | { type: "crit"; super: boolean }
  | { type: "crush"; stage: number }
  | { type: "bossSpawn"; affixes: BossAffix[] }
  | { type: "eliteSpawn"; affixes: BossAffix[] }
  | { type: "mimicSpawn" }
  | { type: "bossKill" }
  | { type: "unlock"; key: string; label: string }
  | { type: "milestone"; magnitude: number }
  | { type: "prestige"; energyGained: number }
  | { type: "leap"; cores: number }
  | { type: "lawRewrite"; shards: number }
  | { type: "drop"; rarity: Rarity; slot: EquipSlot }
  | { type: "autoBreakdown"; count: number; shards: number }
  | { type: "achievement"; id: string }
  | { type: "levelUp"; upgrade: UpgradeId; level: number }
  | { type: "skillCast"; skill: SkillId }
  | { type: "offline"; seconds: number; gold: BigTuple }
  | { type: "challengeStart"; id: ChallengeId }
  | { type: "challengeClaim"; id: ChallengeId }
  | { type: "seasonStart"; modifiers: ChallengeId[] }
  | { type: "seasonClaim"; tier: SeasonTierId }
  | { type: "dailyClaim"; id: string };

export type GameEventListener = (event: GameEvent) => void;

// 派生属性（不持久化，每次计算）
export interface DerivedStats {
  baseAttack: Big;
  attackMult: Big;
  critChance: number;
  critDamage: Big;
  panelAps: number;
  effectiveAps: number;
  apsCapAdd: number;
  apsCapTalent: number;
  goldMult: Big;
  clickMult: Big;
  comboBonus: number;
  damagePerHit: Big;
  dps: Big;
  bossDmgMult: Big;
  skillDmgMult: Big;
  skillCdMult: number; // 技能冷却缩减（乘法）
  skillDurationMult: number; // 技能持续时间（乘法）
  overflowEffMult: Big;
  dropMult: Big;
  talentMult: Big;
  prestigeMult: Big;
  globalMult: Big;
  critLayersExtra: number;
  leapGlobalMult: Big; // 世界核心全属性全局倍率
  hpGrowth: number; // 生效的怪物 HP 指数基数（法则指数/奇点影响）
  bossHpMult: Big; // Boss 生命倍率（深渊豪赌等）
  enemyHpMult: number; // 挑战修饰符：敌人生命倍率（顽石外壳 ×2）
  bossGoldMult: Big; // Boss 金币倍率（深渊豪赌等）
  goldToDmgMult: Big; // 金币转伤（法则解锁的独立乘区）
  offlineEffTalent: number;
  skipBaseTalent: number;
  shardGainMult: number;
  reforgeCostMult: number;
  craftCostMult: number;
  hasKeystone: string[];
  everyNAttack: number;
  comboCapAdd: number;
  comboWindowAdd: number;
}