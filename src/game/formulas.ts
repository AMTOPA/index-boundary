// 纯数学层：无副作用，全部输入输出可测
import { Big, toBig } from "./bignum";
import { CONFIG, milestoneMultFor } from "./config";
import type { ChallengeId, DerivedStats, EnemyKind, EquipSlot, GameState, UpgradeId } from "./types";
import { talentNodeById, type KeystoneKey } from "./data/talents";
import { leapAllStatsMult } from "./systems/leap";
import { lawCritExp, lawGoldBoost, lawApsCapAdd, lawGoldToDmgMult } from "./systems/law";
import { SKILL_DEFS, skillEffect } from "./data/skills";

// ---------------- 挑战修饰符 / 试炼赛季 ----------------

export function activeMods(state: GameState): ChallengeId[] {
  if (state.meta.activeModifiers.length > 0) return state.meta.activeModifiers;
  if (state.meta.activeChallenge) return [state.meta.activeChallenge];
  return [];
}

// 赛季分 = 关卡 × (1 + 每个修饰符权重之和)；取整
export function seasonScore(stage: number, mods: ChallengeId[]): number {
  const mult = 1 + mods.length * CONFIG.SEASON.WEIGHT_PER_MODIFIER;
  return Math.floor(stage * mult);
}

// ---------------- 升级 ----------------

export function upgradeCost(id: UpgradeId, level: number): Big {
  const u = CONFIG.UPGRADES[id];
  const growth = Big.fromNumber(u.growth).pow(level);
  let cost = Big.fromNumber(u.baseCost).mul(growth);
  if (u.rebaseEvery > 0 && level >= u.rebaseEvery) {
    const rebase = Math.pow(u.rebaseMult, Math.floor(level / u.rebaseEvery));
    cost = cost.mul(Big.fromNumber(rebase));
  }
  return cost;
}

export function attackMult(level: number): Big {
  let m = Big.fromNumber(CONFIG.UPGRADES.attack.effectPerLevel).pow(level);
  const mults: number[] = [];
  for (const ms of CONFIG.UPGRADES.attack.milestones) {
    if (level >= ms.level) mults.push(ms.mult);
  }
  const repeatEvery = CONFIG.UPGRADES.attack.milestoneRepeatEvery;
  if (level >= repeatEvery) {
    const repeats = Math.floor(level / repeatEvery);
    for (let r = 2; r <= repeats; r++) mults.push(10);
  }
  for (const mult of mults) m = m.mul(Big.fromNumber(mult));
  return m;
}

export function baseAttack(level: number): Big {
  return attackMult(level).mul(Big.fromNumber(10));
}

export function panelApsFromLevel(level: number): number {
  const raw = CONFIG.BASE_APS * Math.pow(CONFIG.UPGRADES.aspd.effectPerLevel, level);
  return Math.min(raw, 1e6); // 防御性截断，避免 Number 溢出
}

export function effectiveAps(panel: number, capAdd = 0): number {
  const cap = CONFIG.APS_SOFT_CAP + capAdd;
  if (panel <= cap) return panel;
  return cap + Math.sqrt(panel - cap);
}

export function critChanceFromLevel(level: number): number {
  // 渐近软上限：早期 ≈ 每级 0.8%，随等级饱和到 CRIT_CHANCE_UPGRADE_CAP（升级单独永远到不了 100%）
  const per = CONFIG.UPGRADES.critChance.perLevel;
  const cap = CONFIG.CRIT_CHANCE_UPGRADE_CAP;
  const growth = per / cap;
  return CONFIG.BASE_CRIT_CHANCE + cap * (1 - Math.pow(1 - growth, level));
}

export function critDamageFromLevel(level: number): number {
  const def = CONFIG.UPGRADES.critDamage;
  let cd = CONFIG.BASE_CRIT_DAMAGE + level * def.perLevel;
  // 里程碑（镜像攻击升级，起点后移避免加速前期）：75/140/280/520 级 ×1.5/×2/×3/×5，之后每 200 级再 ×5
  if (def.milestones) {
    for (const ms of def.milestones) {
      if (level >= ms.level) cd *= ms.mult;
    }
    const rep = def.milestoneRepeatEvery ?? 0;
    if (rep > 0 && level >= rep) {
      const repeats = Math.floor(level / rep);
      for (let r = 2; r <= repeats; r++) cd *= 5;
    }
  }
  return cd;
}

export function goldMultFromLevel(level: number): number {
  return 1 + level * CONFIG.UPGRADES.gold.perLevel;
}

// ---------------- 怪物 ----------------

export function enemyHp(stage: number, hpGrowth: number = CONFIG.HP_GROWTH): Big {
  return Big.fromNumber(CONFIG.HP_BASE).mul(Big.fromNumber(hpGrowth).pow(stage));
}

export function enemyGold(stage: number, hpGrowth: number = CONFIG.HP_GROWTH): Big {
  return enemyHp(stage, hpGrowth).pow(CONFIG.GOLD_HP_EXPONENT);
}

export function isBossStage(stage: number): boolean {
  return stage % CONFIG.BOSS_EVERY === 0;
}

export function bossHp(stage: number, hpGrowth: number = CONFIG.HP_GROWTH): Big {
  return enemyHp(stage, hpGrowth).mul(Big.fromNumber(CONFIG.BOSS_HP_MULT));
}

// 特殊敌人判定（纯函数，引擎注入 roll）：roll ∈ [0,1)；优先宝箱怪，其次精英；Boss 关与极速推进只出普通怪
export function pickSpecialEnemy(
  roll: number,
  isBoss: boolean,
  skipMode: boolean,
  mimicChance: number,
  eliteChance: number
): EnemyKind {
  if (isBoss || skipMode) return "normal";
  if (roll < mimicChance) return "mimic";
  if (roll < mimicChance + eliteChance) return "elite";
  return "normal";
}

// ---------------- 暴击 ----------------

// 期望暴击倍率（支持多重暴击；extraLayers 即「暴击再次暴击」Keystone，对 chance<1 同样生效）
export function expectedCritMult(chance: number, critDamage: Big, extraLayers = 0): Big {
  if (chance <= 0) return Big.ONE;
  if (chance < 1) {
    // 暴击时倍率 = critDamage^(1+extraLayers)，与 rollCrit 保持一致
    const critMult = critDamage.pow(1 + extraLayers);
    return Big.fromNumber(chance).mul(critMult).add(Big.fromNumber(1 - chance));
  }
  const layers = Math.floor(chance) + extraLayers;
  const frac = chance - Math.floor(chance);
  let mult = critDamage.pow(layers);
  if (frac > 0) mult = mult.mul(Big.fromNumber(frac).mul(critDamage).add(Big.fromNumber(1 - frac)));
  return mult;
}

// 单次命中判定：roll ∈ [0,1)。返回 { crit, superCrit, mult }
export function rollCrit(chance: number, critDamage: Big, extraLayers: number, roll: number): { crit: boolean; superCrit: boolean; mult: Big } {
  if (chance <= 0 || roll >= chance) return { crit: false, superCrit: false, mult: Big.ONE };
  let layers = 0;
  if (chance >= 1) {
    const base = Math.floor(chance);
    const frac = chance - base;
    layers = base + (roll < frac ? 1 : 0);
  } else {
    layers = 1;
  }
  layers += extraLayers;
  const mult = critDamage.pow(layers);
  return { crit: true, superCrit: layers >= 2, mult };
}

// ---------------- 转生 ----------------

export function prestigeEnergy(totalDamage: Big): number {
  const log10 = totalDamage.log10();
  if (!Number.isFinite(log10)) return 0;
  const x = log10 - CONFIG.PRESTIGE.THRESHOLD;
  if (x <= 0) return 0;
  return Math.floor(Math.pow(x, CONFIG.PRESTIGE.ENERGY_EXP));
}

export function prestigeGlobalMult(energy: number, ampLevel: number): Big {
  const exp = CONFIG.PRESTIGE.GLOBAL_EXP + ampLevel;
  return Big.fromNumber(1 + energy).pow(exp);
}

// ---------------- 溢出 / 碾压 ----------------

export function overflowGold(damage: Big, hp: Big, baseGold: Big, overflowEff: Big): Big {
  if (hp.isZero() || damage.lte(hp)) return Big.ZERO;
  const ratio = damage.div(hp);
  const factor = ratio.pow(CONFIG.OVERFLOW_EXPONENT).mul(overflowEff);
  return baseGold.mul(factor);
}

export function crushGold(baseGold: Big, crushEff: Big): Big {
  const mult = Big.min(Big.fromNumber(CONFIG.CRUSH_GOLD_CAP), Big.fromNumber(CONFIG.CRUSH_GOLD_BASE_MULT).add(crushEff));
  return baseGold.mul(mult);
}

// ---------------- 派生属性 ----------------

// 运行时增益（技能/消耗品，不进存档）
export interface RuntimeBuffs {
  aspdMult: number; // 面板攻速额外倍率（技能/消耗品）
  goldMult: number; // 金币倍率（技能/消耗品）
  criticalStrike: { pending: boolean; mult: number };
  chargedHit: { pending: boolean; mult: number };
  chipActive: boolean;
  goldProtocolActive: boolean;
}

export function emptyBuffs(): RuntimeBuffs {
  return { aspdMult: 1, goldMult: 1, criticalStrike: { pending: false, mult: 100 }, chargedHit: { pending: false, mult: 500 }, chipActive: false, goldProtocolActive: false };
}

interface AffixAccum {
  atkPool: number;
  goldPool: number;
  critRateAdd: number;
  critDmgAdd: number;
  aspdMult: number;
  bossDmgMult: Big;
  skillDmgMult: Big;
  overflowEffMult: Big;
  clickMult: Big;
  globalMult: Big;
  comboCapAdd: number;
  comboWindowAdd: number;
  everyNAttack: number;
  skillCdPool: number;
  skillDurationPool: number;
}

function applyAffix(stat: string, value: number, acc: AffixAccum): void {
  switch (stat) {
    case "atkPct": acc.atkPool += value; break;
    case "goldPct": acc.goldPool += value; break;
    case "critRate": acc.critRateAdd += value; break;
    case "critDmg": acc.critDmgAdd += value; break;
    case "aspdPct": acc.aspdMult *= 1 + value; break;
    case "bossDmg": acc.bossDmgMult = acc.bossDmgMult.mul(Big.fromNumber(1 + value)); break;
    case "skillDmg": acc.skillDmgMult = acc.skillDmgMult.mul(Big.fromNumber(1 + value)); break;
    case "overflowEff": acc.overflowEffMult = acc.overflowEffMult.mul(Big.fromNumber(1 + value)); break;
    case "clickDmg": acc.clickMult = acc.clickMult.mul(Big.fromNumber(1 + value)); break;
    case "comboCap": acc.comboCapAdd += value; break;
    case "comboWindow": acc.comboWindowAdd += value; break;
    case "everyNAttack": acc.everyNAttack += value; break;
    case "skillCd": acc.skillCdPool += value; break;
    case "skillDuration": acc.skillDurationPool += value; break;
  }
}

export function computeDerived(state: GameState, buffs: RuntimeBuffs, timeSec: number): DerivedStats {
  const { player, equipment, talents, prestige, statistics } = state;

  // ---- 技能活动状态（基于技能实例的 activeUntil）----
  const skillMap = new Map(state.skills.actives.map((s) => [s.id, s]));
  const overclockActive = (skillMap.get("overclock")?.activeUntil ?? 0) > timeSec;
  const goldCollapseActive = (skillMap.get("gold_collapse")?.activeUntil ?? 0) > timeSec;
  const timeFreezeActive = (skillMap.get("time_freeze")?.activeUntil ?? 0) > timeSec;
  const overloadActive = (skillMap.get("overload_combo")?.activeUntil ?? 0) > timeSec;
  const splitActive = (skillMap.get("split_matrix")?.activeUntil ?? 0) > timeSec;
  const finalProtocolActive = (skillMap.get("final_protocol")?.activeUntil ?? 0) > timeSec;

  // ---- 加池 / 累加器 ----
  const acc: AffixAccum = {
    atkPool: 0,
    goldPool: goldMultFromLevel(player.upgrades.gold) - 1,
    critRateAdd: 0,
    critDmgAdd: 0,
    aspdMult: 1,
    bossDmgMult: Big.ONE,
    skillDmgMult: Big.ONE,
    overflowEffMult: Big.ONE,
    clickMult: Big.ONE,
    globalMult: Big.ONE,
    comboCapAdd: 0,
    comboWindowAdd: 0,
    everyNAttack: 0,
    skillCdPool: 0,
    skillDurationPool: 0,
  };

  let weaponAtkMult = Big.ONE;
  let critDmgEquipMult = Big.ONE;

  for (const slot of CONFIG.EQUIPMENT.SLOTS) {
    const eq = equipment.slots[slot];
    if (!eq) continue;
    // 主词条（强化倍率）
    const enhanceMult = 1 + eq.level * CONFIG.EQUIPMENT.ENHANCE_MAIN_MULT;
    const mainMult = eq.main.mult * enhanceMult;
    if (eq.main.stat === "atkPct") weaponAtkMult = weaponAtkMult.mul(Big.fromNumber(mainMult));
    else if (eq.main.stat === "aspdPct") acc.aspdMult *= mainMult;
    else if (eq.main.stat === "critDmg") critDmgEquipMult = critDmgEquipMult.mul(Big.fromNumber(mainMult));
    // 副词条
    for (const af of eq.affixes) applyAffix(af.stat, af.value, acc);
    // 传奇词条（独立乘区）
    if (eq.legendary) acc.globalMult = acc.globalMult.mul(Big.fromNumber(eq.legendary.mult));
  }

  // ---- 套装（凑齐槽位即生效） ----
  for (const set of CONFIG.EQUIPMENT.SETS) {
    if (!set.slots.every((s) => equipment.slots[s as EquipSlot])) continue;
    const b = set.bonus;
    if (b.kind === "aspdMult") acc.aspdMult *= 1 + b.value;
    else if (b.kind === "critDmgAdd") acc.critDmgAdd += b.value;
    else if (b.kind === "goldPool") acc.goldPool += b.value;
    else if (b.kind === "bossDmgMult") acc.bossDmgMult = acc.bossDmgMult.mul(Big.fromNumber(1 + b.value));
  }

  // ---- 天赋 ----
  let talentGlobal = Big.ONE;
  let critLayersExtra = 0;
  let aspdTalentMult = 1;
  let offlineEffTalent = 0;
  let skipBaseTalent = 0;
  let dropRateTalent = 0;
  let shardGainTalent = 0;
  let reforgeCostTalent = 0;
  let craftCostTalent = 0;
  let goldKeystoneMult = Big.ONE;
  let hpGrowthReductionTalent = 0;
  let apsCapTalent = 0;
  const hasKeystone = new Set<KeystoneKey>();

  for (const [nodeId, pts] of Object.entries(talents.allocations)) {
    if (pts <= 0) continue;
    const def = talentNodeById(nodeId);
    if (!def) continue;
    const eff = def.effect;
    switch (eff.kind) {
      case "addPool":
        if (eff.stat === "atkPct") acc.atkPool += eff.perPoint * pts;
        else if (eff.stat === "goldPct") acc.goldPool += eff.perPoint * pts;
        break;
      case "critDmgFlat": acc.critDmgAdd += eff.perPoint * pts; break;
      case "mult":
        if (eff.target === "global") talentGlobal = talentGlobal.mul(Big.fromNumber(1 + eff.perPoint).pow(pts));
        else if (eff.target === "bossDmg") acc.bossDmgMult = acc.bossDmgMult.mul(Big.fromNumber(1 + eff.perPoint).pow(pts));
        else if (eff.target === "skillDmg") acc.skillDmgMult = acc.skillDmgMult.mul(Big.fromNumber(1 + eff.perPoint).pow(pts));
        break;
      case "aspdPct": aspdTalentMult *= Math.pow(1 + eff.perPoint, pts); break;
      case "offlineEff": offlineEffTalent += eff.perPoint * pts; break;
      case "skipBase": skipBaseTalent += eff.perPoint * pts; break;
      case "dropRate": dropRateTalent += eff.perPoint * pts; break;
      case "overflowEff": acc.overflowEffMult = acc.overflowEffMult.mul(Big.fromNumber(1 + eff.perPoint).pow(pts)); break;
      case "shardGain": shardGainTalent += eff.perPoint * pts; break;
      case "reforgeCostMult": reforgeCostTalent += eff.perPoint * pts; break;
      case "craftCostMult": craftCostTalent += eff.perPoint * pts; break;
      case "hpGrowthReduction": hpGrowthReductionTalent += eff.perPoint * pts; break;
      case "apsCap": apsCapTalent += eff.perPoint * pts; break;
      case "skillCdPct": acc.skillCdPool += eff.perPoint * pts; break;
      case "keystone": hasKeystone.add(eff.key); break;
    }
  }

  // Keystone 效果
  if (hasKeystone.has("absoluteDestruction")) talentGlobal = talentGlobal.mul(Big.fromNumber(1.5));
  if (hasKeystone.has("critAgain")) critLayersExtra += 1;
  // 贪婪树 Keystone：指数复利（累计金币 → 伤害）
  if (hasKeystone.has("compoundInterest")) {
    const goldSteps = Math.max(0, Math.floor(toBig(statistics.totalGold).log10()));
    goldKeystoneMult = Big.fromNumber(1.05).pow(goldSteps);
  }
  // 贪婪树 Keystone：精密制造（重铸/制作费用减免）
  if (hasKeystone.has("preciseCraft")) {
    reforgeCostTalent -= 0.5;
    craftCostTalent -= 0.3;
  }
  // 奇点树 Keystone：深渊豪赌（Boss 生命 ×2，Boss 金币 ×6）
  const bossHpMult = hasKeystone.has("bossGamble") ? Big.fromNumber(2) : Big.ONE;
  const bossGoldMult = hasKeystone.has("bossGamble") ? Big.fromNumber(6) : Big.ONE;
  // 奇点树 Keystone：财富引力（当前金币每高 10 倍 → 全伤害 ×1.15）
  if (hasKeystone.has("goldGravity")) {
    const goldSteps = Math.max(0, Math.floor(toBig(state.player.gold).log10()));
    goldKeystoneMult = goldKeystoneMult.mul(Big.fromNumber(1.15).pow(goldSteps));
  }

  // ---- 法则补丁（第三层，全部有硬上限）----
  const lawCE = lawCritExp(state);
  const apsCapAdd = lawApsCapAdd(state);
  const goldToDmgMult = lawGoldToDmgMult(state);
  // ---- 攻速 ----
  let aspdMult = acc.aspdMult * aspdTalentMult * buffs.aspdMult;
  aspdMult *= 1 + (state.skills.passives?.rhythm ?? 0) * CONFIG.SKILL_PASSIVES.rhythm.effectPerLevel;
  if (overclockActive) {
    const def = SKILL_DEFS.overclock;
    const inst = skillMap.get("overclock");
    aspdMult *= skillEffect(def, inst ? inst.level : 1);
  }
  if (timeFreezeActive) {
    const def = SKILL_DEFS.time_freeze;
    const inst = skillMap.get("time_freeze");
    aspdMult *= skillEffect(def, inst ? inst.level : 1);
  }
  if (finalProtocolActive) aspdMult *= SKILL_DEFS.final_protocol.aspdMultWhileActive ?? 1;
  let panelAps = panelApsFromLevel(player.upgrades.aspd) * aspdMult;
  const mods = activeMods(state);
  // 挑战修饰符：慢速宇宙——攻速减半
  if (mods.includes("slow_universe")) panelAps *= 0.5;
  const effAps = effectiveAps(panelAps + apsCapTalent, apsCapAdd);

  // 攻速溢转（Keystone）：溢出攻速 → 独立伤害
  let aspdOverflowMult = Big.ONE;
  if (hasKeystone.has("aspdOverflowDmg") && panelAps > CONFIG.APS_SOFT_CAP) {
    aspdOverflowMult = Big.fromNumber(1 + (panelAps - CONFIG.APS_SOFT_CAP) * 0.05);
  }
  // 永动协议（Keystone）：每 1 有效攻速 → 独立伤害 ×1.02
  let perpetualMult = Big.ONE;
  if (hasKeystone.has("perpetualProtocol")) {
    perpetualMult = Big.fromNumber(1.015).pow(effAps);
  }

  // ---- 暴击 ----
  const rawCritChance = critChanceFromLevel(player.upgrades.critChance) + acc.critRateAdd + (state.skills.passives?.focus ?? 0) * CONFIG.SKILL_PASSIVES.focus.effectPerLevel;
  // 挑战修饰符：无暴击——暴击率恒为 0
  const critChance = Math.min(1, mods.includes("no_crit") ? 0 : rawCritChance);
  // 暴击率溢出（>100%）有界转化为暴击伤害，概率显示封顶 100%
  const critOverflow = mods.includes("no_crit") ? 0 : Math.max(0, rawCritChance - 1);
  let critDamage = Big.fromNumber(critDamageFromLevel(player.upgrades.critDamage) + acc.critDmgAdd).mul(critDmgEquipMult).pow(lawCE);
  if (critOverflow > 0) critDamage = critDamage.mul(Big.fromNumber(1 + critOverflow * CONFIG.CRIT_OVERFLOW_TO_CRITDMG));

  // ---- 世界核心（第二层）----
  const leapGlobalMult = leapAllStatsMult(state.leap?.purchases?.allStats ?? 0);
  const hpGrowth = Math.max(1.05, CONFIG.HP_GROWTH - (state.leap?.purchases?.lawExponent ?? 0) * CONFIG.LEAP.SHOP.lawExponent.perLevel - hpGrowthReductionTalent);

  // ---- 全局倍率（重构/里程碑）----
  const prestigeMult = prestigeGlobalMult(prestige.energy, prestige.purchases.singularityAmp ?? 0);
  const milestoneMult = Big.fromNumber(milestoneMultFor(toBig(statistics.totalDamage).log10()));

  // ---- 金币 ----
  // 重构倍率同时放大金币收入：重推旧进度时不会被“金币清零+重买升级”卡住（验收：重推耗时 ≤ 原 20%）
  acc.goldPool += (state.skills.passives?.greed ?? 0) * CONFIG.SKILL_PASSIVES.greed.effectPerLevel;
  let goldMultBase = Big.fromNumber(Math.max(0.0001, 1 + acc.goldPool)).mul(prestigeMult).mul(leapGlobalMult);
  let goldMult = goldMultBase.mul(Big.fromNumber(lawGoldBoost(state)));
  if (goldCollapseActive) {
    const def = SKILL_DEFS.gold_collapse;
    const inst = skillMap.get("gold_collapse");
    goldMult = goldMult.mul(Big.fromNumber(skillEffect(def, inst ? inst.level : 1)));
  }
  if (buffs.goldProtocolActive) goldMult = goldMult.mul(Big.fromNumber(5));
  if (finalProtocolActive) goldMult = goldMult.mul(Big.fromNumber(SKILL_DEFS.final_protocol.goldMultWhileActive ?? 1));
  // 挑战修饰符：贫困——金币减半
  if (mods.includes("poverty")) goldMult = goldMult.mul(Big.fromNumber(0.5));

  // ---- 全局倍率 ----
  const globalMult = acc.globalMult.mul(talentGlobal).mul(prestigeMult).mul(milestoneMult).mul(goldKeystoneMult).mul(leapGlobalMult);

  // ---- 单次伤害（非暴击） ----
  const base = baseAttack(player.upgrades.attack).mul(weaponAtkMult);
  const atkMult = Big.fromNumber(1 + acc.atkPool);
  // 过载连击：活跃期连击上限提升
  if (overloadActive) {
    const def = SKILL_DEFS.overload_combo;
    const inst = skillMap.get("overload_combo");
    acc.comboCapAdd += skillEffect(def, inst ? inst.level : 1);
  }
  const comboDmgMult = overloadActive ? (SKILL_DEFS.overload_combo.comboDmgMult ?? 1) : 1;
  const comboBonus = Math.min(CONFIG.COMBO_CAP + acc.comboCapAdd, state.combat.combo) * CONFIG.COMBO_BONUS_PER_HIT;
  let damagePerHit = base.mul(atkMult).mul(globalMult).mul(goldToDmgMult).mul(aspdOverflowMult).mul(perpetualMult);
  damagePerHit = damagePerHit.mul(Big.fromNumber(1 + comboBonus * comboDmgMult));
  // 分裂矩阵：最终伤害独立提升
  if (splitActive) {
    const def = SKILL_DEFS.split_matrix;
    const inst = skillMap.get("split_matrix");
    damagePerHit = damagePerHit.mul(Big.fromNumber(1 + skillEffect(def, inst ? inst.level : 1)));
  }
  // 终焉协议：攻击力独立倍率
  if (finalProtocolActive) {
    const def = SKILL_DEFS.final_protocol;
    const inst = skillMap.get("final_protocol");
    damagePerHit = damagePerHit.mul(Big.fromNumber(skillEffect(def, inst ? inst.level : 1)));
  }

  const critMultExpected = expectedCritMult(critChance, critDamage, critLayersExtra);
  const dps = damagePerHit.mul(critMultExpected).mul(Big.fromNumber(Math.max(0.0001, effAps)));

  return {
    baseAttack: base,
    attackMult: atkMult,
    critChance,
    critDamage,
    panelAps,
    effectiveAps: effAps,
    goldMult,
    clickMult: acc.clickMult,
    comboBonus,
    damagePerHit,
    dps,
    bossDmgMult: acc.bossDmgMult,
    skillDmgMult: acc.skillDmgMult,
    skillCdMult: Math.max(0.5, (1 - acc.skillCdPool) * (mods.includes("skill_slow") ? 2 : 1)),
    skillDurationMult: 1 + acc.skillDurationPool,
    overflowEffMult: acc.overflowEffMult,
    dropMult: Big.fromNumber(Math.max(1, 1 + dropRateTalent)),
    talentMult: talentGlobal,
    prestigeMult,
    globalMult,
    critLayersExtra,
    leapGlobalMult,
    hpGrowth,
    bossHpMult,
    enemyHpMult: mods.includes("durable") ? 2 : 1,
    bossGoldMult,
    goldToDmgMult,
    offlineEffTalent,
    skipBaseTalent,
    shardGainMult: Math.max(1, 1 + shardGainTalent),
    reforgeCostMult: Math.max(0.25, 1 + reforgeCostTalent),
    craftCostMult: Math.max(0.25, 1 + craftCostTalent),
    hasKeystone: Array.from(hasKeystone),
    everyNAttack: acc.everyNAttack,
    comboCapAdd: acc.comboCapAdd,
    comboWindowAdd: acc.comboWindowAdd,
  };
}