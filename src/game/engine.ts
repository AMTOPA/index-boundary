// 游戏引擎：纯逻辑，不依赖 React/DOM，可 headless 运行（测试与模拟器共用）
import { Big, toBig, type BigTuple } from "./bignum";
import { CONFIG } from "./config";
import type {
  BossAffix, ChallengeId, DailyQuestType, EquipInstance, EquipSlot, GameEvent, GameEventListener, GameState, ItemId, PassiveId, Rarity, SkillId, ToolId, UpgradeId, VoidTarget,
} from "./types";
import { Rng } from "./rng";
import {
  computeDerived, emptyBuffs, type RuntimeBuffs,
  enemyHp, enemyGold, isBossStage, bossHp, rollCrit, expectedCritMult,
  overflowGold, crushGold, upgradeCost, prestigeEnergy, pickSpecialEnemy,
} from "./formulas";
import {
  rollEquipment, addDrop, dropChance, equipItem as sysEquip, unequip as sysUnequip,
  enhance as sysEnhance, breakdown as sysBreakdown, canEnhance, enhanceCost,
  reforge as sysReforge, reforgeCost, canReforge as sysCanReforge,
  craft as sysCraft, craftCost, canCraft as sysCanCraft,
  overclock as sysOverclock, overclockCost, canOverclock as sysCanOverclock,
} from "./systems/equipment";
import { castSkill, tickSkills, upgradeSkill as sysUpgradeSkill, upgradePassive as sysUpgradePassive, canUpgradePassive as sysCanUpgradePassive } from "./systems/skills";
import { dailyGoldMag, ensureDaily } from "./systems/daily";
import { allocate as sysAllocate, resetTree as sysResetTree, canAllocate } from "./systems/talents";
import { applyPrestige, computePrestige, buyPrestigeUpgrade, canBuy } from "./systems/prestige";
import { checkAchievement, ACHIEVEMENTS } from "./data/achievements";
import { SKILL_DEFS, SKILL_IDS } from "./data/skills";
import { worldForStage, BOSS_AFFIX_LABEL, ELITE_AFFIX_POOL } from "./data/worlds";
import { ITEM_DEFS, TOOL_DEFS } from "./data/items";

export interface OfflineResult {
  goldGained: Big;
  kills: number;
  stagesAdvanced: number;
  drops: number;
  secondsSimulated: number;
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
      achievements: [],
      milestonesSeen: [],
      settings: { sound: true, reduceMotion: false },
      lastScoreSubmit: { stage: undefined, mag: undefined, prestige: undefined },
      cloudSyncedAt: 0,
      activeChallenge: null,
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
    talents: { points: 0, allocations: {}, keystones: {} },
    prestige: { energy: 0, totalEnergyEarned: 0, purchases: {} },
    items: { consumables: {}, tools: {} },
    statistics: {
      totalDamage: [0, 0], runDamage: [0, 0], totalGold: [0, 0], totalKills: 0, totalBossKills: 0,
      totalEliteKills: 0, totalMimicKills: 0,
      highestHit: [0, 0], totalClicks: 0, totalCrits: 0, totalSuperCrits: 0, totalSkillCasts: 0,
      totalPrestiges: 0, totalPlayTimeMs: 0, totalOfflineMs: 0, allTimeMaxStage: 1,
    },
    daily: { date: "", quests: [], goldEarned: [0, 0], bestStage: 1 },
    challenges: {
      no_crit: { best: 0, claimed: false },
      slow_universe: { best: 0, claimed: false },
      poverty: { best: 0, claimed: false },
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
  private autoUpgradeTimer = 0;
  private chipUntil = 0;
  private protocolUntil = 0;

  constructor(initial?: GameState) {
    this.state = initial ? initial : createNewState();
    this.rng = Rng.fromState(this.state.meta.rngState);
    this.buffs = emptyBuffs();
    ensureDaily(this.state);
    if (toBig(this.state.combat.enemyHp).isZero()) this.spawnEnemy();
    this.derived = computeDerived(this.state, this.buffs, this.timeSec);
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
  tick(dt: number): void {
    this.timeSec += dt;
    tickSkills(this.state, dt, this.timeSec);
    this.tickCombo(dt);
    this.tickBoss(dt);
    this.tickConsumables(dt);
    if (this.isUnlocked("auto_attack") && !this.state.combat.isBoss) {
      this.autoAttack(dt);
    }
    if (this.state.items.tools.auto_upgrade) {
      this.autoUpgradeTimer -= dt;
      if (this.autoUpgradeTimer <= 0) {
        this.autoUpgradeTimer = 0.5;
        this.smartBuy();
      }
    }
    // 自动释放技能：冷却结束且未在持续中的技能立即释放
    if (this.state.items.tools.auto_skill && this.state.skills.actives.length > 0) {
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
      damage = damage.mul(Big.fromNumber(voidCrit ? 1 : r.mult));
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
        const hit = d.damagePerHit.mul(Big.fromNumber(voidCrit ? 1 : r.mult));
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
    const total = d.damagePerHit.mul(Big.fromNumber(expected)).mul(Big.fromNumber(n));
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
    let gold = enemyGold(stage).mul(this.derived.goldMult);
    if (isBoss) gold = gold.mul(Big.fromNumber(10));
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
      const baseGold = enemyGold(stage).mul(this.derived.goldMult);
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
        this.state.talents.points += CONFIG.TALENT_POINTS_FROM_BOSS_FIRST_KILL;
      }
    } else if (kind === "elite") {
      this.state.statistics.totalEliteKills += 1;
      const item = rollEquipment(this.rng, stage, CONFIG.SPECIAL_ENEMIES.ELITE_DROP_LUCK);
      addDrop(this.state, item);
      this.maybeAutoEquip();
      this.emit({ type: "drop", rarity: item.rarity, slot: item.slot });
    } else if (kind === "mimic") {
      this.state.statistics.totalMimicKills += 1;
      const item = rollEquipment(this.rng, stage, 0.5);
      addDrop(this.state, item);
      this.maybeAutoEquip();
      this.emit({ type: "drop", rarity: item.rarity, slot: item.slot });
      if (this.rng.chance(CONFIG.SPECIAL_ENEMIES.MIMIC_CORE_CHANCE)) {
        this.state.skills.cores = toBig(this.state.skills.cores).add(Big.ONE).toTuple();
      }
    } else {
      if (this.rng.chance(dropChance(stage, this.derived.dropMult.toNumber() - 1))) {
        const item = rollEquipment(this.rng, stage, 0);
        addDrop(this.state, item);
      this.maybeAutoEquip();
        this.emit({ type: "drop", rarity: item.rarity, slot: item.slot });
      }
    }
    this.advanceStage(crush);
  }

  private grantBossRewards(stage: number): void {
    // 必掉装备
    const item = rollEquipment(this.rng, stage, 0);
    addDrop(this.state, item);
      this.maybeAutoEquip();
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
    // 挑战 / 每日任务进度
    const chId = this.state.meta.activeChallenge;
    if (chId) {
      const prog = this.state.challenges[chId];
      if (next > prog.best) prog.best = next;
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
      c.enemyMaxHp = bossHp(c.stage).toTuple();
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
        c.enemyMaxHp = enemyHp(c.stage).mul(Big.fromNumber(CONFIG.SPECIAL_ENEMIES.ELITE_HP_MULT)).toTuple();
        c.enemyHp = c.enemyMaxHp;
        c.bossAffixes = this.rollEliteAffixes();
        this.emit({ type: "eliteSpawn", affixes: c.bossAffixes });
      } else if (kind === "mimic") {
        c.enemyMaxHp = enemyHp(c.stage).mul(Big.fromNumber(CONFIG.SPECIAL_ENEMIES.MIMIC_HP_MULT)).toTuple();
        c.enemyHp = c.enemyMaxHp;
        this.emit({ type: "mimicSpawn" });
      } else {
        c.enemyMaxHp = enemyHp(c.stage).toTuple();
        c.enemyHp = c.enemyMaxHp;
      }
    }
  }

  private rollBossAffixes(): BossAffix[] {
    const pool = worldForStage(this.state.combat.stage).bossPool;
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
    if (this.state.items.tools.auto_boss) {
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

  buyUpgrade(id: UpgradeId): boolean {
    if (!this.upgradeUnlocked(id)) return false;
    const lv = this.state.player.upgrades[id];
    const cost = upgradeCost(id, lv);
    if (toBig(this.state.player.gold).lt(cost)) return false;
    this.state.player.gold = toBig(this.state.player.gold).sub(cost).toTuple();
    this.state.player.upgrades[id] = lv + 1;
    this.emit({ type: "levelUp", upgrade: id, level: lv + 1 });
    this.recomputeDerived();
    return true;
  }

  buyUpgradeTimes(id: UpgradeId, times: number): number {
    let bought = 0;
    for (let i = 0; i < times; i++) {
      if (!this.buyUpgrade(id)) break;
      bought++;
    }
    return bought;
  }

  // Smart Buy：按 DPS 提升 / 成本 选择
  smartBuy(): boolean {
    const candidates: UpgradeId[] = ["attack", "aspd", "critChance", "critDamage", "gold"];
    let best: { id: UpgradeId; score: number } | null = null;
    for (const id of candidates) {
      if (!this.upgradeUnlocked(id)) continue;
      const cost = upgradeCost(id, this.state.player.upgrades[id]);
      if (toBig(this.state.player.gold).lt(cost)) continue;
      const score = this.estimateGainLog(id);
      if (!best || score > best.score) best = { id, score };
    }
    if (!best) return false;
    return this.buyUpgrade(best.id);
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
      gain = Math.log10(expectedCritMult(c + 0.008, critDmgFor(s)) / Math.max(1, expectedCritMult(c, critDmgFor(s))));
    } else if (id === "critDamage") {
      const d = critDmgFor(s);
      gain = Math.log10(expectedCritMult(critChanceFor(s), d + 0.15) / Math.max(1, expectedCritMult(critChanceFor(s), d)));
    } else if (id === "gold") {
      gain = 0.5 * Math.log10(1 + 0.1 / (1 + s.player.upgrades.gold * 0.1));
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
    if (rarity && !this.state.items.tools.auto_breakdown) return false;
    this.state.equipment.autoBreakdown = rarity;
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
  // 简单评分：主词条 × 强化 × 副词条数 × 超频
  private itemScore(item: EquipInstance): number {
    return item.main.mult * (1 + item.level * 0.15) * (1 + item.affixes.length * 0.1) * (1 + (item.overclock ?? 0) * 0.2);
  }
  // 自动换装：背包中评分更高的装备自动穿上（需购买工具）
  maybeAutoEquip(): void {
    if (!this.state.items.tools.auto_equip) return;
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
      const gold = enemyGold(this.state.combat.stage).mul(Big.fromNumber(result.action.mult)).mul(this.derived.goldMult);
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
  resetTree(tree: Parameters<typeof sysResetTree>[1]): void {
    sysResetTree(this.state, tree);
    this.recomputeDerived();
  }

  // ---------------- 重构 ----------------
  canPrestige(): boolean {
    if (!this.isUnlocked("prestige")) return false;
    return prestigeEnergy(toBig(this.state.statistics.runDamage)) > 0;
  }
  prestige(): { energyGained: number } | null {
    if (!this.canPrestige()) return null;
    const result = computePrestige(this.state);
    if (result.energyGained <= 0) return null;
    applyPrestige(this.state, result.energyGained, result.goldKept);
    this.buffs = emptyBuffs();
    this.attackCounter = 0;
    this.attackBudget = 0;
    this.spawnEnemy();
    this.recomputeDerived();
    this.emit({ type: "prestige", energyGained: result.energyGained });
    return { energyGained: result.energyGained };
  }
  buyPrestigeUpgrade(id: Parameters<typeof buyPrestigeUpgrade>[1]): boolean {
    const ok = buyPrestigeUpgrade(this.state, id);
    if (ok) this.recomputeDerived();
    return ok;
  }
  prestigeShopCost(id: Parameters<typeof buyPrestigeUpgrade>[1]): number {
    return canBuy(this.state, id) ? 0 : 0; // 实际价格由 UI 用 shopCost 计算
  }

  // ---------------- 挑战模式 ----------------
  startChallenge(id: ChallengeId): boolean {
    if (this.state.meta.activeChallenge === id) return false;
    this.resetRunForChallenge();
    this.state.meta.activeChallenge = id;
    const prog = this.state.challenges[id];
    this.state.challenges[id] = { best: Math.max(1, prog.best), claimed: prog.claimed };
    this.recomputeDerived();
    this.emit({ type: "challengeStart", id });
    return true;
  }
  stopChallenge(): void {
    if (!this.state.meta.activeChallenge) return;
    this.state.meta.activeChallenge = null;
    this.recomputeDerived();
  }
  challengeBest(id: ChallengeId): number {
    return this.state.challenges[id]?.best ?? 0;
  }
  canClaimChallenge(id: ChallengeId): boolean {
    const prog = this.state.challenges[id];
    if (!prog || prog.claimed) return false;
    return prog.best >= CONFIG.CHALLENGES[id].target;
  }
  claimChallenge(id: ChallengeId): boolean {
    if (!this.canClaimChallenge(id)) return false;
    this.state.challenges[id].claimed = true;
    const def = CONFIG.CHALLENGES[id];
    this.state.skills.cores = toBig(this.state.skills.cores).add(Big.fromNumber(def.rewardCores)).toTuple();
    this.state.talents.points += def.rewardTalent;
    this.emit({ type: "challengeClaim", id });
    return true;
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
  castConsumable(id: ItemId): boolean {
    const count = this.state.items.consumables[id] ?? 0;
    if (count <= 0) return false;
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
  toolCost(id: ToolId): BigTuple {
    return CONFIG.TOOLS[id];
  }
  toolOwned(id: ToolId): boolean {
    return this.state.items.tools[id] === true;
  }
  canBuyTool(id: ToolId): boolean {
    if (this.toolOwned(id)) return false;
    const cost = Big.fromTuple(CONFIG.TOOLS[id]);
    return toBig(this.state.player.gold).gte(cost);
  }
  buyTool(id: ToolId): boolean {
    if (this.toolOwned(id)) return false;
    const cost = Big.fromTuple(CONFIG.TOOLS[id]);
    if (toBig(this.state.player.gold).lt(cost)) return false;
    this.state.player.gold = toBig(this.state.player.gold).sub(cost).toTuple();
    this.state.items.tools[id] = true;
    this.emit({ type: "unlock", key: id, label: TOOL_DEFS[id].name });
    if (id === "auto_equip") this.maybeAutoEquip();
    return true;
  }

  // ---------------- 解锁 / 成就 / 里程碑 ----------------
  private checkUnlocks(): void {
    const stage = this.state.combat.stage;
    for (const u of CONFIG.UNLOCKS) {
      if (stage >= u.stage && !this.state.meta.unlocks.includes(u.key)) {
        this.state.meta.unlocks.push(u.key);
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
    if (gained > 0) this.state.talents.points += gained;
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
    const buffs = emptyBuffs();
    const derived = computeDerived(state, buffs, 0);
    const eff = GameEngine.offlineEfficiency(state, derived);
    const dps = derived.dps;
    let t = 0;
    let kills = 0;
    let stage = state.combat.stage;
    let gold = Big.ZERO;
    while (t < maxSec) {
      if (isBossStage(stage)) break;
      const hp = enemyHp(stage);
      const killTime = hp.div(dps).toNumber();
      if (!Number.isFinite(killTime) || killTime > CONFIG.OFFLINE.WALL_KILL_TIME_SEC) break;
      const crush = derived.damagePerHit.gte(hp.mul(Big.fromNumber(CONFIG.CRUSH_THRESHOLD)));
      const per = killTime + (crush ? 0 : 0.3);
      if (t + per > maxSec) {
        const frac = (maxSec - t) / per;
        gold = gold.add(enemyGold(stage).mul(derived.goldMult).mul(Big.fromNumber(Math.min(1, frac))));
        t = maxSec;
        break;
      }
      t += per;
      gold = gold.add(enemyGold(stage).mul(derived.goldMult));
      kills++;
      stage++;
    }
    gold = gold.mul(Big.fromNumber(eff));
    const expectedDrops = kills * dropChance(Math.max(1, stage), derived.dropMult.toNumber() - 1);
    const drops = Math.min(CONFIG.OFFLINE.MAX_DROPS, Math.floor(expectedDrops));
    return {
      goldGained: gold,
      kills,
      stagesAdvanced: stage - state.combat.stage,
      drops,
      secondsSimulated: t,
      capped: durationSec > maxSec,
    };
  }

  // 加载后结算离线（由应用层在构造引擎后调用）
  handleOffline(nowMs: number): OfflineResult | null {
    const elapsedSec = (nowMs - this.state.meta.lastSeenAt) / 1000;
    if (elapsedSec <= 5) {
      this.state.meta.lastSeenAt = nowMs;
      return null;
    }
    const result = GameEngine.simulateOffline(this.state, elapsedSec);
    if (result.secondsSimulated <= 0) {
      this.state.meta.lastSeenAt = nowMs;
      return null;
    }
    this.applyOfflineResult(result);
    this.state.meta.lastSeenAt = nowMs;
    return result;
  }

  private applyOfflineResult(result: OfflineResult): void {
    this.state.player.gold = toBig(this.state.player.gold).add(result.goldGained).toTuple();
    this.state.statistics.totalGold = toBig(this.state.statistics.totalGold).add(result.goldGained).toTuple();
    this.state.statistics.totalKills += result.kills;
    this.state.statistics.totalOfflineMs += result.secondsSimulated * 1000;
    let finalStage = this.state.combat.stage + result.stagesAdvanced;
    if (isBossStage(finalStage)) finalStage -= 1;
    if (finalStage < 1) finalStage = 1;
    this.state.combat.stage = finalStage;
    if (finalStage > this.state.statistics.allTimeMaxStage) this.state.statistics.allTimeMaxStage = finalStage;
    this.state.meta.lastSeenAt = Date.now();
    for (let i = 0; i < result.drops; i++) {
      const item = rollEquipment(this.rng, Math.max(1, finalStage), 0);
      addDrop(this.state, item);
      this.maybeAutoEquip();
    }
    this.spawnEnemy();
    this.checkUnlocks();
    this.recomputeDerived();
    this.emit({ type: "offline", seconds: result.secondsSimulated, gold: result.goldGained.toTuple() });
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
  return CONFIG.BASE_CRIT_CHANCE + lv(s, "critChance") * CONFIG.UPGRADES.critChance.perLevel;
}
function critDmgFor(s: GameState): number {
  return CONFIG.BASE_CRIT_DAMAGE + lv(s, "critDamage") * CONFIG.UPGRADES.critDamage.perLevel;
}