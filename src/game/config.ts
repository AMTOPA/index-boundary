// ============ 契约文件：全部数值常量集中于此（改一处即调难度） ============
import type { AffixStat, ChallengeId, ChallengePermKind, DailyQuestType, EchoUpgradeId, ItemId, LawId, LeapUpgradeId, NexusUpgradeId, Rarity, SeasonTierId, SetBonusKind, ToolId } from "./types";
import type { BigTuple } from "./bignum";

export interface ConsumableShopConfig {
  gold: BigTuple;
  minStage?: number;
  requiredUnlock?: string;
  goldFraction: number;
}

export interface ToolTierConfig {
  gold: BigTuple;
  energy?: number;
  minStage?: number;
  minPrestiges?: number;
  requiredTalent?: string;
  requiredUnlock?: string;
  label: string;
  desc: string;
}

export interface AutoUpgradeTierConfig {
  intervalSec: number;
  reevaluations: number;
  maxBatch: number;
}

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
  SAVE_VERSION: 8,
  SAVE_INTERVAL_MS: 10_000,
  TICK_RATE: 20, // 逻辑 TPS
  SAVE_BACKUP_SLOTS: 3,

  // 怪物与关卡
  HP_BASE: 10,
  HP_GROWTH: 1.18,
  HP_SOFT_START: 1000, // 深度软化起点：1000 关后怪物 HP 指数有界逼近下限（防止深推无限墙）
  HP_SOFT_FLOOR: 1.05, // 软化下限（与 hpGrowth 全局下限一致）
  HP_SOFT_DECAY: 700, // 软化速度：每 +700 关向 1.05 逼近一半 // 可调 1.15~1.22
  GOLD_HP_EXPONENT: 0.92,
  CHALLENGE_DISABLE_PRESTIGE: true, // 挑战/赛季进行中禁用重构（奇点能量）全局倍率
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
  CRIT_CHANCE_UPGRADE_CAP: 0.92, // 暴击率升级的渐近软上限（升级单独到不了 100%，需装备/天赋/被动补齐）
  CRIT_OVERFLOW_TO_CRITDMG: 0.5, // 总暴击率每溢出 100% → 暴击伤害 ×(1+0.5)，有界转化，避免概率>100% 无意义
  BASE_APS: 1,
  APS_SOFT_CAP: 10,
  UPGRADE_NEAR_CAP_RATIO: 0.005, // 升级下一级有效收益 < 0.5% 视为近上限（隐藏购买按钮）

  // 连击
  COMBO_WINDOW_SEC: 3,
  COMBO_BONUS_PER_HIT: 0.0025,
  COMBO_DAMAGE_CAP: 100, // Preserve the original damage balance while the visible streak can grow higher.
  COMBO_CAP: 400, // Equipment and Overload Combo can extend this ceiling beyond 500.
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
    critChance: { baseCost: 15, growth: 1.25, rebaseEvery: 0, rebaseMult: 1, perLevel: 0.012 },
    critDamage: {
      baseCost: 25, growth: 1.28, rebaseEvery: 0, rebaseMult: 1,
      perLevel: 0.22,
      milestones: [
        { level: 75, mult: 1.5 },
        { level: 140, mult: 2 },
        { level: 280, mult: 3 },
        { level: 520, mult: 5 },
      ],
      milestoneRepeatEvery: 200, // 200 级后每 200 级再 ×5
    },
    gold: { baseCost: 15, growth: 1.38, rebaseEvery: 25, rebaseMult: 5, perLevel: 0.03 },
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
    no_crit: { name: "无暴击", desc: "暴击率恒为 0——攻速 / 连击 / 技能流的主场", icon: "🚫", target: 200, rewardCores: 5, rewardTalent: 1, perm: { label: "点击伤害 ×1.2", kind: "click", mult: 1.2 } },
    slow_universe: { name: "慢速宇宙", desc: "攻速 ×0.5——考验单发伤害与爆发窗口", icon: "🐢", target: 200, rewardCores: 5, rewardTalent: 1, perm: { label: "攻击速度 ×1.2", kind: "aspd", mult: 1.2 } },
    poverty: { name: "贫困", desc: "金币 ×0.5——考验资源效率与跳关能力", icon: "🪙", target: 150, rewardCores: 5, rewardTalent: 1, perm: { label: "金币收益 ×1.2", kind: "gold", mult: 1.2 } },
    durable: { name: "顽石外壳", desc: "敌人生命 ×2——考验单发伤害与持续输出上限", icon: "🛡️", target: 200, rewardCores: 5, rewardTalent: 1, perm: { label: "Boss 伤害 ×1.2", kind: "boss", mult: 1.2 } },
    skill_slow: { name: "技能迟滞", desc: "主动技能冷却 ×2——考验技能释放节奏与被动构筑", icon: "⏳", target: 200, rewardCores: 5, rewardTalent: 1, perm: { label: "技能伤害 ×1.2", kind: "skill", mult: 1.2 } },
  } as Record<ChallengeId, { name: string; desc: string; icon: string; target: number; rewardCores: number; rewardTalent: number; perm: { label: string; kind: ChallengePermKind; mult: number } }>,

  // 试炼赛季（Roguelite 挑战赛季：自选 1~3 个修饰符叠加冲分）
  SEASON: {
    UNLOCK_CHALLENGES: ["no_crit", "slow_universe", "poverty"] as ChallengeId[], // 通关全部基础挑战解锁
    MAX_MODIFIERS: 3,
    WEIGHT_PER_MODIFIER: 0.5, // 每个修饰符 +50% 赛季分（得分 = 关卡 × (1 + 0.5×修饰符数)）
    TIERS: {
      bronze: { name: "铜", threshold: 200, rewardCores: 10, rewardTalent: 1, rewardShards: 0 },
      silver: { name: "银", threshold: 500, rewardCores: 20, rewardTalent: 2, rewardShards: 0 },
      gold: { name: "金", threshold: 1000, rewardCores: 40, rewardTalent: 3, rewardShards: 2 },
    } as Record<SeasonTierId, { name: string; threshold: number; rewardCores: number; rewardTalent: number; rewardShards: number }>,
  } as const,

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

  // Permanent tools: accessible conveniences first, late-game automation as gold sinks.
  TOOLS: {
    auto_upgrade: [
      { gold: [1, 8], minStage: 100, label: "基础自动升级", desc: "每 0.5 秒评估 1 次，每批最多购买 10 级" },
      { gold: [1, 30], minPrestiges: 1, label: "智能自动升级", desc: "每 0.1 秒评估 5 次，每批最多购买 500 级" },
      { gold: [1, 33], minPrestiges: 3, label: "并行升级核心", desc: "每逻辑帧并行评估 8 次，每批最多购买 6250 级" },
    ],
    auto_boss: [
      { gold: [1, 10], minStage: 50, label: "Boss 自动挑战器", desc: "Boss 超时后自动重新挑战" },
    ],
    auto_breakdown: [
      { gold: [1, 18], minStage: 150, requiredTalent: "auto_break", label: "自动分解器", desc: "按设定稀有度自动分解装备；需先取得购买权限" },
    ],
    combat_recorder: [
      { gold: [1, 12], minStage: 100, label: "战斗记录仪", desc: "永久显示详细战斗统计" },
    ],
    auto_skill: [
      { gold: [1, 21], minStage: 150, requiredUnlock: "skills", label: "自动释放模块", desc: "主动技能冷却完成后自动释放" },
    ],
    auto_equip: [
      { gold: [1, 27], minStage: 250, requiredUnlock: "equipment", label: "自动换装模块", desc: "获得更优装备时自动比较并换装" },
    ],
    auto_prestige: [
      { gold: [1, 24], minPrestiges: 1, label: "基础自动重构", desc: "达到本次重构门槛且卡墙超过 5 秒时自动重构" },
      { gold: [1, 36], energy: 100, minPrestiges: 3, label: "策略自动重构", desc: "按关卡、预计能量或重构倍率比设置自动重构阈值" },
    ],
  } as Record<ToolId, ToolTierConfig[]>,
  AUTO_UPGRADE_TIERS: [
    { intervalSec: 0.5, reevaluations: 1, maxBatch: 10 },
    { intervalSec: 0.1, reevaluations: 5, maxBatch: 500 },
    { intervalSec: 0.05, reevaluations: 8, maxBatch: 6250 },
  ] as readonly AutoUpgradeTierConfig[],

  // Talents
  TALENT_POINTS_FROM_BOSS_FIRST_KILL: 1,
  TALENT_POINTS_FROM_ACHIEVEMENT: 1,
  TALENT_POINTS_PER_PRESTIGE: 1,
  TALENT_STAGE_MILESTONE: 2000,
  CHALLENGE_TALENT_CAP_PER_CYCLE: 6,
  CHALLENGE_TALENT_TOTAL_CAP_PER_CYCLE: 30,
  // 天赋溢出转化：天赋全满后，每 CHUNK 点溢出天赋点自动转化为 1 点天赋残辉（永久全局 ×1.1）
  TALENT_OVERFLOW: {
    CHUNK: 5,
    GLOBAL_MULT: 0.1,
    AUTO_CHECK_SEC: 3,
  },

  // 道具
  CONSUMABLE_DURATION_SEC: 300, // 超频芯片/黄金协议 5 分钟
  CONSUMABLE_STACK_CAP: 99,
  CONSUMABLE_SHOP: {
    overclock_chip: { gold: [1, 8], goldFraction: 0.005, minStage: 100 },
    gold_protocol: { gold: [1, 12], goldFraction: 0.01, minStage: 200 },
    singularity_battery: { gold: [1, 16], goldFraction: 0.02, minStage: 300, requiredUnlock: "skills" },
  } as Record<ItemId, ConsumableShopConfig>,

  // 重构（第一层重置）
  PRESTIGE: {
    BASE_STAGE: 500,
    STAGE_PER_PRESTIGE: 100,
    MAX_STAGE_REQUIREMENT: 10000,
    FIRST_RUN_RESONANCE_START: 350,
    FIRST_RUN_RESONANCE_STEP: 10,
    FIRST_RUN_RESONANCE_MULT: 1.75,
    THRESHOLD: 20, // log10(总伤) 阈值
    ENERGY_EXP: 2,
    GLOBAL_EXP: 2, // (1+E)^2
    SHOP: {
      startPower: { baseCost: 10, costGrowth: 2, perLevel: 10, max: 50, label: "起始力量", desc: "重构后起始攻击等级 +10" },
      goldKeep: { baseCost: 20, costGrowth: 2, perLevel: 0.05, max: 10, label: "资源保留", desc: "重构后保留 5% 金币（上限 50%）" },
      fastSkip: { baseCost: 15, costGrowth: 2, perLevel: 10, max: 20, label: "高速推进", desc: "自动跳关基数 +10" },
      startSkill: { baseCost: 40, costGrowth: 1, perLevel: 1, max: 1, label: "初始技能", desc: "开局解锁 1 个技能" },
      singularityAmp: { baseCost: 100, costGrowth: 3, perLevel: 1, max: 5, label: "奇点放大", desc: "奇点能量效果 ×2（能量指数 +1）" },
    },
    AUTO_WALL_SEC: 5, // 自动重构：击杀时间超过该秒数视为卡墙才触发
  },

  // 世界跃迁（第二层重置）：10000 关解锁，跨世界线洗牌，获得世界核心
  LEAP: {
    STAGE: 10000, // 解锁跃迁的关卡
    STAGE_PER_LEAP: 500,
    MAX_STAGE_REQUIREMENT: 15000,
    CORE_PER_LEAP: 1,
    CORE_BONUS_STAGE: 15000, // 达到 15000 关，首次额外 +1 核心
    CORE_BONUS_STEP: 1000, // 此后每推进 1000 关再额外 +1，无上限
    SHOP: {
      lawExponent: { baseCost: 1, costGrowth: 1, perLevel: 0.005, max: 24, label: "法则指数", desc: "怪物 HP 指数基数 -0.005/级（上限 -0.12）" },
      startStage: { baseCost: 1, costGrowth: 1, perLevel: 100, max: 50, label: "起始世界", desc: "跃迁后及之后每次重构：起始关卡 +100/级，五项基础升级同步到起始关卡 -1 级" },
      allStats: { baseCost: 1, costGrowth: 1, perLevel: 1.3, max: 30, label: "全属性", desc: "每级使全局伤害与金币 ×1.3，乘算叠加" },
      newWorld: { baseCost: 1, costGrowth: 1, perLevel: 1, max: 2, label: "新世界", desc: "解锁新世界主题与机制（奇点熔炉/法则终境）" },
      autoLeap: { baseCost: 1, costGrowth: 1, perLevel: 1, max: 1, label: "自动跃迁", desc: "购买后卡墙自动跃迁；累计跃迁 ≥3 次后升级为达到门槛立即跃迁" },
    } as Record<LeapUpgradeId, { baseCost: number; costGrowth: number; perLevel: number; max: number; label: string; desc: string }>,
    AUTO_WALL_SEC: 8, // 自动跃迁：卡墙判定秒数
  },

  // 法则重写（第三层重置）：30000 关解锁，改写公式系数/指数，全部有硬上限
  LAWS: {
    REWRITE_STAGE: 30000, // 解锁法则重写的关卡
    SHARD_DIVISOR: 10000,
    SHARD_BASE_OFFSET: 2, // 碎片 = floor(maxStage/10000) - 2（30000 → 1）
    DOUBLE_MULT: 2, // 本次最大关卡 ≥ 上次×2 → 碎片翻倍
    GOLD_TO_DMG_LOG_FLOOR: 12, // 金币转伤：从 10^12 金币起算
    GOLD_TO_DMG_PER_STEP: 0.1, // 每高 10 倍 → +10%
    GOLD_TO_DMG_MAX_LOG: 60, // 金币转伤有界（上限 1.1^60 ≈ 304×）
    PATCHES: {
      critExp: { perLevel: 0.05, max: 6, costBase: 1, label: "暴击指数", desc: "暴击伤害指数 +0.05/级（满级 ^1.3 ≈ ×2.46，有界）" },
      goldBoost: { perLevel: 0.25, max: 6, costBase: 1, label: "金币补强", desc: "独立金币倍率 +25%/级（上限 ×2.5，有界）" },
      apsCap: { perLevel: 1, max: 4, costBase: 1, label: "攻速破限", desc: "攻速软上限 +1/级（10→14，有界）" },
      goldToDmg: { perLevel: 1, max: 1, costBase: 3, label: "金币转伤", desc: "解锁公式：持有金币每高 10 倍（≥10^12）→ 全伤害 +10%（有界）" },
    } as Record<LawId, { perLevel: number; max: number; costBase: number; label: string; desc: string }>,
  },

  // 第 4 维度：法则彼岸（三层跃迁全部完成后的下一个阶段，货币 = 法则碎片）
  NEXUS: {
    ENTRY_STAGE: 30000,
    REQUIRED_NEW_WORLD: 2, // 需要 新世界 Lv2（法则终境）——即三层跃迁全部完成
    ENTRY_SHARDS: 30, // 进入门槛：当前持有法则碎片 >= 30（不看关卡）
    ENTRY_COST: 20, // 进入消耗的法则碎片（跨入彼岸）
    STAGE_START: 100000, // 彼岸世界主题起始关卡
    SHOP: {
      nexusDmg: { perLevel: 0.5, max: 10, costBase: 1, label: "彼岸增幅", desc: "全局伤害 ×1.5/级（独立乘区，上限 ×57.7）" },
      nexusGold: { perLevel: 0.5, max: 10, costBase: 1, label: "彼岸金流", desc: "金币收益 ×1.5/级（独立乘区，上限 ×57.7）" },
      nexusShardGain: { perLevel: 0.25, max: 8, costBase: 1, label: "碎片洪流", desc: "法则碎片获取 ×1.25/级（上限 ×5.96）" },
      nexusOverflow: { perLevel: 0.5, max: 6, costBase: 1, label: "溢出洪流", desc: "溢出收益 ×1.5/级（上限 ×11.4）" },
    } as Record<NexusUpgradeId, { perLevel: number; max: number; costBase: number; label: string; desc: string }>,
  },

  // 第 5 维度「超维回响」：进入彼岸后，收集足够回响印记解锁（不看关卡）
  ECHO: {
    ENTRY_STAGE: 100000,
    ENTRY_SEALS: 120, // 解锁门槛：累计回响印记 >= 120（不看关卡）
    ENTRY_COST: 60, // 进入消耗的回响印记
    SEAL_MIN_STAGE: 100000, // 彼岸世界从此关卡起，击杀 Boss/精英掉落回响印记
    STAGE_START: 200000, // 超维回响世界主题起始关卡
    BOSS_SEAL_BASE: 1, // 彼岸 Boss 基础掉落印记
    BOSS_SEAL_PER_LOG: 1, // 关卡每高 10 倍（log10）额外 +1 印记
    ELITE_SEAL: 1, // 彼岸精英掉落印记
    SHOP: {
      echoDmg: { perLevel: 0.5, max: 10, costBase: 1, label: "回响增幅", desc: "全局伤害 ×1.5/级（独立乘区，上限 ×57.7）" },
      echoGold: { perLevel: 0.5, max: 10, costBase: 1, label: "回响金流", desc: "金币收益 ×1.5/级（独立乘区，上限 ×57.7）" },
      echoSealGain: { perLevel: 0.25, max: 8, costBase: 1, label: "印记洪流", desc: "回响印记获取 ×1.25/级（上限 ×5.96）" },
      echoOverflow: { perLevel: 0.5, max: 6, costBase: 1, label: "回响溢流", desc: "溢出收益 ×1.5/级（上限 ×11.4）" },
    } as Record<EchoUpgradeId, { perLevel: number; max: number; costBase: number; label: string; desc: string }>,
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
    { key: "prestige", stage: 500, label: "重构" },
    { key: "leap", stage: 10000, label: "世界跃迁" },
    { key: "lawRewrite", stage: 30000, label: "法则重写" },
    { key: "achievements", stage: 30, label: "成就" },
  ] as { key: string; stage: number; label: string }[],

  // 离线
  // 离线
  OFFLINE: {
    MAX_HOURS: 8,
    EFFICIENCY: 0.5,
    WALL_KILL_TIME_SEC: 3, // 普通怪击杀时间 > 3s 视为撞墙
    BOSS_KILL_TIME_SEC: 30, // 离线能击杀 Boss 的击杀时间阈值（与在线 Boss 计时一致）
    MAX_BOSS_KILLS: 20, // 离线 Boss 击杀上限（防极端溢出）
    FALLBACK_MAX_STAGES: 25, // 撞墙时回退寻找「可稳定击杀关卡」的最大步数
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
