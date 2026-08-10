// ============ 契约文件：全部数值常量集中于此（改一处即调难度） ============
import type { AffixStat, DailyQuestType, Rarity, SetBonusKind, ToolId } from "./types";
import type { BigTuple } from "./bignum";

export interface SetDef {
  id: string;
  name: string;
  slots: string[];
  bonus: { kind: SetBonusKind; value: number };
  desc: string;
}

export const CONFIG = {
  // 存档
  SAVE_KEY: "index-boundary-save",
  SAVE_VERSION: 2,
  SAVE_INTERVAL_MS: 10_000,
  TICK_RATE: 20, // 逻辑 TPS
  SAVE_BACKUP_SLOTS: 3,

  // 怪物与关卡
  HP_BASE: 10,
  HP_GROWTH: 1.18, // 可调 1.15~1.22
  GOLD_HP_EXPONENT: 0.92,
  BOSS_EVERY: 10,
  BOSS_HP_MULT: 20,
  BOSS_TIMER_SEC: 30,
  BOSS_SHIELD_HITS: 20, // 能量盾：前 N 次伤害固定为 1
  BOSS_TIME_DRAIN_MULT: 1.5, // 时空：Boss 计时流速 ×1.5
  // 特殊敌人（非 Boss 关，非极速推进时出现）
  SPECIAL_ENEMIES: {
    ELITE_CHANCE: 0.08, // 精英出现概率（roll < 此值且未命中宝箱怪）
    ELITE_HP_MULT: 12, // 精英生命倍数
    ELITE_GOLD_MULT: 6, // 精英金币倍数
    ELITE_AFFIX_COUNT: 1, // 精英词缀数量
    ELITE_DROP_LUCK: 0.5, // 精英必掉装备的稀有度加成
    MIMIC_CHANCE: 0.03, // 宝箱怪出现概率（roll < 此值）
    MIMIC_HP_MULT: 0.6, // 宝箱怪生命倍数（更容易击杀）
    MIMIC_GOLD_MULT: 25, // 宝箱怪金币倍数
    MIMIC_CORE_CHANCE: 0.15, // 宝箱怪掉落技能核心概率
  },

  // 基础属性
  BASE_CRIT_CHANCE: 0.05,
  BASE_CRIT_DAMAGE: 2,
  BASE_APS: 1,
  APS_SOFT_CAP: 10,

  // 连击
  COMBO_WINDOW_SEC: 3,
  COMBO_BONUS_PER_HIT: 0.0025,
  COMBO_CAP: 100,
  COMBO_AUTO_FACTOR: 0.5, // 自动攻击连击效率折半

  // 碾压 / 溢出 / 跳关
  CRUSH_THRESHOLD: 100, // 单次伤害 ≥ 100× 敌人最大生命
  CRUSH_GOLD_BASE_MULT: 1,
  CRUSH_GOLD_CAP: 5,
  OVERFLOW_EXPONENT: 0.5,
  OVERFLOW_FIRST_CLEAR_ONLY: true,
  SKIP_AFTER_CRUSH_STREAK: 10,
  SKIP_BASE: 10,

  // 升级（成本 = Base × growth^Lv × rebaseMult^⌊Lv/rebaseEvery⌋）
  UPGRADES: {
    attack: {
      baseCost: 10, growth: 1.16, rebaseEvery: 25, rebaseMult: 5,
      effectPerLevel: 1.12,
      milestones: [
        { level: 10, mult: 2 },
        { level: 25, mult: 3 },
        { level: 50, mult: 5 },
        { level: 100, mult: 10 },
      ],
      milestoneRepeatEvery: 100, // 100 级后每 100 级再 ×10
    },
    aspd: { baseCost: 15, growth: 1.3, rebaseEvery: 0, rebaseMult: 1, effectPerLevel: 1.08 },
    critChance: { baseCost: 30, growth: 1.35, rebaseEvery: 0, rebaseMult: 1, perLevel: 0.008 },
    critDamage: { baseCost: 25, growth: 1.28, rebaseEvery: 0, rebaseMult: 1, perLevel: 0.15 },
    gold: { baseCost: 10, growth: 1.22, rebaseEvery: 25, rebaseMult: 5, perLevel: 0.1 },
  } as const,

  // 装备
  EQUIPMENT: {
    SLOTS: ["weapon", "core", "engine", "charm", "module", "beacon", "relic"] as const,
    MAX_ENHANCE: 10,
    ENHANCE_MAIN_MULT: 0.15, // 每级主属性 +15%
    RARITIES: {
      common: { mainMult: 1.5, affixCount: 0, shards: 1, weight: 55, dropMinStage: 1 },
      fine: { mainMult: 2.2, affixCount: 1, shards: 3, weight: 27, dropMinStage: 1 },
      rare: { mainMult: 3.5, affixCount: 2, shards: 8, weight: 13, dropMinStage: 25 },
      epic: { mainMult: 6, affixCount: 3, shards: 20, weight: 4, dropMinStage: 60 },
      legendary: { mainMult: 12, affixCount: 4, shards: 50, weight: 1, dropMinStage: 120 },
      mythic: { mainMult: 22, affixCount: 5, shards: 120, weight: 0.35, dropMinStage: 220 },
      aberrant: { mainMult: 45, affixCount: 6, shards: 320, weight: 0.08, dropMinStage: 320 },
      singularity: { mainMult: 90, affixCount: 7, shards: 900, weight: 0.015, dropMinStage: 450 },
    } as Record<Rarity, { mainMult: number; affixCount: number; shards: number; weight: number; dropMinStage: number }>,
    BASE_DROP_CHANCE: 0.015,
    DROP_STAGE_TIER: 25, // 每 25 关装备强度一档
    INVENTORY_CAP: 40,
    REFORGE_COST_BASE: 4, // 重铸费用 = base × 碎片 × (1+副词条数)
    CRAFT_COST_MULT: 10, // 制作费用 = mult × 稀有度碎片
    ENHANCE_COST_BASE: 5, // 强化费用 = base × shards × (level+1)^1.5
    // 超频：+10 后重置强化等级，提升基础倍率并追加 1 条副词条
    OVERCLOCK: {
      MAX: 3,
      MAIN_BONUS: 0.2, // 每次主属性 ×(1+0.2)
      COST_BASE: 12, // 费用 = base × 碎片 × (1 + 当前超频次数)
      AFFIX_CAP: 8, // 副词条上限（含超频追加）
    },
    // 副词条数值区间（% 或 倍率；% 存小数，独立乘区存 × 值）
    AFFIX_RANGES: {
      atkPct: { min: 0.05, max: 0.4, kind: "pct" },
      aspdPct: { min: 0.03, max: 0.2, kind: "pct" },
      critRate: { min: 0.02, max: 0.15, kind: "pct" },
      critDmg: { min: 0.1, max: 0.8, kind: "pct" },
      goldPct: { min: 0.05, max: 0.4, kind: "pct" },
      bossDmg: { min: 0.1, max: 0.6, kind: "mult" },
      skillDmg: { min: 0.1, max: 0.6, kind: "mult" },
      overflowEff: { min: 0.05, max: 0.3, kind: "pct" },
      clickDmg: { min: 0.1, max: 0.5, kind: "mult" },
      comboCap: { min: 10, max: 50, kind: "flat" },
      comboWindow: { min: 0.5, max: 2, kind: "flat" },
      everyNAttack: { min: 0.1, max: 0.6, kind: "mult" },
      skillCd: { min: 0.02, max: 0.12, kind: "pct" },
      skillDuration: { min: 0.05, max: 0.2, kind: "pct" },
    } as Record<AffixStat, { min: number; max: number; kind: "pct" | "mult" | "flat" }>,
    LEGENDARY_POOL: [
      { label: "Boss 杀手", mult: 2 },
      { label: "溢出协议", mult: 1.5 },
      { label: "攻速过载", mult: 1.8 },
      { label: "暴击法则", mult: 1.6 },
      { label: "技能放大器", mult: 1.7 },
    ],
    MAIN_POOL: {
      weapon: ["atkPct"],
      core: ["critDmg"],
      engine: ["aspdPct"],
      charm: ["goldPct", "clickDmg"],
      module: ["skillDmg", "critRate"],
      beacon: ["bossDmg", "overflowEff"],
      relic: ["goldPct", "clickDmg"],
    } as Record<string, AffixStat[]>,
    // 套装：凑齐 slots 即生效（2 件套，跨槽组合）
    SETS: [
      { id: "overclock_set", name: "超频协议", slots: ["weapon", "engine"], bonus: { kind: "aspdMult", value: 0.25 }, desc: "攻速独立 ×1.25" },
      { id: "crit_set", name: "临界法则", slots: ["core", "charm"], bonus: { kind: "critDmgAdd", value: 0.5 }, desc: "暴击伤害 +50%" },
      { id: "gold_set", name: "数据洪流", slots: ["engine", "charm"], bonus: { kind: "goldPool", value: 0.5 }, desc: "金币 +50%" },
      { id: "boss_set", name: "猎杀协议", slots: ["weapon", "core"], bonus: { kind: "bossDmgMult", value: 0.5 }, desc: "Boss 伤害独立 ×1.5" },
    ] as SetDef[],
  },

  // 技能
  SKILLS: {
    overclock: {
      name: "超频", desc: "10 秒内攻击速度 ×5",
      cooldown: 60, duration: 10,
      levelEffect: { multPerLevel: 1, multCap: 10, cdReducePerLevel: 2 },
    },
    critical_strike: {
      name: "临界打击", desc: "下一次攻击 ×100 且必超暴击",
      cooldown: 45, duration: 0,
      levelEffect: { multPerLevel: 20, cdReducePerLevel: 2 },
    },
    gold_collapse: {
      name: "金币坍缩", desc: "15 秒内金币 ×10",
      cooldown: 90, duration: 15,
      levelEffect: { multPerLevel: 2, multCap: 20, cdReducePerLevel: 3 },
    },
    singularity_cannon: {
      name: "奇点炮", desc: "立即造成当前 DPS ×300 伤害",
      cooldown: 120, duration: 0,
      levelEffect: { multPerLevel: 100, cdReducePerLevel: 4 },
    },
    emp_burst: {
      name: "电磁脉冲", desc: "立即造成 DPS×60 伤害，Boss 剩余时间 +8 秒",
      cooldown: 45, duration: 0, empFreezeSec: 8,
      levelEffect: { multPerLevel: 20, cdReducePerLevel: 1 },
    },
    time_freeze: {
      name: "时空冻结", desc: "8 秒内攻速 ×1.5，Boss 计时暂停",
      cooldown: 90, duration: 8,
      levelEffect: { multPerLevel: 0.15, multCap: 3, cdReducePerLevel: 2 },
    },
    overload_combo: {
      name: "过载连击", desc: "12 秒内连击上限 +40，连击伤害 ×1.5",
      cooldown: 60, duration: 12, comboDmgMult: 1.5,
      levelEffect: { multPerLevel: 10, multCap: 80, cdReducePerLevel: 1.5 },
    },
    data_flood: {
      name: "数据洪流", desc: "立即获得当前关卡金币 ×300（受金币倍率）",
      cooldown: 75, duration: 0,
      levelEffect: { multPerLevel: 100, cdReducePerLevel: 2 },
    },
    charged_hit: {
      name: "充能一击", desc: "下一次攻击 ×250",
      cooldown: 50, duration: 0,
      levelEffect: { multPerLevel: 50, cdReducePerLevel: 1 },
    },
    split_matrix: {
      name: "分裂矩阵", desc: "10 秒内最终伤害 ×1.25",
      cooldown: 70, duration: 10,
      levelEffect: { multPerLevel: 0.1, multCap: 0.75, cdReducePerLevel: 1.5 },
    },
    quantum_replay: {
      name: "量子重演", desc: "所有其他技能冷却 -25 秒",
      cooldown: 120, duration: 0,
      levelEffect: { multPerLevel: 5, cdReducePerLevel: 3 },
    },
    final_protocol: {
      name: "终焉协议", desc: "20 秒内攻击 ×3、金币 ×2、攻速 -50%",
      cooldown: 150, duration: 20, goldMultWhileActive: 2, aspdMultWhileActive: 0.5,
      levelEffect: { multPerLevel: 0.5, multCap: 6, cdReducePerLevel: 3 },
    },
  } as Record<string, { name: string; desc: string; cooldown: number; duration: number; levelEffect: { multPerLevel: number; multCap?: number; cdReducePerLevel: number }; empFreezeSec?: number; comboDmgMult?: number; goldMultWhileActive?: number; aspdMultWhileActive?: number }>,
  SKILL_CORE_COSTS: [1, 2, 3, 5, 8, 13, 21, 34], // 升级到下一级所需核心（累计）
  // 被动技能（技能核心升级，独立成长线）
  SKILL_PASSIVES: {
    rhythm: { name: "节律协议", desc: "每级 +5% 自动攻速（独立乘区）", icon: "🎵", kind: "aspd", effectPerLevel: 0.05 },
    focus: { name: "聚能协议", desc: "每级 +1% 暴击率", icon: "🎯", kind: "critChance", effectPerLevel: 0.01 },
    greed: { name: "贪婪协议", desc: "每级 +3% 金币（加法池）", icon: "🪙", kind: "gold", effectPerLevel: 0.03 },
  } as Record<string, { name: string; desc: string; icon: string; kind: "aspd" | "critChance" | "gold"; effectPerLevel: number }>,
  SKILL_CAST_WALL_SEC: 6, // 模拟器：击杀时间超过该值视为卡墙，才释放爆发技能
  // 挑战模式（可选难度修饰符 + 一次性通关奖励）
  CHALLENGES: {
    no_crit: { name: "无暴击", desc: "暴击率恒为 0——攻速 / 连击 / 技能流的主场", icon: "🚫", target: 200, rewardCores: 5, rewardTalent: 1 },
    slow_universe: { name: "慢速宇宙", desc: "攻速 ×0.5——考验单发伤害与爆发窗口", icon: "🐢", target: 200, rewardCores: 5, rewardTalent: 1 },
    poverty: { name: "贫困", desc: "金币 ×0.5——考验资源效率与跳关能力", icon: "🪙", target: 150, rewardCores: 5, rewardTalent: 1 },
  } as Record<string, { name: string; desc: string; icon: string; target: number; rewardCores: number; rewardTalent: number }>,

  // 每日任务（轻量：3 个 / 天，跨天重置，仅在线进度）
  DAILY: {
    QUESTS_PER_DAY: 3,
    POOL: [
      { id: "kill", type: "kills", label: "击败异常数据体", targets: [300, 800, 2000], rewardCores: 2 },
      { id: "boss", type: "bossKills", label: "击败 Boss", targets: [5, 10, 20], rewardCores: 3 },
      { id: "skill", type: "skillCasts", label: "释放技能", targets: [40, 100, 250], rewardCores: 2 },
      { id: "gold", type: "gold", label: "当日累计金币达到", targets: [8, 10, 12], rewardCores: 3 },
      { id: "stage", type: "stageReach", label: "推进关卡到", targets: [150, 300, 600], rewardCores: 2 },
    ] as { id: string; type: DailyQuestType; label: string; targets: number[]; rewardCores: number }[],
  },  // 永久工具（金币购买，金币沉淀口）
  TOOLS: {
    auto_upgrade: [1, 3], // 1000
    auto_boss: [1, 5], // 100k
    auto_breakdown: [1, 6], // 1M
    combat_recorder: [1, 7], // 10M
    auto_skill: [1, 8], // 100M
    auto_equip: [1, 9], // 1e9
  } as Record<ToolId, BigTuple>,

  // 天赋
  TALENT_POINTS_FROM_BOSS_FIRST_KILL: 1,
  TALENT_POINTS_FROM_ACHIEVEMENT: 1,

  // 道具
  CONSUMABLE_DURATION_SEC: 300, // 超频芯片/黄金协议 5 分钟
  CONSUMABLE_STACK_CAP: 99,

  // 重构（第一层重置）
  PRESTIGE: {
    THRESHOLD: 20, // log10(总伤) 阈值
    ENERGY_EXP: 1.7,
    GLOBAL_EXP: 2, // (1+E)^2
    SHOP: {
      startPower: { baseCost: 10, costGrowth: 2, perLevel: 10, max: 50, label: "起始力量", desc: "重构后起始攻击等级 +10" },
      goldKeep: { baseCost: 20, costGrowth: 2, perLevel: 0.05, max: 10, label: "资源保留", desc: "重构后保留 5% 金币（上限 50%）" },
      fastSkip: { baseCost: 15, costGrowth: 2, perLevel: 10, max: 20, label: "高速推进", desc: "自动跳关基数 +10" },
      startSkill: { baseCost: 40, costGrowth: 1, perLevel: 1, max: 1, label: "初始技能", desc: "开局解锁 1 个技能" },
      singularityAmp: { baseCost: 100, costGrowth: 3, perLevel: 1, max: 5, label: "奇点放大", desc: "奇点能量效果 ×2（能量指数 +1）" },
    },
  },

  // 解锁节奏（关卡）
  UNLOCKS: [
    { key: "auto_attack", stage: 5, label: "自动攻击" },
    { key: "boss", stage: 10, label: "Boss 战" },
    { key: "crit", stage: 20, label: "暴击" },
    { key: "aspd_upgrade", stage: 8, label: "攻速升级" },
    { key: "equipment", stage: 50, label: "装备系统" },
    { key: "skills", stage: 100, label: "技能系统" },
    { key: "talents", stage: 150, label: "天赋系统" },
    { key: "prestige", stage: 350, label: "重构" },
    { key: "achievements", stage: 30, label: "成就" },
  ] as { key: string; stage: number; label: string }[],

  // 离线
  OFFLINE: {
    MAX_HOURS: 8,
    EFFICIENCY: 0.5,
    WALL_KILL_TIME_SEC: 3, // 击杀时间 > 3s 视为撞墙
    MAX_DROPS: 20,
    MAX_PAYOUT_SEC: 8 * 3600,
  },

  // 里程碑（数量级）
  MILESTONES: [3, 6, 9, 12, 15, 30, 50, 100, 200, 1000] as number[],
  MILESTONE_MULT_PER_STEP: 0.1, // 每个里程碑 +10% 全局倍率（独立乘区累计）

  // 排行榜
  LEADERBOARD: {
    SUBMIT_INTERVAL_MS: 10 * 60 * 1000, // 每 10 分钟可再提交
    RUN_ID_PREFIX: "ib",
  },

  // 性能
  MAX_DAMAGE_NUMBERS: 30,
} as const;

export function milestoneCountFor(e: number): number {
  return CONFIG.MILESTONES.filter((m) => e >= m).length;
}

export function milestoneMultFor(e: number): number {
  return Math.pow(1 + CONFIG.MILESTONE_MULT_PER_STEP, milestoneCountFor(e));
}