// 游戏引擎：纯逻辑，不依赖 React/DOM，可 headless 运行（测试与模拟器共用）
import { Big, toBig, type BigTuple } from "./bignum";
import { CONFIG, type ToolTierConfig } from "./config";
import type {
  BossAffix, ChallengeId, DailyQuestType, EchoUpgradeId, EquipInstance, EquipSlot, GameEvent, GameEventListener, GameState, ItemId, NexusUpgradeId, PassiveId, Rarity, SeasonTierId, SkillId, ToolId, TreeId, UpgradeId, VoidTarget,
} from "./types";
import { Rng } from "./rng";
import {
  computeDerived, emptyBuffs, type RuntimeBuffs,
  enemyHp, enemyGold, isBossStage, bossHp, rollCrit, expectedCritMult,
  overflowGold, crushGold, upgradeCost, upgradeTotalCost, prestigeEnergy, prestigeGlobalMult, pickSpecialEnemy, seasonScore,
  critChanceFromLevel, critDamageFromLevel,
} from "./formulas";
import {
  rollEquipment, addDrop, dropChance, equipItem as sysEquip, unequip as sysUnequip,
  enhance as sysEnhance, breakdown as sysBreakdown, canEnhance, enhanceCost,
  reforge as sysReforge, reforgeCost, canReforge as sysCanReforge,
  craft as sysCraft, craftCost, canCraft as sysCanCraft,
  overclock as sysOverclock, overclockCost, canOverclock as sysCanOverclock, shardsForRarity,
} from "./systems/equipment";
import { castSkill, tickSkills, upgradeSkill as sysUpgradeSkill, upgradePassive as sysUpgradePassive, canUpgradePassive as sysCanUpgradePassive } from "./systems/skills";
import { canEnterNexus as sysCanEnterNexus, enterNexus as sysEnterNexus, buyNexusUpgrade as sysBuyNexusUpgrade, nexusShopCost as sysNexusShopCost, canBuyNexus as sysCanBuyNexus } from "./systems/nexus";
import { canEnterEcho as sysCanEnterEcho, enterEcho as sysEnterEcho, buyEchoUpgrade as sysBuyEchoUpgrade, echoShopCost as sysEchoShopCost, canBuyEcho as sysCanBuyEcho, echoSealsForBoss, echoSealsForElite, echoSealGainMult } from "./systems/echo";
import { dailyGoldMag, ensureDaily } from "./systems/daily";
import { allocate as sysAllocate, resetTree as sysResetTree, canAllocate, canConvertOverflow as sysCanConvertOverflow, convertOverflow as sysConvertOverflow } from "./systems/talents";
import { talentNodeById, TALENT_TREES } from "./data/talents";
import { applyPrestige, computePrestige, buyPrestigeUpgrade, canBuy, canPrestige as sysCanPrestige, prestigeStageRequirement } from "./systems/prestige";
import { applyLeap, canLeap as sysCanLeap, leapCores, leapStageRequirement, buyLeapUpgrade as sysBuyLeapUpgrade, leapShopCost, canBuyLeap as sysCanBuyLeap } from "./systems/leap";
import { applyLawRewrite, canRewriteLaw as sysCanRewriteLaw, lawShards, buyLawPatch as sysBuyLawPatch, lawShopCost as sysLawShopCost, canBuyLaw as sysCanBuyLaw } from "./systems/law";
import { checkAchievement, ACHIEVEMENTS } from "./data/achievements";
import { SKILL_DEFS, SKILL_IDS, skillCoreCost, passiveCoreCost, PASSIVE_IDS, skillEffect } from "./data/skills";
import { worldForStage, BOSS_AFFIX_LABEL, ELITE_AFFIX_POOL } from "./data/worlds";
import { equipScore } from "./data/equipment";
import { ITEM_DEFS, TOOL_DEFS } from "./data/items";
import { challengeCycleTalentRemaining, challengeTalentPotential, resetTalentRewardCycle } from "./systems/talent-rewards";

export interface OfflineResult {
  goldGained: Big;
  kills: number;
  stagesAdvanced: number;
  drops: number;
  seconds: number; // 真实离线时长（封顶到 OFFLINE.MAX_HOURS）
  capped: boolean;
}

export function createNewState(seed = (Date.now() >>> 0)): GameState {
  return {
    meta: {
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      rngState: seed,
      version: CONFIG.SAVE_VERSION,
      unlocks: [],
      discoveries: [],
      achievements: [],
      milestonesSeen: [],
      settings: { sound: true, reduceMotion: false, animationFps: 60 },
      lastScoreSubmit: { stage: undefined, mag: undefined, prestige: undefined, season: undefined },
      cloudSyncedAt: 0,
      activeChallenge: null,
      activeModifiers: [],
    },
    player: {
      upgrades: { attack: 0, aspd: 0, critChance: 0, critDamage: 0, gold: 0 },
      gold: [0, 0],
      clickCount: 0,
    },
    combat: {
      stage: 1, enemyHp: [0, 0], enemyMaxHp: [0, 0], isBoss: false, bossAffixes: [],
      bossTimer: -1, combo: 0, comboTimer: 0, crushStreak: 0, skipMode: false,
      lastHitWasCrit: false, lastHitWasSuper: false, lastHitWasCrush: false,
      enemyKind: "normal", bossShieldHits: 0, bossVoidTarget: null,
    },
    equipment: { slots: {}, inventory: [], fragments: [0, 0], autoBreakdown: null },
    skills: { actives: [], passives: { rhythm: 0, focus: 0, greed: 0 }, cores: [0, 0] },
    talents: {
      points: 0, allocations: {}, keystones: {}, residue: 0,
      presets: [
        { name: "", talents: {}, keystones: {} },
        { name: "", talents: {}, keystones: {} },
        { name: "", talents: {}, keystones: {} },
      ],
    },
    prestige: { energy: 0, totalEnergyEarned: 0, nextRequiredStage: CONFIG.PRESTIGE.BASE_STAGE, purchases: {} },
    leap: { cores: 0, totalCoresEarned: 0, totalLeaps: 0, nextRequiredStage: CONFIG.LEAP.STAGE, lastLeapMaxStage: 1, purchases: {} },
    laws: { shards: 0, totalShardsEarned: 0, totalRewrites: 0, lastRewriteMaxStage: 1, purchases: {} },
    nexus: { unlocked: false, entered: false, dimension: 0, purchases: {}, bossAutoAttack: false },
    echo: { unlocked: false, entered: false, dimension: 0, seals: 0, totalSealsEarned: 0, purchases: {} },
    items: {
      consumables: {},
      tools: {},
      toolLevels: {},
      autoPrestigeRule: { enabled: false, metric: "stage", comparator: "gte", value: 1000 },
    },
    statistics: {
      totalDamage: [0, 0], runDamage: [0, 0], totalGold: [0, 0], totalKills: 0, totalBossKills: 0,
      totalEliteKills: 0, totalMimicKills: 0,
      highestHit: [0, 0], totalClicks: 0, totalCrits: 0, totalSuperCrits: 0, totalSkillCasts: 0,
      totalPrestiges: 0, totalPlayTimeMs: 0, totalOfflineMs: 0, allTimeMaxStage: 1,
    },
    daily: { date: "", quests: [], goldEarned: [0, 0], bestStage: 1 },
    challenges: {
      no_crit: { best: 0, claimed: false, cycleBest: 0, cycleTalentRewarded: 0, runRewardClaimed: false },
      slow_universe: { best: 0, claimed: false, cycleBest: 0, cycleTalentRewarded: 0, runRewardClaimed: false },
      poverty: { best: 0, claimed: false, cycleBest: 0, cycleTalentRewarded: 0, runRewardClaimed: false },
      durable: { best: 0, claimed: false, cycleBest: 0, cycleTalentRewarded: 0, runRewardClaimed: false },
      skill_slow: { best: 0, claimed: false, cycleBest: 0, cycleTalentRewarded: 0, runRewardClaimed: false },
    },
    season: {
      unlocked: false,
      bestScore: 0,
      bestStage: 0,
      claimedTiers: [],
      lastModifiers: [],
    },
  };
}

export class GameEngine {
  state: GameState;
  derived: ReturnType<typeof computeDerived>;
  buffs: RuntimeBuffs;
  timeSec = 0;
  private rng: Rng;
  private listeners = new Set<GameEventListener>();
  private attackCounter = 0;
  private attackBudget = 0;
  private recomputeTimer = 0;
  private achievementTimer = 0;
  private dailyTimer = 0;
  private autoPrestigeTimer = 0;
  private autoUpgradeTimer = 0;
  private autoSkillUpgradeTimer = 0;
  private talentOverflowTimer = 0;
  private nexusCheckTimer = 0;
  private echoCheckTimer = 0;
  // 自动分解统计（供 UI 节流 emit 提示）
  private autoBreakdownCount = 0;
  private autoBreakdownShards = 0;
  private autoBreakdownEmitTimer = 0;
  private chipUntil = 0;
  private protocolUntil = 0;

  constructor(initial?: GameState) {
    this.state = initial ? initial : createNewState();
    this.rng = Rng.fromState(this.state.meta.rngState);
    this.buffs = emptyBuffs();
    ensureDaily(this.state);
    this.derived = computeDerived(this.state, this.buffs, this.timeSec);
    if (toBig(this.state.combat.enemyHp).isZero()) this.spawnEnemy();
  }

  // ---------------- 事件 ----------------
  onEvent(l: GameEventListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit(e: GameEvent): void {
    for (const l of this.listeners) l(e);
  }

  isUnlocked(key: string): boolean {
    return this.state.meta.unlocks.includes(key);
  }

  // ---------------- 主循环 ----------------
  private bossAutoAttackWindow(dt: number): number {
    const combat = this.state.combat;
    if (!combat.isBoss || this.skillActive("time_freeze")) return dt;
    const drain = combat.bossAffixes.includes("time") ? CONFIG.BOSS_TIME_DRAIN_MULT : 1;
    return Math.min(dt, Math.max(0, combat.bossTimer) / drain);
  }

  tick(dt: number): void {
    this.timeSec += dt;
    tickSkills(this.state, dt, this.timeSec);
    this.tickCombo(dt);
    this.tickConsumables(dt);
    // 自动攻击对普通敌人和 Boss 使用同一套 APS 累积逻辑；Boss 失败自动重试由 auto_boss 工具单独控制。
    // 先结算本帧攻击再推进 Boss 计时，避免临界帧“明明打出了致命一击却先判超时”。
    if (this.isUnlocked("auto_attack")) {
      this.autoAttack(this.bossAutoAttackWindow(dt));
    }
    this.tickBoss(dt);
    const autoUpgradeLevel = this.toolLevel("auto_upgrade");
    if (autoUpgradeLevel > 0) {
      const profile = CONFIG.AUTO_UPGRADE_TIERS[Math.min(autoUpgradeLevel, CONFIG.AUTO_UPGRADE_TIERS.length) - 1];
      this.autoUpgradeTimer -= dt;
      this.autoSkillUpgradeTimer -= dt;
      let catchUpRuns = 0;
      while (this.autoUpgradeTimer < 0 && catchUpRuns < 4) {
        this.autoUpgradeTimer += profile.intervalSec;
        catchUpRuns += 1;
        // Base upgrades catch up in bounded batches; rare skill cores retain the original two-upgrades-per-second pace.
        const smartBoost = (this.state.talents.allocations.auto_keystone_smart ?? 0) > 0;
        const bought = this.smartBuyBurst(
          profile.reevaluations + (smartBoost ? 2 : 0),
          Math.floor(profile.maxBatch * (smartBoost ? 1.25 : 1)),
        );
        if (bought === 0 && this.autoSkillUpgradeTimer <= 0) {
          this.smartBuySkill();
          this.autoSkillUpgradeTimer = 0.5;
        }
      }
      if (this.autoUpgradeTimer < -profile.intervalSec) this.autoUpgradeTimer = 0;
    }
    // Auto-cast skills as soon as their cooldown ends.
    if (this.toolLevel("auto_skill") > 0 && this.state.skills.actives.length > 0) {
      for (const inst of [...this.state.skills.actives]) {
        const def = SKILL_DEFS[inst.id];
        if (inst.cdRemaining <= 0 && (def.duration === 0 || !inst.active)) {
          this.cast(inst.id);
        }
      }
    }
    // 周期检查
    this.achievementTimer -= dt;
    if (this.achievementTimer <= 0) {
      this.achievementTimer = 1;
      this.checkAchievements();
      this.checkMilestones();
    }
    this.dailyTimer -= dt;
    if (this.dailyTimer <= 0) {
      this.dailyTimer = 5;
      ensureDaily(this.state);
    }
    // 维度解锁检查（每 2s）：法则彼岸 / 超维回响
    this.nexusCheckTimer -= dt;
    if (this.nexusCheckTimer <= 0) {
      this.nexusCheckTimer = 2;
      this.checkNexusUnlock();
      this.checkEchoUnlock();
    }
    // 自动重构：卡墙且可重构时自动执行（每 10s 检查一次）
    // 自动跃迁：到达跃迁阈值且卡墙时自动执行（世界核心升级解锁）
    if ((this.state.leap?.purchases?.autoLeap ?? 0) >= 1 && this.canLeap()) {
      const advancedAutoLeap = this.state.leap.totalLeaps >= 3;
      const killTime = toBig(this.state.combat.enemyHp).div(this.derived.dps).toNumber();
      if (advancedAutoLeap || (Number.isFinite(killTime) && killTime > CONFIG.LEAP.AUTO_WALL_SEC)) {
        this.leap();
      }
    }
    this.autoPrestigeTimer -= dt;
    if (this.autoPrestigeTimer <= 0) {
      const autoPrestigeLevel = this.toolLevel("auto_prestige");
      this.autoPrestigeTimer = autoPrestigeLevel >= 2 ? 1 : 10;
      if (autoPrestigeLevel > 0 && this.canPrestige()) {
        const killTime = toBig(this.state.combat.enemyHp).div(this.derived.dps).toNumber();
        const shouldPrestige = autoPrestigeLevel >= 2
          ? this.state.items.autoPrestigeRule.enabled && this.matchesAutoPrestigeRule()
          : Number.isFinite(killTime) && killTime > CONFIG.PRESTIGE.AUTO_WALL_SEC;
        if (shouldPrestige) this.prestige();
      }
    }
    // 自动分解反馈节流：约每 3s 汇总 emit 一次
    if (this.autoBreakdownCount > 0) {
      this.autoBreakdownEmitTimer -= dt;
      if (this.autoBreakdownEmitTimer <= 0) {
        this.autoBreakdownEmitTimer = 3;
        this.emit({ type: "autoBreakdown", count: this.autoBreakdownCount, shards: this.autoBreakdownShards });
        this.autoBreakdownCount = 0;
        this.autoBreakdownShards = 0;
      }
    }
    this.recomputeTimer -= dt;
    if (this.recomputeTimer <= 0) {
      this.recomputeTimer = 0.5;
      this.recomputeDerived();
    }
    this.state.statistics.totalPlayTimeMs += dt * 1000;
  }

  recomputeDerived(): void {
    this.derived = computeDerived(this.state, this.buffs, this.timeSec);
  }

  // ---------------- 战斗 ----------------
  click(): void {
    const d = this.derived;
    this.state.player.clickCount += 1;
    this.state.statistics.totalClicks += 1;
    this.addCombo(1, false);
    this.attackCounter += 1;
    const voidCrit = this.isVoid("crit");
    const voidClick = this.isVoid("click");
    let damage = d.damagePerHit;
    if (!voidClick) damage = damage.mul(d.clickMult);
    let crit = false;
    let superCrit = false;
    if (this.buffs.criticalStrike.pending) {
      const mult = voidCrit ? 1 : this.buffs.criticalStrike.mult;
      damage = damage.mul(Big.fromNumber(mult));
      crit = !voidCrit;
      superCrit = !voidCrit;
      this.buffs.criticalStrike.pending = false;
    } else {
      const r = rollCrit(d.critChance, d.critDamage, d.critLayersExtra, this.rng.next());
      crit = r.crit && !voidCrit;
      superCrit = r.superCrit && !voidCrit;
      damage = damage.mul(voidCrit ? Big.ONE : r.mult);
    }
    // 充能一击待发：下一次攻击 ×mult
    if (this.buffs.chargedHit.pending) {
      damage = damage.mul(Big.fromNumber(this.buffs.chargedHit.mult));
      this.buffs.chargedHit.pending = false;
    }
    this.applyHit(damage, crit, superCrit, true);
  }

  private autoAttack(dt: number): void {
    const d = this.derived;
    const total = d.effectiveAps * dt + this.attackBudget;
    const whole = Math.floor(total);
    this.attackBudget = total - whole;
    if (whole <= 0) return;
    this.addCombo(whole, true);
    this.attackCounter += whole;
    const voidCrit = this.isVoid("crit");
    // 每 N 次攻击触发（everyNAttack）
    if (d.everyNAttack > 0) {
      const before = Math.floor((this.attackCounter - whole) / 10);
      const after = Math.floor(this.attackCounter / 10);
      if (after > before) {
        const bonus = d.damagePerHit.mul(Big.fromNumber(d.everyNAttack));
        this.applyHit(bonus, false, false, false, true);
      }
    }
    // 充能一击待发：下一次自动攻击 ×mult
    if (this.buffs.chargedHit.pending) {
      const hit = d.damagePerHit.mul(Big.fromNumber(this.buffs.chargedHit.mult));
      this.buffs.chargedHit.pending = false;
      this.applyHit(hit, false, false, false);
      if (whole > 1) {
        const rest = whole - 1;
        this.batchAttack(rest);
      }
      return;
    }
    // 临界打击待发
    if (this.buffs.criticalStrike.pending) {
      const mult = voidCrit ? 1 : this.buffs.criticalStrike.mult;
      const hit = d.damagePerHit.mul(Big.fromNumber(mult));
      this.buffs.criticalStrike.pending = false;
      this.applyHit(hit, !voidCrit, !voidCrit, false);
      if (whole > 1) {
        const rest = whole - 1;
        this.batchAttack(rest);
      }
      return;
    }
    if (whole <= 8) {
      for (let i = 0; i < whole; i++) {
        const r = rollCrit(d.critChance, d.critDamage, d.critLayersExtra, this.rng.next());
        const hit = d.damagePerHit.mul(voidCrit ? Big.ONE : r.mult);
        this.applyHit(hit, r.crit && !voidCrit, r.superCrit && !voidCrit, false, true);
      }
    } else {
      this.batchAttack(whole);
    }
  }

  private batchAttack(n: number): void {
    const d = this.derived;
    if (this.isVoid("crit")) {
      const total = d.damagePerHit.mul(Big.fromNumber(n));
      this.applyHit(total, false, false, false, true);
      return;
    }
    const expected = expectedCritMult(d.critChance, d.critDamage, d.critLayersExtra);
    const total = d.damagePerHit.mul(expected).mul(Big.fromNumber(n));
    const crit = this.rng.chance(Math.min(1, d.critChance));
    this.applyHit(total, crit, false, false, true);
  }

  private applyHit(rawDamage: Big, crit: boolean, superCrit: boolean, isClick: boolean, batch = false, isSkill = false): void {
    const c = this.state.combat;
    let damage = rawDamage;
    // Boss 词缀 + Boss 伤害乘区（精英同样吃词缀，但不吃 Boss 伤害乘区）
    if (c.isBoss) {
      damage = damage.mul(this.derived.bossDmgMult);
    }
    if (c.isBoss || c.enemyKind === "elite") {
      // 能量盾：前 N 次伤害固定为 1（Boss 专属）
      if (c.isBoss && c.bossAffixes.includes("shield") && c.bossShieldHits > 0) {
        c.bossShieldHits -= 1;
        damage = Big.ONE;
      } else {
        for (const affix of c.bossAffixes) {
          if (affix === "armor") damage = damage.mul(Big.fromNumber(0.5));
          else if (affix === "antiCrit" && crit) damage = damage.mul(Big.fromNumber(0.5));
          else if (affix === "deflect" && !crit) damage = damage.mul(Big.fromNumber(0.3));
          else if (affix === "harden") {
            const elapsed = CONFIG.BOSS_TIMER_SEC - c.bossTimer;
            const stacks = Math.min(5, Math.floor(Math.max(0, elapsed) / 6));
            damage = damage.mul(Big.fromNumber(1 - stacks * 0.08));
          }
          else if (affix === "rage") {
            const elapsed = CONFIG.BOSS_TIMER_SEC - c.bossTimer;
            const def = 1 + Math.min(0.6, Math.max(0, elapsed) * 0.02);
            damage = damage.mul(Big.fromNumber(1 / def));
          }
          else if (affix === "void" && c.bossVoidTarget === "skill" && isSkill) {
            damage = damage.div(this.derived.skillDmgMult);
          }
        }
      }
    }
    const hpBefore = toBig(c.enemyHp);
    this.state.statistics.totalDamage = toBig(this.state.statistics.totalDamage).add(damage).toTuple();
    this.state.statistics.runDamage = toBig(this.state.statistics.runDamage).add(damage).toTuple();
    if (damage.gt(toBig(this.state.statistics.highestHit))) this.state.statistics.highestHit = damage.toTuple();
    if (crit) this.state.statistics.totalCrits += 1;
    if (superCrit) this.state.statistics.totalSuperCrits += 1;

    const overkill = damage.sub(hpBefore);
    const remaining = hpBefore.sub(damage);
    c.enemyHp = remaining.toTuple();
    c.lastHitWasCrit = crit;
    c.lastHitWasSuper = superCrit;

    const crush = !c.isBoss && damage.gte(toBig(c.enemyMaxHp).mul(Big.fromNumber(CONFIG.CRUSH_THRESHOLD)));
    c.lastHitWasCrush = crush;
    this.emit({ type: "hit", damage: damage.toTuple(), crit, superCrit, crush, isClick });

    if (remaining.isZero() && !hpBefore.isZero()) {
      this.onKill(crush, overkill);
    }
  }

  private onKill(crush: boolean, overkill: Big): void {
    const c = this.state.combat;
    const stage = c.stage;
    const isBoss = c.isBoss;
    this.state.statistics.totalKills += 1;

    const kind = c.enemyKind;
    let gold = enemyGold(stage, this.derived.hpGrowth).mul(this.derived.goldMult);
    if (isBoss) gold = gold.mul(Big.fromNumber(10)).mul(this.derived.bossGoldMult);
    else if (kind === "elite") gold = gold.mul(Big.fromNumber(CONFIG.SPECIAL_ENEMIES.ELITE_GOLD_MULT));
    else if (kind === "mimic") gold = gold.mul(Big.fromNumber(CONFIG.SPECIAL_ENEMIES.MIMIC_GOLD_MULT));
    if (isBoss && c.bossVoidTarget === "gold") gold = gold.mul(Big.fromNumber(0.5));
    if (crush) {
      c.crushStreak += 1;
      gold = crushGold(gold, this.derived.overflowEffMult);
      this.emit({ type: "crush", stage });
    } else {
      c.crushStreak = 0;
    }
    // 溢出金币（仅首次通关，即超越历史最大关卡）
    if (overkill.gt(Big.ZERO) && stage > this.state.statistics.allTimeMaxStage) {
      const baseGold = enemyGold(stage, this.derived.hpGrowth).mul(this.derived.goldMult);
      const hpBefore = toBig(c.enemyMaxHp);
      gold = gold.add(overflowGold(overkill.add(hpBefore), hpBefore, baseGold, this.derived.overflowEffMult));
    }
    this.state.player.gold = toBig(this.state.player.gold).add(gold).toTuple();
    this.state.statistics.totalGold = toBig(this.state.statistics.totalGold).add(gold).toTuple();

    // 每日任务（仅在线进度；离线不结算）
    this.state.daily.goldEarned = toBig(this.state.daily.goldEarned).add(gold).toTuple();
    this.updateDailyGold();
    this.updateDailyQuest("kills", 1);
    if (isBoss) this.updateDailyQuest("bossKills", 1);

    this.emit({ type: "kill", stage, boss: isBoss, kind });
    if (isBoss) {
      this.state.statistics.totalBossKills += 1;
      this.emit({ type: "bossKill" });
      this.grantBossRewards(stage);
      // 首次 Boss 击杀 → 天赋点
      if (!this.state.meta.unlocks.includes("first_boss_reward")) {
        this.state.meta.unlocks.push("first_boss_reward");
        this.grantTalentPoints(CONFIG.TALENT_POINTS_FROM_BOSS_FIRST_KILL);
      }
    } else if (kind === "elite") {
      this.state.statistics.totalEliteKills += 1;
      const item = rollEquipment(this.rng, stage, CONFIG.SPECIAL_ENEMIES.ELITE_DROP_LUCK);
      this.dropItem(item);
      this.maybeAutoEquip();
      this.emit({ type: "drop", rarity: item.rarity, slot: item.slot });
    } else if (kind === "mimic") {
      this.state.statistics.totalMimicKills += 1;
      const item = rollEquipment(this.rng, stage, 0.5);
      this.dropItem(item);
      this.maybeAutoEquip();
      this.emit({ type: "drop", rarity: item.rarity, slot: item.slot });
      if (this.rng.chance(CONFIG.SPECIAL_ENEMIES.MIMIC_CORE_CHANCE)) {
        this.state.skills.cores = toBig(this.state.skills.cores).add(Big.ONE).toTuple();
      }
    } else {
      if (this.rng.chance(dropChance(stage, this.derived.dropMult.toNumber() - 1))) {
        const item = rollEquipment(this.rng, stage, 0);
        this.dropItem(item);
      this.maybeAutoEquip();
        this.emit({ type: "drop", rarity: item.rarity, slot: item.slot });
      }
    }
    // 第 5 维度：彼岸世界击杀 Boss/精英掉落回响印记（累计达标解锁「超维回响」）
    if (this.state.nexus?.entered && stage >= CONFIG.ECHO.SEAL_MIN_STAGE && (isBoss || kind === "elite")) {
      const base = isBoss ? echoSealsForBoss(stage) : echoSealsForElite(stage);
      if (base > 0) {
        const gained = Math.max(1, Math.floor(base * echoSealGainMult(this.state)));
        this.state.echo.seals += gained;
        this.state.echo.totalSealsEarned += gained;
        this.emit({ type: "echoSeal", gained });
      }
    }
    this.advanceStage(crush);
  }

  // 统一掉落入口：背包满时按自动分解档位拆解
  private dropItem(item: EquipInstance): void {
    const kept = addDrop(this.state, item);
    if (!kept) {
      this.autoBreakdownCount += 1;
      this.autoBreakdownShards += shardsForRarity(item.rarity);
    }
    this.maybeAutoEquip();
  }

  // 按当前自动分解档位清理背包存量
  private sweepAutoBreakdownInventory(): { count: number; shards: number } {
    const threshold = this.state.equipment.autoBreakdown;
    if (!threshold) return { count: 0, shards: 0 };
    const order = (Object.keys(CONFIG.EQUIPMENT.RARITIES) as Rarity[]).reduce((acc, r, i) => { acc[r] = i; return acc; }, {} as Record<Rarity, number>);
    let count = 0;
    let shards = 0;
    const kept: EquipInstance[] = [];
    for (const item of this.state.equipment.inventory) {
      if (order[item.rarity] < order[threshold]) { // 严格低于档位才自动分解
        count += 1;
        shards += shardsForRarity(item.rarity);
      } else {
        kept.push(item);
      }
    }
    if (count > 0) {
      this.state.equipment.inventory = kept;
      this.state.equipment.fragments = toBig(this.state.equipment.fragments).add(Big.fromNumber(shards)).toTuple();
    }
    return { count, shards };
  }

  private grantBossRewards(stage: number): void {
    // 必掉装备
    const item = rollEquipment(this.rng, stage, 0);
    this.dropItem(item);
    this.emit({ type: "drop", rarity: item.rarity, slot: item.slot });
    // 技能核心
    const cores = this.rng.int(1, 3);
    this.state.skills.cores = toBig(this.state.skills.cores).add(Big.fromNumber(cores)).toTuple();
  }

  private advanceStage(crush: boolean): void {
    const c = this.state.combat;
    let next = c.stage + 1;
    if (crush && c.crushStreak >= CONFIG.SKIP_AFTER_CRUSH_STREAK) {
      c.skipMode = true;
      const skipBase =
        CONFIG.SKIP_BASE + this.derived.skipBaseTalent +
        (this.state.prestige.purchases.fastSkip ?? 0) * CONFIG.PRESTIGE.SHOP.fastSkip.perLevel;
      next += skipBase;
    } else if (!crush) {
      c.skipMode = false;
    }
    c.stage = next;
    if (next > this.state.statistics.allTimeMaxStage) this.state.statistics.allTimeMaxStage = next;
    // 挑战 / 试炼赛季 / 每日任务进度
    const chId = this.state.meta.activeChallenge;
    if (chId) {
      const prog = this.state.challenges[chId];
      if (next > prog.best) prog.best = next;
      if (!prog.runRewardClaimed && next > prog.cycleBest) prog.cycleBest = next;
    }
    if (this.state.meta.activeModifiers.length > 0) {
      const mods = this.state.meta.activeModifiers;
      for (const m of mods) {
        const prog = this.state.challenges[m];
        if (next > prog.best) prog.best = next;
        if (!prog.runRewardClaimed && next > prog.cycleBest) prog.cycleBest = next;
      }
      const s = this.state.season;
      if (next > s.bestStage) s.bestStage = next;
      const sc = seasonScore(next, mods);
      if (sc > s.bestScore) s.bestScore = sc;
    }
    if (next > this.state.daily.bestStage) this.state.daily.bestStage = next;
    this.updateDailyQuest("stageReach", next);
    this.spawnEnemy();
    this.checkUnlocks();
  }

  private spawnEnemy(): void {
    const c = this.state.combat;
    if (isBossStage(c.stage)) {
      c.isBoss = true;
      c.enemyKind = "normal";
      c.enemyMaxHp = bossHp(c.stage, this.derived.hpGrowth).mul(this.derived.bossHpMult).mul(Big.fromNumber(this.derived.enemyHpMult)).toTuple();
      c.enemyHp = c.enemyMaxHp;
      c.bossTimer = CONFIG.BOSS_TIMER_SEC;
      c.bossAffixes = this.rollBossAffixes();
      c.bossShieldHits = c.bossAffixes.includes("shield") ? CONFIG.BOSS_SHIELD_HITS : 0;
      c.bossVoidTarget = c.bossAffixes.includes("void") ? this.rollVoidTarget() : null;
      this.emit({ type: "bossSpawn", affixes: c.bossAffixes });
    } else {
      c.isBoss = false;
      c.bossTimer = -1;
      c.bossAffixes = [];
      c.bossShieldHits = 0;
      c.bossVoidTarget = null;
      const kind = pickSpecialEnemy(
        this.rng.next(), false, c.skipMode,
        CONFIG.SPECIAL_ENEMIES.MIMIC_CHANCE, CONFIG.SPECIAL_ENEMIES.ELITE_CHANCE
      );
      c.enemyKind = kind;
      if (kind === "elite") {
        c.enemyMaxHp = enemyHp(c.stage, this.derived.hpGrowth).mul(Big.fromNumber(CONFIG.SPECIAL_ENEMIES.ELITE_HP_MULT)).mul(Big.fromNumber(this.derived.enemyHpMult)).toTuple();
        c.enemyHp = c.enemyMaxHp;
        c.bossAffixes = this.rollEliteAffixes();
        this.emit({ type: "eliteSpawn", affixes: c.bossAffixes });
      } else if (kind === "mimic") {
        c.enemyMaxHp = enemyHp(c.stage, this.derived.hpGrowth).mul(Big.fromNumber(CONFIG.SPECIAL_ENEMIES.MIMIC_HP_MULT)).mul(Big.fromNumber(this.derived.enemyHpMult)).toTuple();
        c.enemyHp = c.enemyMaxHp;
        this.emit({ type: "mimicSpawn" });
      } else {
        c.enemyMaxHp = enemyHp(c.stage, this.derived.hpGrowth).mul(Big.fromNumber(this.derived.enemyHpMult)).toTuple();
        c.enemyHp = c.enemyMaxHp;
      }
    }
  }

  private rollBossAffixes(): BossAffix[] {
    const pool = worldForStage(this.state.combat.stage, this.state.leap?.purchases?.newWorld ?? 0, this.state.nexus?.entered ?? false).bossPool;
    const count = this.state.combat.stage >= 200 && this.rng.chance(0.5) ? 2 : 1;
    return this.rng.shuffle(pool).slice(0, count);
  }

  private rollEliteAffixes(): BossAffix[] {
    const count = Math.min(CONFIG.SPECIAL_ENEMIES.ELITE_AFFIX_COUNT, ELITE_AFFIX_POOL.length);
    return this.rng.shuffle([...ELITE_AFFIX_POOL]).slice(0, count);
  }

  private rollVoidTarget(): VoidTarget {
    const targets: VoidTarget[] = ["crit", "click", "skill", "gold"];
    return targets[this.rng.int(0, targets.length - 1)];
  }

  private isVoid(target: VoidTarget): boolean {
    const c = this.state.combat;
    return c.isBoss && c.bossVoidTarget === target;
  }

  private bossTimeout(): void {
    const c = this.state.combat;
    const stage = c.stage;
    this.emit({ type: "bossFail", stage });
    if (this.toolLevel("auto_boss") > 0) {
      // 自动挑战器：同关重试
      this.spawnEnemy();
      return;
    }
    // 退回前一关刷资源
    c.stage = stage - 1;
    this.spawnEnemy();
  }

  private skillActive(id: SkillId): boolean {
    const inst = this.state.skills.actives.find((s) => s.id === id);
    return (inst?.activeUntil ?? 0) > this.timeSec;
  }

  private tickBoss(dt: number): void {
    const c = this.state.combat;
    if (!c.isBoss) return;
    const drain = c.bossAffixes.includes("time") ? CONFIG.BOSS_TIME_DRAIN_MULT : 1;
    // 时空冻结：Boss 计时暂停
    if (!this.skillActive("time_freeze")) c.bossTimer -= dt * drain;
    if (c.bossAffixes.includes("regen")) {
      const maxHp = toBig(c.enemyMaxHp);
      const heal = maxHp.mul(Big.fromNumber(0.03 * dt));
      c.enemyHp = Big.min(maxHp, toBig(c.enemyHp).add(heal)).toTuple();
    }
    if (c.bossTimer <= 0) this.bossTimeout();
  }

  private tickCombo(dt: number): void {
    const c = this.state.combat;
    if (c.combo <= 0) return;
    c.comboTimer -= dt;
    if (c.comboTimer <= 0) c.combo = 0;
  }

  private addCombo(n: number, isAuto: boolean): void {
    const c = this.state.combat;
    c.comboTimer = CONFIG.COMBO_WINDOW_SEC + this.derived.comboWindowAdd;
    const increment = isAuto ? n * CONFIG.COMBO_AUTO_FACTOR : n;
    c.combo = Math.min(CONFIG.COMBO_CAP + this.derived.comboCapAdd, c.combo + increment);
  }

  // ---------------- 升级 ----------------
  upgradeUnlocked(id: UpgradeId): boolean {
    if (id === "aspd") return this.isUnlocked("aspd_upgrade");
    if (id === "critChance" || id === "critDamage") return this.isUnlocked("crit");
    return true;
  }

  // 五种基础升级都以当前关卡为硬上限。
  upgradeMaxLevel(_id: UpgradeId): number {
    return Math.max(1, Math.floor(this.state.combat.stage));
  }

  private buyUpgradeBatch(id: UpgradeId, requested: number, finalize = true): number {
    if (!this.upgradeUnlocked(id)) return 0;
    const from = this.state.player.upgrades[id];
    const remainingLevels = Math.max(0, this.upgradeMaxLevel(id) - from);
    const MAX_BUY = 100000000; // 1e8 级防御性上限，避免极端或损坏数据。
    const limit = Math.min(remainingLevels, Math.max(0, Math.floor(requested)), MAX_BUY);
    if (limit <= 0) return 0;

    const gold = toBig(this.state.player.gold);
    let lo = 0;
    let hi = limit;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (gold.gte(upgradeTotalCost(id, from, mid))) lo = mid;
      else hi = mid - 1;
    }
    if (lo <= 0) return 0;

    this.state.player.gold = gold.sub(upgradeTotalCost(id, from, lo)).toTuple();
    this.state.player.upgrades[id] = from + lo;
    if (finalize) {
      this.recomputeDerived();
      this.emit({ type: "levelUp", upgrade: id, level: from + lo });
    }
    return lo;
  }

  buyUpgrade(id: UpgradeId): boolean {
    return this.buyUpgradeBatch(id, 1) === 1;
  }

  buyUpgradeTimes(id: UpgradeId, times: number): number {
    return this.buyUpgradeBatch(id, times);
  }

  // 一次买满：购买不超过当前关卡硬上限的全部可负担等级。
  buyUpgradeMax(id: UpgradeId): number {
    return this.buyUpgradeBatch(id, 100000000);
  }

  private bestAffordableUpgrade(): UpgradeId | null {
    const candidates: UpgradeId[] = ["attack", "aspd", "critChance", "critDamage", "gold"];
    let best: { id: UpgradeId; score: number } | null = null;
    for (const id of candidates) {
      if (!this.upgradeUnlocked(id)) continue;
      if (this.state.player.upgrades[id] >= this.upgradeMaxLevel(id)) continue;
      const cost = upgradeCost(id, this.state.player.upgrades[id]);
      if (toBig(this.state.player.gold).lt(cost)) continue;
      const score = this.estimateGainLog(id);
      if (!best || score > best.score) best = { id, score };
    }
    return best?.id ?? null;
  }

  // Smart Buy：按 DPS 提升 / 成本选择下一项，保留单次购买语义供模拟与测试使用。
  smartBuy(): boolean {
    const id = this.bestAffordableUpgrade();
    return id ? this.buyUpgrade(id) : false;
  }

  // Auto-upgrade re-evaluates every bounded chunk, balancing fast catch-up with build efficiency.
  private smartBuyBurst(reevaluations: number, maxBatch: number): number {
    const cap = this.upgradeMaxLevel("attack");
    const levels = Object.values(this.state.player.upgrades);
    const maxGap = Math.max(0, ...levels.map((level) => cap - level));
    const batchSize = Math.min(maxBatch, Math.max(1, Math.ceil(maxGap / 2)));
    let total = 0;
    for (let pass = 0; pass < reevaluations; pass++) {
      const id = this.bestAffordableUpgrade();
      if (!id) break;
      const bought = this.buyUpgradeBatch(id, batchSize, false);
      if (bought <= 0) break;
      total += bought;
    }
    if (total > 0) this.recomputeDerived();
    return total;
  }

  // Smart Buy 买不起基础升级时，用技能核心升级主动/被动技能（收益/成本比选最优）
  private smartBuySkill(): boolean {
    const cores = toBig(this.state.skills.cores);
    if (cores.lte(Big.ZERO)) return false;
    const s = this.state;
    type Cand =
      | { kind: "active"; id: SkillId; score: number }
      | { kind: "passive"; id: PassiveId; score: number };
    let best: Cand | null = null;
    for (const inst of s.skills.actives) {
      const def = SKILL_DEFS[inst.id];
      const cost = skillCoreCost(inst.level);
      if (cores.lt(Big.fromNumber(cost))) continue;
      const cur = Math.max(1, skillEffect(def, inst.level));
      const next = Math.max(1, skillEffect(def, inst.level + 1));
      const gain = Math.log10(next / cur);
      const score = gain / Math.log10(cost + 1);
      if (!best || score > best.score) best = { kind: "active", id: inst.id, score };
    }
    for (const pid of PASSIVE_IDS) {
      const def = CONFIG.SKILL_PASSIVES[pid];
      const lv = s.skills.passives[pid] ?? 0;
      const cost = passiveCoreCost(lv);
      if (cores.lt(Big.fromNumber(cost))) continue;
      // 技能升级收益按 (1+effectPerLevel) 的对数估算
      const gain = Math.log10(1 + def.effectPerLevel);
      const score = gain / Math.log10(cost + 1);
      if (!best || score > best.score) best = { kind: "passive", id: pid, score };
    }
    if (!best) return false;
    if (best.kind === "active") {
      if (!sysUpgradeSkill(s, best.id)) return false;
    } else {
      if (!sysUpgradePassive(s, best.id)) return false;
    }
    this.recomputeDerived();
    return true;
  }

  private estimateGainLog(id: UpgradeId): number {
    const s = this.state;
    const cost = upgradeCost(id, s.player.upgrades[id]).log10();
    if (cost <= 0) return 0;
    let gain = 0;
    if (id === "attack") {
      const lv = s.player.upgrades.attack;
      gain = Math.log10(1.12); // 不含里程碑的保守估计
    } else if (id === "aspd") {
      const panel = (panelApsFor(lv(s, "aspd")));
      const next = panelApsFor(lv(s, "aspd") + 1);
      gain = Math.log10(effApsRatio(panel, next));
    } else if (id === "critChance") {
      const c = critChanceFor(s);
      gain = expectedCritMult(critChanceFromLevel(s.player.upgrades.critChance + 1), Big.fromNumber(critDmgFor(s))).div(Big.max(Big.ONE, expectedCritMult(c, Big.fromNumber(critDmgFor(s))))).log10();
    } else if (id === "critDamage") {
      const d = critDmgFor(s);
      gain = expectedCritMult(critChanceFor(s), Big.fromNumber(critDamageFromLevel(s.player.upgrades.critDamage + 1))).div(Big.max(Big.ONE, expectedCritMult(critChanceFor(s), Big.fromNumber(d)))).log10();
    } else if (id === "gold") {
      gain = 0.5 * Math.log10(1 + CONFIG.UPGRADES.gold.perLevel); // 指数增长：每级固定 ×(1+perLevel)
    }
    return gain / cost;
  }

  // ---------------- 装备 ----------------
  equipItem(uid: string): boolean {
    const ok = sysEquip(this.state, uid);
    if (ok) this.recomputeDerived();
    return ok;
  }
  unequip(slot: Parameters<typeof sysUnequip>[1]): boolean {
    const ok = sysUnequip(this.state, slot);
    if (ok) this.recomputeDerived();
    return ok;
  }
  canEnhance(slot: Parameters<typeof sysEnhance>[1]): boolean {
    return canEnhance(this.state, slot);
  }
  enhance(slot: Parameters<typeof sysEnhance>[1]): boolean {
    const ok = sysEnhance(this.state, slot);
    if (ok) this.recomputeDerived();
    return ok;
  }
  breakdown(uid: string): boolean {
    return sysBreakdown(this.state, uid, this.derived.shardGainMult);
  }
  setAutoBreakdown(rarity: Rarity | null): boolean {
    if (rarity && this.toolLevel("auto_breakdown") <= 0) return false;
    this.state.equipment.autoBreakdown = rarity;
    // 设定档位后立即清理背包存量并反馈
    const swept = this.sweepAutoBreakdownInventory();
    if (swept.count > 0) this.emit({ type: "autoBreakdown", count: swept.count, shards: swept.shards });
    return true;
  }
  reforge(uid: string): boolean {
    const ok = sysReforge(this.state, uid, this.rng, this.derived.reforgeCostMult);
    if (ok) this.recomputeDerived();
    return ok;
  }
  reforgeCostOf(uid: string): number {
    const item = this.state.equipment.slots[uid as EquipSlot] ?? this.state.equipment.inventory.find((e) => e.uid === uid);
    return item ? reforgeCost(item, this.derived.reforgeCostMult) : 0;
  }
  canReforge(uid: string): boolean {
    return sysCanReforge(this.state, uid, this.derived.reforgeCostMult);
  }
  overclockCostOf(slot: EquipSlot): number {
    const item = this.state.equipment.slots[slot];
    return item ? overclockCost(item) : 0;
  }
  canOverclock(slot: EquipSlot): boolean {
    return sysCanOverclock(this.state, slot);
  }
  overclock(slot: EquipSlot): boolean {
    const ok = sysOverclock(this.state, slot, this.rng);
    if (ok) this.recomputeDerived();
    return ok;
  }
  // 简单评分：主词条 × 强化 × 副词条数 × 超频（与 UI 共用 data/equipment.equipScore）
  private itemScore(item: EquipInstance): number {
    return equipScore(item);
  }
  scoreOf(item: EquipInstance): number {
    return equipScore(item);
  }
  // 自动换装：背包中评分更高的装备自动穿上（需购买工具）
  maybeAutoEquip(): void {
    if (this.toolLevel("auto_equip") <= 0) return;
    for (const item of [...this.state.equipment.inventory]) {
      const cur = this.state.equipment.slots[item.slot];
      if (!cur || this.itemScore(item) > this.itemScore(cur)) this.equipItem(item.uid);
    }
  }
  craft(slot: EquipSlot, rarity: Rarity): boolean {
    const ok = sysCraft(this.state, slot, rarity, this.rng, this.derived.craftCostMult);
    if (ok) this.recomputeDerived();
    return ok;
  }
  craftCostOf(slot: EquipSlot, rarity: Rarity): number {
    return craftCost(slot, rarity, this.derived.craftCostMult);
  }
  canCraft(slot: EquipSlot, rarity: Rarity): boolean {
    return sysCanCraft(this.state, slot, rarity, this.derived.craftCostMult);
  }
  enhanceCostOf(slot: Parameters<typeof sysEnhance>[1]): number {
    const item = this.state.equipment.slots[slot];
    return item ? enhanceCost(item) : 0;
  }

  // ---------------- 技能 ----------------
  cast(id: SkillId): boolean {
    const result = castSkill(this.state, id, this.timeSec);
    if (!result.ok) return false;
    this.emit({ type: "skillCast", skill: id });
    // 技能联动词条：冷却缩减 / 持续时间延长（装备词条）
    const inst = this.state.skills.actives.find((s) => s.id === id);
    if (inst) {
      inst.cdRemaining = Math.max(1, inst.cdRemaining * this.derived.skillCdMult);
      const def = SKILL_DEFS[id];
      if (def.duration > 0) inst.activeUntil = this.timeSec + def.duration * this.derived.skillDurationMult;
    }
    this.state.statistics.totalSkillCasts += 1;
    this.updateDailyQuest("skillCasts", 1);
    if (result.action.kind === "critical_strike") {
      this.buffs.criticalStrike.pending = true;
      this.buffs.criticalStrike.mult = result.action.mult;
    } else if (result.action.kind === "singularity_cannon" || result.action.kind === "emp_burst") {
      const dps = this.derived.dps;
      const damage = dps.mul(this.derived.skillDmgMult).mul(Big.fromNumber(result.action.mult));
      this.applyHit(damage, false, false, false, false, true);
      if (result.action.kind === "emp_burst" && this.state.combat.isBoss) {
        this.state.combat.bossTimer = Math.min(CONFIG.BOSS_TIMER_SEC, this.state.combat.bossTimer + result.action.bossFreezeSec);
      }
    } else if (result.action.kind === "data_flood") {
      const gold = enemyGold(this.state.combat.stage, this.derived.hpGrowth).mul(Big.fromNumber(result.action.mult)).mul(this.derived.goldMult);
      this.state.player.gold = toBig(this.state.player.gold).add(gold).toTuple();
      this.state.statistics.totalGold = toBig(this.state.statistics.totalGold).add(gold).toTuple();
      this.state.daily.goldEarned = toBig(this.state.daily.goldEarned).add(gold).toTuple();
      this.updateDailyGold();
    } else if (result.action.kind === "charged_hit") {
      this.buffs.chargedHit.pending = true;
      this.buffs.chargedHit.mult = result.action.mult;
    } else if (result.action.kind === "quantum_replay") {
      for (const inst of this.state.skills.actives) {
        if (inst.id === id) continue;
        inst.cdRemaining = Math.max(0, inst.cdRemaining - result.action.seconds);
      }
    }
    this.recomputeDerived();
    return true;
  }
  upgradeSkill(id: SkillId): boolean {
    return sysUpgradeSkill(this.state, id);
  }
  canUpgradePassive(id: PassiveId): boolean {
    return sysCanUpgradePassive(this.state, id);
  }
  upgradePassive(id: PassiveId): boolean {
    const ok = sysUpgradePassive(this.state, id);
    if (ok) this.recomputeDerived();
    return ok;
  }
  // 解锁技能：skills 解锁后可用（技能核心用于升级，解锁免费）
  unlockSkill(id: SkillId): boolean {
    if (!this.isUnlocked("skills")) return false;
    if (this.state.skills.actives.some((s) => s.id === id)) return false;
    this.state.skills.actives.push({ id, level: 1, cdRemaining: 0, activeUntil: 0, active: false });
    this.recomputeDerived();
    return true;
  }

  // ---------------- 天赋 ----------------
  canAllocate(nodeId: string): boolean {
    return canAllocate(this.state, nodeId).ok;
  }
  allocate(nodeId: string): boolean {
    const ok = sysAllocate(this.state, nodeId);
    if (ok) this.recomputeDerived();
    return ok;
  }
  // ---------------- 天赋溢出转化 ----------------
  private grantTalentPoints(amount: number): void {
    const safeAmount = Math.max(0, Math.floor(amount));
    if (safeAmount <= 0) return;
    this.state.talents.points += safeAmount;
    let residueGained = 0;
    while (sysCanConvertOverflow(this.state)) residueGained += sysConvertOverflow(this.state);
    if (residueGained > 0) {
      this.recomputeDerived();
      for (let i = 0; i < residueGained; i += 1) {
        this.emit({ type: "talentOverflow", residue: this.state.talents.residue });
      }
    }
  }
  canConvertTalentOverflow(): boolean {
    return sysCanConvertOverflow(this.state);
  }
  convertTalentOverflow(): number {
    const n = sysConvertOverflow(this.state);
    if (n > 0) this.recomputeDerived();
    return n;
  }

  resetTree(tree: Parameters<typeof sysResetTree>[1]): void {
    sysResetTree(this.state, tree);
    this.recomputeDerived();
  }

  // ---------------- 构筑预设 ----------------
  buildPresetCostOf(slot: number): number {
    const preset = this.state.talents.presets[slot];
    if (!preset) return 0;
    let cost = 0;
    for (const [nodeId, pts] of Object.entries(preset.talents)) {
      const def = talentNodeById(nodeId);
      if (def && pts > 0) cost += pts * def.cost;
    }
    return cost;
  }
  saveBuild(slot: number, name: string): boolean {
    if (slot < 0 || slot >= this.state.talents.presets.length) return false;
    this.state.talents.presets[slot] = {
      name,
      talents: { ...this.state.talents.allocations },
      keystones: { ...this.state.talents.keystones },
    };
    return true;
  }
  canLoadBuild(slot: number): boolean {
    const preset = this.state.talents.presets[slot];
    if (!preset || !preset.name) return false;
    // 全量重置后可用点 = 未投入点 + 已投入点（按 cost 返还）
    let available = this.state.talents.points;
    for (const [nodeId, pts] of Object.entries(this.state.talents.allocations)) {
      const def = talentNodeById(nodeId);
      if (def && pts > 0) available += pts * def.cost;
    }
    return available >= this.buildPresetCostOf(slot);
  }
  loadBuild(slot: number): boolean {
    const preset = this.state.talents.presets[slot];
    if (!preset || !preset.name || !this.canLoadBuild(slot)) return false;
    for (const tree of Object.keys(TALENT_TREES) as TreeId[]) {
      sysResetTree(this.state, tree);
    }
    for (const [nodeId, pts] of Object.entries(preset.talents)) {
      if (pts <= 0) continue;
      const def = talentNodeById(nodeId);
      if (!def) continue;
      this.state.talents.allocations[nodeId] = pts;
      this.state.talents.points -= pts * def.cost;
      if (def.type === "keystone") this.state.talents.keystones[def.tree] = nodeId;
    }
    for (const [tree, nodeId] of Object.entries(preset.keystones)) {
      if (nodeId) this.state.talents.keystones[tree as TreeId] = nodeId;
    }
    // 防御：保证可用点数不为负
    if (this.state.talents.points < 0) this.state.talents.points = 0;
    this.recomputeDerived();
    return true;
  }

  // ---------------- 重构 ----------------
  prestigeRequiredStage(): number {
    return prestigeStageRequirement(this.state);
  }
  canPrestige(): boolean {
    const discovered = this.state.meta.discoveries.includes("prestige") || this.isUnlocked("prestige");
    if (!discovered) return false;
    return sysCanPrestige(this.state);
  }
  prestige(): { energyGained: number; talentGained: number } | null {
    if (!this.canPrestige()) return null;
    const reachedStage = this.state.combat.stage;
    const result = computePrestige(this.state);
    if (result.energyGained <= 0) return null;
    applyPrestige(this.state, result.energyGained, result.goldKept);
    const talentGained = CONFIG.TALENT_POINTS_PER_PRESTIGE + Math.floor(reachedStage / CONFIG.TALENT_STAGE_MILESTONE);
    resetTalentRewardCycle(this.state);
    this.grantTalentPoints(talentGained);
    this.buffs = emptyBuffs();
    this.attackCounter = 0;
    this.attackBudget = 0;
    this.spawnEnemy();
    this.recomputeDerived();
    this.emit({ type: "prestige", energyGained: result.energyGained });
    return { energyGained: result.energyGained, talentGained };
  }
  buyPrestigeUpgrade(id: Parameters<typeof buyPrestigeUpgrade>[1]): boolean {
    const ok = buyPrestigeUpgrade(this.state, id);
    if (ok) this.recomputeDerived();
    return ok;
  }
  prestigeShopCost(id: Parameters<typeof buyPrestigeUpgrade>[1]): number {
    return canBuy(this.state, id) ? 0 : 0; // 实际价格由 UI 用 shopCost 计算
  }

  // ---------------- 世界跃迁（第二层重置）----------------
  leapRequiredStage(): number {
    return leapStageRequirement(this.state);
  }
  canLeap(): boolean {
    return sysCanLeap(this.state);
  }
  leap(): { cores: number } | null {
    if (!this.canLeap()) return null;
    const cores = leapCores(this.state);
    applyLeap(this.state, cores);
    resetTalentRewardCycle(this.state);
    this.buffs = emptyBuffs();
    this.attackCounter = 0;
    this.attackBudget = 0;
    this.spawnEnemy();
    this.recomputeDerived();
    this.emit({ type: "leap", cores });
    return { cores };
  }
  buyLeapUpgrade(id: Parameters<typeof sysBuyLeapUpgrade>[1]): boolean {
    const ok = sysBuyLeapUpgrade(this.state, id);
    if (ok) this.recomputeDerived();
    return ok;
  }
  leapShopCost(id: Parameters<typeof sysBuyLeapUpgrade>[1]): number {
    return leapShopCost(this.state, id);
  }
  canBuyLeap(id: Parameters<typeof sysBuyLeapUpgrade>[1]): boolean {
    return sysCanBuyLeap(this.state, id);
  }

  // ---------------- 法则重写（第三层重置）----------------
  canRewriteLaw(): boolean {
    return sysCanRewriteLaw(this.state);
  }
  rewriteLaw(): { shards: number } | null {
    if (!this.canRewriteLaw()) return null;
    const shards = lawShards(this.state);
    applyLawRewrite(this.state, shards);
    resetTalentRewardCycle(this.state);
    this.buffs = emptyBuffs();
    this.attackCounter = 0;
    this.attackBudget = 0;
    this.spawnEnemy();
    this.recomputeDerived();
    this.emit({ type: "lawRewrite", shards });
    return { shards };
  }
  buyLawPatch(id: Parameters<typeof sysBuyLawPatch>[1]): boolean {
    const ok = sysBuyLawPatch(this.state, id);
    if (ok) this.recomputeDerived();
    return ok;
  }
  lawShopCost(id: Parameters<typeof sysBuyLawPatch>[1]): number {
    return sysLawShopCost(this.state, id);
  }
  canBuyLaw(id: Parameters<typeof sysBuyLawPatch>[1]): boolean {
    return sysCanBuyLaw(this.state, id);
  }

  // ---------------- 法则彼岸（第 4 维度）----------------
  private checkNexusUnlock(): void {
    if (this.state.nexus.unlocked) return;
    if ((this.state.leap?.purchases?.newWorld ?? 0) >= CONFIG.NEXUS.REQUIRED_NEW_WORLD
        && toBig(this.state.laws.shards).gte(Big.fromNumber(CONFIG.NEXUS.ENTRY_SHARDS))) {
      this.state.nexus.unlocked = true;
      this.emit({ type: "unlock", key: "nexus", label: "法则彼岸（第 4 维度）" });
    }
  }
  // 超维回响解锁：彼岸已进入 + 累计回响印记达标
  private checkEchoUnlock(): void {
    if (this.state.echo.unlocked) return;
    if (this.state.nexus?.entered && this.state.echo.totalSealsEarned >= CONFIG.ECHO.ENTRY_SEALS) {
      this.state.echo.unlocked = true;
      this.emit({ type: "unlock", key: "echo", label: "超维回响（第 5 维度）" });
    }
  }
  canEnterNexus(): boolean {
    return sysCanEnterNexus(this.state);
  }
  enterNexus(): { dimension: number } | null {
    if (!this.canEnterNexus()) return null;
    if (!sysEnterNexus(this.state)) return null;
    this.buffs = emptyBuffs();
    this.attackCounter = 0;
    this.attackBudget = 0;
    this.resetRunForNexus();
    resetTalentRewardCycle(this.state);
    this.spawnEnemy();
    this.recomputeDerived();
    this.emit({ type: "nexusEnter", dimension: this.state.nexus.dimension });
    return { dimension: this.state.nexus.dimension };
  }
  buyNexusUpgrade(id: NexusUpgradeId): boolean {
    const ok = sysBuyNexusUpgrade(this.state, id);
    if (ok) this.recomputeDerived();
    return ok;
  }
  nexusShopCost(id: NexusUpgradeId): number {
    return sysNexusShopCost(this.state, id);
  }
  canBuyNexus(id: NexusUpgradeId): boolean {
    return sysCanBuyNexus(this.state, id);
  }
  // ---------------- 超维回响（第 5 维度）----------------
  canEnterEcho(): boolean {
    return sysCanEnterEcho(this.state);
  }
  enterEcho(): { dimension: number } | null {
    if (!this.canEnterEcho()) return null;
    if (!sysEnterEcho(this.state)) return null;
    this.buffs = emptyBuffs();
    this.attackCounter = 0;
    this.attackBudget = 0;
    this.resetRunForEcho();
    resetTalentRewardCycle(this.state);
    this.spawnEnemy();
    this.recomputeDerived();
    this.emit({ type: "echoEnter", dimension: this.state.echo.dimension });
    return { dimension: this.state.echo.dimension };
  }
  buyEchoUpgrade(id: EchoUpgradeId): boolean {
    const ok = sysBuyEchoUpgrade(this.state, id);
    if (ok) this.recomputeDerived();
    return ok;
  }
  echoShopCost(id: EchoUpgradeId): number {
    return sysEchoShopCost(this.state, id);
  }
  canBuyEcho(id: EchoUpgradeId): boolean {
    return sysCanBuyEcho(this.state, id);
  }
  // 跨入彼岸：重置第三层以下的一切（关卡/金币/升级/装备/技能/天赋/重构），
  // 保留：统计/成就/世界核心已购升级/法则补丁/法则碎片（货币）/工具/彼岸状态
  private resetRunForNexus(): void {
    const state = this.state;
    state.combat = {
      stage: 1, enemyHp: [0, 0], enemyMaxHp: [0, 0], isBoss: false, bossAffixes: [],
      bossTimer: -1, combo: 0, comboTimer: 0, crushStreak: 0, skipMode: false,
      lastHitWasCrit: false, lastHitWasSuper: false, lastHitWasCrush: false,
      enemyKind: "normal", bossShieldHits: 0, bossVoidTarget: null,
    };
    state.player.gold = [0, 0];
    state.player.upgrades = { attack: 0, aspd: 0, critChance: 0, critDamage: 0, gold: 0 };
    state.equipment = { slots: {}, inventory: [], fragments: [0, 0], autoBreakdown: null };
    state.skills = { actives: [], passives: { rhythm: 0, focus: 0, greed: 0 }, cores: [0, 0] };
    state.talents = { ...state.talents, points: 0, allocations: {}, keystones: {} };
    state.prestige = { energy: 0, totalEnergyEarned: 0, nextRequiredStage: CONFIG.PRESTIGE.BASE_STAGE, purchases: {} };
    state.leap.nextRequiredStage = CONFIG.LEAP.STAGE;
    state.leap.purchases = {};
    state.laws.purchases = {};
    state.statistics.runDamage = [0, 0];
  }

  // 跨入超维回响：重置第二层以下的一切（关卡/金币/升级/装备/技能/天赋/重构），
  // 保留：统计/成就/世界核心升级/法则补丁/法则碎片/彼岸已购/回响印记（货币）/工具
  private resetRunForEcho(): void {
    const state = this.state;
    state.combat = {
      stage: 1, enemyHp: [0, 0], enemyMaxHp: [0, 0], isBoss: false, bossAffixes: [],
      bossTimer: -1, combo: 0, comboTimer: 0, crushStreak: 0, skipMode: false,
      lastHitWasCrit: false, lastHitWasSuper: false, lastHitWasCrush: false,
      enemyKind: "normal", bossShieldHits: 0, bossVoidTarget: null,
    };
    state.player.gold = [0, 0];
    state.player.upgrades = { attack: 0, aspd: 0, critChance: 0, critDamage: 0, gold: 0 };
    state.equipment = { slots: {}, inventory: [], fragments: [0, 0], autoBreakdown: null };
    state.skills = { actives: [], passives: { rhythm: 0, focus: 0, greed: 0 }, cores: [0, 0] };
    state.talents = { ...state.talents, points: 0, allocations: {}, keystones: {} };
    state.prestige = { energy: 0, totalEnergyEarned: 0, nextRequiredStage: CONFIG.PRESTIGE.BASE_STAGE, purchases: {} };
    state.leap.nextRequiredStage = CONFIG.LEAP.STAGE;
    state.leap.purchases = {};
    state.laws.purchases = {};
    state.nexus.purchases = {};
    state.statistics.runDamage = [0, 0];
  }

  // ---------------- 挑战模式 ----------------
  startChallenge(id: ChallengeId): boolean {
    if (this.state.meta.activeChallenge === id) return false;
    if (this.state.meta.activeModifiers.length > 0) this.state.meta.activeModifiers = [];
    this.resetRunForChallenge();
    this.state.meta.activeChallenge = id;
    const progress = this.state.challenges[id];
    progress.best = Math.max(1, progress.best);
    progress.cycleBest = 1;
    progress.runRewardClaimed = false;
    this.recomputeDerived();
    this.emit({ type: "challengeStart", id });
    return true;
  }
  stopChallenge(): void {
    if (!this.state.meta.activeChallenge) return;
    this.state.meta.activeChallenge = null;
    this.recomputeDerived();
  }
  // ---------------- 试炼赛季（多 Debuff 挑战） ----------------
  isSeasonUnlocked(): boolean {
    return CONFIG.SEASON.UNLOCK_CHALLENGES.every((id) => this.state.challenges[id]?.claimed);
  }
  isSeasonRun(): boolean {
    return this.state.meta.activeModifiers.length > 0;
  }
  startSeason(mods: ChallengeId[]): boolean {
    const unique = new Set(mods);
    const valid = mods.length >= 1 && mods.length <= CONFIG.SEASON.MAX_MODIFIERS
      && unique.size === mods.length && mods.every((id) => Boolean(CONFIG.CHALLENGES[id]));
    if (!valid || !this.isSeasonUnlocked()) return false;
    if (this.state.meta.activeChallenge) this.state.meta.activeChallenge = null;
    this.state.meta.activeModifiers = [...mods];
    this.state.season.unlocked = true;
    this.state.season.lastModifiers = [...mods];
    for (const id of mods) {
      const progress = this.state.challenges[id];
      progress.cycleBest = 1;
      progress.runRewardClaimed = false;
    }
    this.recomputeDerived();
    this.resetRunForChallenge();
    this.emit({ type: "seasonStart", modifiers: mods });
    return true;
  }
  stopSeason(): void {
    if (this.state.meta.activeModifiers.length === 0) return;
    this.state.meta.activeModifiers = [];
    this.recomputeDerived();
  }
  seasonScoreOf(stage: number, mods: ChallengeId[] = this.state.meta.activeModifiers): number {
    return seasonScore(stage, mods);
  }
  canClaimSeasonTier(tier: SeasonTierId): boolean {
    const def = CONFIG.SEASON.TIERS[tier];
    return this.state.season.bestScore >= def.threshold && !this.state.season.claimedTiers.includes(tier);
  }
  claimSeasonTier(tier: SeasonTierId): boolean {
    if (!this.canClaimSeasonTier(tier)) return false;
    const def = CONFIG.SEASON.TIERS[tier];
    this.state.season.claimedTiers.push(tier);
    this.state.skills.cores = toBig(this.state.skills.cores).add(Big.fromNumber(def.rewardCores)).toTuple();
    this.grantTalentPoints(def.rewardTalent);
    this.state.laws.shards += def.rewardShards;
    this.state.laws.totalShardsEarned += def.rewardShards;
    this.emit({ type: "seasonClaim", tier });
    return true;
  }
  challengeBest(id: ChallengeId): number {
    return this.state.challenges[id]?.best ?? 0;
  }
  challengeCycleTalentRemaining(): number {
    return challengeCycleTalentRemaining(this.state);
  }
  challengeRunReward(id: ChallengeId): number {
    const progress = this.state.challenges[id];
    if (!progress || progress.runRewardClaimed) return 0;
    const reached = Math.max(progress.cycleBest, this.state.meta.activeChallenge === id || this.state.meta.activeModifiers.includes(id) ? progress.best : 0);
    if (reached < CONFIG.CHALLENGES[id].target) return 0;
    return challengeTalentPotential(this.state, [id]);
  }
  activeChallengeRewardPreview(): number {
    const ids = this.state.meta.activeChallenge ? [this.state.meta.activeChallenge] : this.state.meta.activeModifiers;
    const eligible = ids.filter((id) => {
      const progress = this.state.challenges[id];
      return progress && !progress.runRewardClaimed && progress.cycleBest >= CONFIG.CHALLENGES[id].target;
    });
    return challengeTalentPotential(this.state, eligible);
  }
  canClaimChallenge(id: ChallengeId): boolean {
    return this.challengeRunReward(id) > 0;
  }
  claimChallenge(id: ChallengeId): boolean {
    const talentReward = this.challengeRunReward(id);
    if (talentReward <= 0) return false;
    const progress = this.state.challenges[id];
    const def = CONFIG.CHALLENGES[id];
    const firstClear = !progress.claimed;
    progress.runRewardClaimed = true;
    progress.cycleTalentRewarded += talentReward;
    if (firstClear) {
      progress.claimed = true;
      this.state.skills.cores = toBig(this.state.skills.cores).add(Big.fromNumber(def.rewardCores)).toTuple();
    }
    this.grantTalentPoints(talentReward);
    this.emit({ type: "challengeClaim", id });
    return true;
  }
  claimActiveChallengeRewards(): number {
    const ids = this.state.meta.activeChallenge ? [this.state.meta.activeChallenge] : [...this.state.meta.activeModifiers];
    let claimed = 0;
    for (const id of ids) if (this.claimChallenge(id)) claimed += 1;
    return claimed;
  }
  private resetRunForChallenge(): void {
    const state = this.state;
    state.combat = {
      stage: 1, enemyHp: [0, 0], enemyMaxHp: [0, 0], isBoss: false, bossAffixes: [],
      bossTimer: -1, combo: 0, comboTimer: 0, crushStreak: 0, skipMode: false,
      lastHitWasCrit: false, lastHitWasSuper: false, lastHitWasCrush: false,
      enemyKind: "normal", bossShieldHits: 0, bossVoidTarget: null,
    };
    state.player.gold = [0, 0];
    state.player.upgrades = { attack: 0, aspd: 0, critChance: 0, critDamage: 0, gold: 0 };
    const kept = ["equipment", "skills", "talents", "prestige", "achievements"];
    state.meta.unlocks = state.meta.unlocks.filter((u) => kept.includes(u) || u.startsWith("tool_") || u.startsWith("talent_unlock_"));
    for (const inst of state.skills.actives) {
      inst.cdRemaining = 0;
      inst.active = false;
      inst.activeUntil = 0;
    }
    this.buffs = emptyBuffs();
    this.attackCounter = 0;
    this.attackBudget = 0;
    this.spawnEnemy();
    this.checkUnlocks();
    this.recomputeDerived();
  }

  // ---------------- 每日任务 ----------------
  claimDailyQuest(index: number): boolean {
    const q = this.state.daily.quests[index];
    if (!q || q.claimed || q.progress < q.target) return false;
    q.claimed = true;
    const def = CONFIG.DAILY.POOL.find((d) => d.id === q.id);
    const cores = def?.rewardCores ?? 2;
    this.state.skills.cores = toBig(this.state.skills.cores).add(Big.fromNumber(cores)).toTuple();
    this.emit({ type: "dailyClaim", id: q.id });
    return true;
  }
  private updateDailyQuest(type: DailyQuestType, n: number): void {
    for (const q of this.state.daily.quests) {
      if (q.claimed || q.type !== type) continue;
      if (type === "gold" || type === "stageReach") q.progress = Math.max(q.progress, n);
      else q.progress = Math.min(q.target, q.progress + n);
    }
  }
  private updateDailyGold(): void {
    const mag = Math.floor(dailyGoldMag(this.state));
    this.updateDailyQuest("gold", Math.max(0, mag));
  }
  // ---------------- 道具 ----------------
  consumableCount(id: ItemId): number {
    return Math.min(CONFIG.CONSUMABLE_STACK_CAP, Math.max(0, Math.floor(this.state.items.consumables[id] ?? 0)));
  }
  consumableCost(id: ItemId): BigTuple {
    const def = CONFIG.CONSUMABLE_SHOP[id];
    const proportional = toBig(this.state.player.gold).mul(Big.fromNumber(def.goldFraction));
    return Big.max(Big.fromTuple(def.gold), proportional).toTuple();
  }
  consumablePurchaseReasons(id: ItemId): string[] {
    const def = CONFIG.CONSUMABLE_SHOP[id];
    const reasons: string[] = [];
    if (def.minStage && this.state.combat.stage < def.minStage) reasons.push(`需达到第 ${def.minStage} 关`);
    if (def.requiredUnlock && !this.isUnlocked(def.requiredUnlock) && !this.state.meta.discoveries.includes(def.requiredUnlock)) {
      reasons.push(`需先发现${def.requiredUnlock === "skills" ? "技能" : def.requiredUnlock}`);
    }
    if (this.consumableCount(id) >= CONFIG.CONSUMABLE_STACK_CAP) reasons.push(`库存已达 ${CONFIG.CONSUMABLE_STACK_CAP}`);
    if (this.consumableCount(id) <= 0) reasons.push("库存不足");
    return reasons;
  }
  canBuyConsumable(id: ItemId): boolean {
    return this.consumablePurchaseReasons(id).length === 0;
  }
  buyConsumable(id: ItemId): boolean {
    if (!this.canBuyConsumable(id)) return false;
    const cost = this.consumableCost(id);
    this.state.player.gold = toBig(this.state.player.gold).sub(Big.fromTuple(cost)).toTuple();
    this.state.items.consumables[id] = this.consumableCount(id) + 1;
    return true;
  }
  consumableUseReasons(id: ItemId): string[] {
    const reasons: string[] = [];
    if (this.consumableCount(id) <= 0) reasons.push("库存不足");
    if (id === "singularity_battery" && this.state.skills.actives.every((skill) => skill.cdRemaining <= 0)) reasons.push("当前没有需要恢复的技能冷却");
    return reasons;
  }
  canCastConsumable(id: ItemId): boolean {
    return this.consumableUseReasons(id).length === 0;
  }
  castConsumable(id: ItemId): boolean {
    if (!this.canCastConsumable(id)) return false;
    const count = this.consumableCount(id);
    this.state.items.consumables[id] = count - 1;
    const def = ITEM_DEFS[id];
    if (id === "overclock_chip") {
      this.buffs.chipActive = true;
      this.chipUntil = this.timeSec + CONFIG.CONSUMABLE_DURATION_SEC;
    } else if (id === "gold_protocol") {
      this.buffs.goldProtocolActive = true;
      this.protocolUntil = this.timeSec + CONFIG.CONSUMABLE_DURATION_SEC;
    } else if (id === "singularity_battery") {
      for (const inst of this.state.skills.actives) inst.cdRemaining = 0;
    }
    this.recomputeDerived();
    return true;
  }
  private tickConsumables(dt: number): void {
    if (this.buffs.chipActive && this.timeSec >= this.chipUntil) {
      this.buffs.chipActive = false;
      this.recomputeDerived();
    }
    if (this.buffs.goldProtocolActive && this.timeSec >= this.protocolUntil) {
      this.buffs.goldProtocolActive = false;
      this.recomputeDerived();
    }
  }

  // 永久工具：金币购买
  toolLevel(id: ToolId): number {
    const stored = Math.floor(this.state.items.toolLevels?.[id] ?? 0);
    if (stored > 0) return Math.min(stored, CONFIG.TOOLS[id].length);
    if (this.state.items.tools[id]) return id === "auto_upgrade" ? Math.min(2, CONFIG.TOOLS[id].length) : 1;
    return 0;
  }
  toolMaxLevel(id: ToolId): number {
    return CONFIG.TOOLS[id].length;
  }
  toolNextTier(id: ToolId): ToolTierConfig | null {
    return CONFIG.TOOLS[id][this.toolLevel(id)] ?? null;
  }
  toolCost(id: ToolId): BigTuple {
    return this.toolNextTier(id)?.gold ?? [0, 0];
  }
  toolOwned(id: ToolId): boolean {
    return this.toolLevel(id) > 0;
  }
  toolPurchaseReasons(id: ToolId): string[] {
    const tier = this.toolNextTier(id);
    if (!tier) return ["已满级"];
    const reasons: string[] = [];
    if (tier.minStage && this.state.combat.stage < tier.minStage) reasons.push(`需达到第 ${tier.minStage} 关`);
    if (tier.minPrestiges && this.state.statistics.totalPrestiges < tier.minPrestiges) reasons.push(`需完成 ${tier.minPrestiges} 次重构`);
    if (tier.energy && this.state.prestige.energy < tier.energy) reasons.push(`需持有 ${tier.energy} 奇点能量`);
    if (tier.requiredTalent && (this.state.talents.allocations[tier.requiredTalent] ?? 0) <= 0) reasons.push("需先取得天赋购买权限");
    if (tier.requiredUnlock && !this.state.meta.discoveries.includes(tier.requiredUnlock) && !this.isUnlocked(tier.requiredUnlock)) {
      reasons.push(`需先发现${tier.requiredUnlock === "skills" ? "技能" : "装备"}系统`);
    }
    if (toBig(this.state.player.gold).lt(Big.fromTuple(tier.gold))) reasons.push("金币不足");
    return reasons;
  }
  canBuyTool(id: ToolId): boolean {
    return this.toolNextTier(id) !== null && this.toolPurchaseReasons(id).length === 0;
  }
  buyTool(id: ToolId): boolean {
    const tier = this.toolNextTier(id);
    if (!tier || this.toolPurchaseReasons(id).length > 0) return false;
    this.state.player.gold = toBig(this.state.player.gold).sub(Big.fromTuple(tier.gold)).toTuple();
    const level = this.toolLevel(id) + 1;
    this.state.items.toolLevels[id] = level;
    this.state.items.tools[id] = true;
    this.emit({ type: "unlock", key: id, label: `${TOOL_DEFS[id].name} Lv${level}` });
    if (id === "auto_equip") this.maybeAutoEquip();
    if (id === "auto_breakdown" && this.state.equipment.autoBreakdown) {
      const swept = this.sweepAutoBreakdownInventory();
      if (swept.count > 0) this.emit({ type: "autoBreakdown", count: swept.count, shards: swept.shards });
    }
    return true;
  }
  setAutoPrestigeRule(rule: Partial<GameState["items"]["autoPrestigeRule"]>): void {
    const current = this.state.items.autoPrestigeRule;
    const metric = rule.metric && ["stage", "energy", "multRatio"].includes(rule.metric) ? rule.metric : current.metric;
    const comparator = rule.comparator && ["gte", "lte", "eq"].includes(rule.comparator) ? rule.comparator : current.comparator;
    const rawValue = rule.value ?? current.value;
    this.state.items.autoPrestigeRule = {
      enabled: typeof rule.enabled === "boolean" ? rule.enabled : current.enabled,
      metric,
      comparator,
      value: Number.isFinite(rawValue) ? Math.max(0, rawValue) : current.value,
    };
  }
  private matchesAutoPrestigeRule(): boolean {
    const rule = this.state.items.autoPrestigeRule;
    const gain = prestigeEnergy(toBig(this.state.statistics.runDamage));
    let actual: number;
    if (rule.metric === "stage") actual = this.state.combat.stage;
    else if (rule.metric === "energy") actual = gain;
    else {
      const amp = this.state.prestige.purchases.singularityAmp ?? 0;
      const before = prestigeGlobalMult(this.state.prestige.energy, amp);
      actual = prestigeGlobalMult(this.state.prestige.energy + gain, amp).div(before).toNumber();
    }
    if (!Number.isFinite(actual)) return rule.comparator === "gte";
    if (rule.comparator === "gte") return actual >= rule.value;
    if (rule.comparator === "lte") return actual <= rule.value;
    if (rule.metric === "stage" || rule.metric === "energy") return actual === Math.floor(rule.value);
    return Math.abs(actual - rule.value) <= Math.max(1e-9, Math.abs(rule.value) * 0.01);
  }

  // ---------------- Unlocks / achievements / milestones ----------------
  private checkUnlocks(): void {
    const stage = this.state.combat.stage;
    for (const u of CONFIG.UNLOCKS) {
      if (stage >= u.stage && !this.state.meta.unlocks.includes(u.key)) {
        this.state.meta.unlocks.push(u.key);
        if (!this.state.meta.discoveries.includes(u.key)) this.state.meta.discoveries.push(u.key);
        this.emit({ type: "unlock", key: u.key, label: u.label });
      }
    }
    if (this.state.meta.unlocks.includes("skills") && this.state.skills.actives.length === 0) {
      this.state.skills.actives = SKILL_IDS.map((id) => ({
        id, level: 1, cdRemaining: 0, activeUntil: 0, active: false,
      }));
    }
  }

  private checkAchievements(): void {
    let gained = 0;
    for (const def of ACHIEVEMENTS) {
      if (this.state.meta.achievements.includes(def.id)) continue;
      if (checkAchievement(def, this.state)) {
        this.state.meta.achievements.push(def.id);
        gained += CONFIG.TALENT_POINTS_FROM_ACHIEVEMENT;
        this.emit({ type: "achievement", id: def.id });
      }
    }
    if (gained > 0) this.grantTalentPoints(gained);
  }

  private checkMilestones(): void {
    const mag = toBig(this.state.statistics.totalDamage).log10();
    for (const m of CONFIG.MILESTONES) {
      if (mag >= m && !this.state.meta.milestonesSeen.includes(m)) {
        this.state.meta.milestonesSeen.push(m);
        this.emit({ type: "milestone", magnitude: m });
        this.recomputeDerived();
      }
    }
  }

  // ---------------- 离线 ----------------
  static offlineEfficiency(state: GameState, derived: ReturnType<typeof computeDerived>): number {
    const base = CONFIG.OFFLINE.EFFICIENCY + derived.offlineEffTalent;
    if (derived.hasKeystone.includes("offlineLord")) return 1;
    return Math.min(1, base);
  }

  static simulateOffline(state: GameState, durationSec: number): OfflineResult {
    const maxSec = Math.min(durationSec, CONFIG.OFFLINE.MAX_HOURS * 3600);
    const derived = computeDerived(state, emptyBuffs(), 0);
    const eff = GameEngine.offlineEfficiency(state, derived);
    const dps = derived.dps;
    const hpGrowth = GameEngine.effectiveHpGrowthOf(state);
    const killTimeOf = (st: number, isBoss: boolean): number => {
      const hp = isBoss ? bossHp(st, hpGrowth) : enemyHp(st, hpGrowth);
      const kt = hp.div(dps).toNumber();
      return Number.isFinite(kt) ? Math.max(0, kt) : Infinity;
    };
    const normalKillable = (st: number) => killTimeOf(st, false) <= CONFIG.OFFLINE.WALL_KILL_TIME_SEC;
    const bossKillable = (st: number) => killTimeOf(st, true) <= CONFIG.OFFLINE.BOSS_KILL_TIME_SEC;
    const killableAt = (st: number) => (isBossStage(st) ? bossKillable(st) : normalKillable(st));

    // 找「可稳定击杀的普通关」作为离线农场（只刷金币，不推进阶段；Boss 关不可作为农场防 10 倍金币刷取）
    const findFarm = (st: number): number => {
      let s = st;
      for (let back = 0; back < CONFIG.OFFLINE.FALLBACK_MAX_STAGES + 1 && s >= 1; back++) {
        if (!isBossStage(s) && normalKillable(s)) return s;
        if (s === 1) break;
        s -= 1;
      }
      return 1;
    };

    const startStage = state.combat.stage;
    let stage = startStage;
    let t = 0;
    let advanceKills = 0; // 推进类击杀（计入掉落）
    let farmKills = 0; // 农场重复击杀（只计统计，不计掉落，防墙前刷装备）
    let bossKills = 0;
    let gold = Big.ZERO;

    // 农场结算：以某个普通关的每秒金币 × 可用时长（效率在最后统一乘；击杀节奏与在线一致：killTime + 攻击间隔）
    const farm = (farmStage: number, availSec: number): void => {
      const kt = killTimeOf(farmStage, false);
      if (!Number.isFinite(kt) || kt <= 0) return;
      const hp = enemyHp(farmStage, hpGrowth);
      const crush = derived.damagePerHit.gte(hp.mul(Big.fromNumber(CONFIG.CRUSH_THRESHOLD)));
      const per = kt + (crush ? 0 : 0.3);
      const perSecGold = enemyGold(farmStage, hpGrowth).mul(derived.goldMult).div(Big.fromNumber(per));
      gold = gold.add(perSecGold.mul(Big.fromNumber(availSec)));
      farmKills += Math.floor((availSec / per) * eff);
    };

    while (t < maxSec) {
      if (isBossStage(stage)) {
        const bKillTime = killTimeOf(stage, true);
        // 打不动 Boss 或达到 Boss 击杀上限 → 转入农场（Boss 前普通关）
        if (!Number.isFinite(bKillTime) || bKillTime > CONFIG.OFFLINE.BOSS_KILL_TIME_SEC || bossKills >= CONFIG.OFFLINE.MAX_BOSS_KILLS) {
          farm(findFarm(stage), maxSec - t);
          t = maxSec;
          break;
        }
        const per = bKillTime;
        if (t + per > maxSec) {
          const frac = (maxSec - t) / per;
          gold = gold.add(enemyGold(stage, hpGrowth).mul(derived.goldMult).mul(Big.fromNumber(10)).mul(derived.bossGoldMult).mul(Big.fromNumber(Math.min(1, frac))));
          t = maxSec;
          break;
        }
        t += per;
        gold = gold.add(enemyGold(stage, hpGrowth).mul(derived.goldMult).mul(Big.fromNumber(10)).mul(derived.bossGoldMult));
        advanceKills++;
        bossKills++;
        stage++;
        continue;
      }
      const killTime = killTimeOf(stage, false);
      // 撞墙（普通怪打不动）→ 转入农场（墙前可稳定击杀的普通关）
      if (!Number.isFinite(killTime) || killTime > CONFIG.OFFLINE.WALL_KILL_TIME_SEC) {
        farm(findFarm(stage), maxSec - t);
        t = maxSec;
        break;
      }
      const hp = enemyHp(stage, hpGrowth);
      const crush = derived.damagePerHit.gte(hp.mul(Big.fromNumber(CONFIG.CRUSH_THRESHOLD)));
      const per = killTime + (crush ? 0 : 0.3);
      if (t + per > maxSec) {
        const frac = (maxSec - t) / per;
        gold = gold.add(enemyGold(stage, hpGrowth).mul(derived.goldMult).mul(Big.fromNumber(Math.min(1, frac))));
        t = maxSec;
        break;
      }
      t += per;
      gold = gold.add(enemyGold(stage, hpGrowth).mul(derived.goldMult));
      advanceKills++;
      stage++;
    }

    gold = gold.mul(Big.fromNumber(eff));
    const kills = advanceKills + farmKills;
    // 掉落只按「推进类击杀」计算（农场重复击杀不给掉落，防墙前刷装备）
    const expectedDrops = advanceKills * dropChance(Math.max(1, stage), derived.dropMult.toNumber() - 1);
    const drops = Math.min(CONFIG.OFFLINE.MAX_DROPS, Math.floor(expectedDrops));
    return {
      goldGained: gold,
      kills,
      stagesAdvanced: Math.max(0, stage - startStage),
      drops,
      seconds: maxSec, // 真实离线时长（封顶）；t 为模拟战斗墙内时间
      capped: durationSec > maxSec,
    };
  }

  // 生效怪物 HP 指数（含世界核心法则指数）
  static effectiveHpGrowthOf(state: GameState): number {
    const lawLv = state.leap?.purchases?.lawExponent ?? 0;
    const lawReduction = Math.min(0.12, lawLv * CONFIG.LEAP.SHOP.lawExponent.perLevel);
    return CONFIG.HP_GROWTH - lawReduction;
  }

  // 加载后结算离线（由应用层在构造引擎后调用）
  handleOffline(nowMs: number): OfflineResult | null {
    const elapsedSec = (nowMs - this.state.meta.lastSeenAt) / 1000;
    if (elapsedSec <= 5) {
      this.state.meta.lastSeenAt = nowMs;
      return null;
    }
    const result = GameEngine.simulateOffline(this.state, elapsedSec);
    if (result.seconds <= 0) {
      this.state.meta.lastSeenAt = nowMs;
      return null;
    }
    this.applyOfflineResult(result);
    this.state.meta.lastSeenAt = nowMs;
    // 只要真实离线超过 5s 就弹窗（显示真实时长；卡墙 0 收益也如实展示，时长已计入统计）
    return result;
  }

  private applyOfflineResult(result: OfflineResult): void {
    this.state.player.gold = toBig(this.state.player.gold).add(result.goldGained).toTuple();
    this.state.statistics.totalGold = toBig(this.state.statistics.totalGold).add(result.goldGained).toTuple();
    this.state.statistics.totalKills += result.kills;
    this.state.statistics.totalOfflineMs += result.seconds * 1000;
    let finalStage = this.state.combat.stage + result.stagesAdvanced;
    if (isBossStage(finalStage)) finalStage -= 1;
    if (finalStage < 1) finalStage = 1;
    this.state.combat.stage = finalStage;
    if (finalStage > this.state.statistics.allTimeMaxStage) this.state.statistics.allTimeMaxStage = finalStage;
    this.state.meta.lastSeenAt = Date.now();
    for (let i = 0; i < result.drops; i++) {
      const item = rollEquipment(this.rng, Math.max(1, finalStage), 0);
      this.dropItem(item);
      this.maybeAutoEquip();
    }
    this.spawnEnemy();
    this.checkUnlocks();
    this.recomputeDerived();
  }
}

// ---------------- 工具函数（Smart Buy 用） ----------------
function lv(s: GameState, id: UpgradeId): number {
  return s.player.upgrades[id];
}
function panelApsFor(level: number): number {
  return Math.min(1e6, CONFIG.BASE_APS * Math.pow(CONFIG.UPGRADES.aspd.effectPerLevel, level));
}
function effApsRatio(a: number, b: number): number {
  const fa = a <= CONFIG.APS_SOFT_CAP ? a : CONFIG.APS_SOFT_CAP + Math.sqrt(a - CONFIG.APS_SOFT_CAP);
  const fb = b <= CONFIG.APS_SOFT_CAP ? b : CONFIG.APS_SOFT_CAP + Math.sqrt(b - CONFIG.APS_SOFT_CAP);
  return fb / Math.max(0.0001, fa);
}
function critChanceFor(s: GameState): number {
  return critChanceFromLevel(lv(s, "critChance"));
}
function critDmgFor(s: GameState): number {
  return critDamageFromLevel(lv(s, "critDamage"));
}
