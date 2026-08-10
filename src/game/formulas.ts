// 纯数学层：无副作用，全部输入输出可测
import { Big, toBig } from "./bignum";
import { CONFIG, milestoneMultFor } from "./config";
import type { DerivedStats, EnemyKind, EquipSlot, GameState, UpgradeId } from "./types";
import { talentNodeById, type KeystoneKey } from "./data/talents";
import { SKILL_DEFS, skillEffect } from "./data/skills";

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

export function effectiveAps(panel: number): number {
  if (panel <= CONFIG.APS_SOFT_CAP) return panel;
  return CONFIG.APS_SOFT_CAP + Math.sqrt(panel - CONFIG.APS_SOFT_CAP);
}

export function critChanceFromLevel(level: number): number {
  return CONFIG.BASE_CRIT_CHANCE + level * CONFIG.UPGRADES.critChance.perLevel;
}

export function critDamageFromLevel(level: number): number {
  return CONFIG.BASE_CRIT_DAMAGE + level * CONFIG.UPGRADES.critDamage.perLevel;
}

export function goldMultFromLevel(level: number): number {
  return 1 + level * CONFIG.UPGRADES.gold.perLevel;
}

// ---------------- 怪物 ----------------

export function enemyHp(stage: number): Big {
  return Big.fromNumber(CONFIG.HP_BASE).mul(Big.fromNumber(CONFIG.HP_GROWTH).pow(stage));
}

export function enemyGold(stage: number): Big {
  return enemyHp(stage).pow(CONFIG.GOLD_HP_EXPONENT);
}

export function isBossStage(stage: number): boolean {
  return stage % CONFIG.BOSS_EVERY === 0;
}

export function bossHp(stage: number): Big {
  return enemyHp(stage).mul(Big.fromNumber(CONFIG.BOSS_HP_MULT));
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

// 期望暴击倍率（支持多重暴击）
export function expectedCritMult(chance: number, critDamage: number, extraLayers = 0): number {
  if (chance <= 0) return 1;
  if (chance < 1) return 1 + chance * (critDamage - 1);
  const layers = Math.floor(chance) + extraLayers;
  const frac = chance - Math.floor(chance);
  let mult = Math.pow(critDamage, layers);
  if (frac > 0) mult *= 1 + frac * (critDamage - 1);
  return mult;
}

// 单次命中判定：roll ∈ [0,1)。返回 { crit, superCrit, mult }
export function rollCrit(chance: number, critDamage: number, extraLayers: number, roll: number): { crit: boolean; superCrit: boolean; mult: number } {
  if (chance <= 0 || roll >= chance) return { crit: false, superCrit: false, mult: 1 };
  let layers = 0;
  if (chance >= 1) {
    const base = Math.floor(chance);
    const frac = chance - base;
    layers = base + (roll < frac ? 1 : 0);
  } else {
    layers = 1;
  }
  layers += extraLayers;
  const mult = Math.pow(critDamage, layers);
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
  chipActive: boolean;
  goldProtocolActive: boolean;
}

export function emptyBuffs(): RuntimeBuffs {
  return { aspdMult: 1, goldMult: 1, criticalStrike: { pending: false, mult: 100 }, chipActive: false, goldProtocolActive: false };
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
  }
}

export function computeDerived(state: GameState, buffs: RuntimeBuffs, timeSec: number): DerivedStats {
  const { player, equipment, talents, prestige, statistics } = state;

  // ---- 技能活动状态（基于技能实例的 activeUntil）----
  const skillMap = new Map(state.skills.actives.map((s) => [s.id, s]));
  const overclockActive = (skillMap.get("overclock")?.activeUntil ?? 0) > timeSec;
  const goldCollapseActive = (skillMap.get("gold_collapse")?.activeUntil ?? 0) > timeSec;

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
  };

  let weaponAtkMult = Big.ONE;
  let critDmgEquipMult = 1;

  for (const slot of CONFIG.EQUIPMENT.SLOTS) {
    const eq = equipment.slots[slot];
    if (!eq) continue;
    // 主词条（强化倍率）
    const enhanceMult = 1 + eq.level * CONFIG.EQUIPMENT.ENHANCE_MAIN_MULT;
    const mainMult = eq.main.mult * enhanceMult;
    if (eq.main.stat === "atkPct") weaponAtkMult = weaponAtkMult.mul(Big.fromNumber(mainMult));
    else if (eq.main.stat === "aspdPct") acc.aspdMult *= mainMult;
    else if (eq.main.stat === "critDmg") critDmgEquipMult *= mainMult;
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
      case "keystone": hasKeystone.add(eff.key); break;
    }
  }

  // Keystone 效果
  if (hasKeystone.has("absoluteDestruction")) talentGlobal = talentGlobal.mul(Big.fromNumber(1.5));
  if (hasKeystone.has("critAgain")) critLayersExtra += 1;

  // ---- 攻速 ----
  let aspdMult = acc.aspdMult * aspdTalentMult * buffs.aspdMult;
  aspdMult *= 1 + state.skills.passiveLevel * CONFIG.SKILL_PASSIVE_PER_LEVEL;
  if (overclockActive) {
    const def = SKILL_DEFS.overclock;
    const inst = skillMap.get("overclock");
    aspdMult *= skillEffect(def, inst ? inst.level : 1);
  }
  let panelAps = panelApsFromLevel(player.upgrades.aspd) * aspdMult;
  const effAps = effectiveAps(panelAps);

  // 攻速溢转（Keystone）：溢出攻速 → 独立伤害
  let aspdOverflowMult = Big.ONE;
  if (hasKeystone.has("aspdOverflowDmg") && panelAps > CONFIG.APS_SOFT_CAP) {
    aspdOverflowMult = Big.fromNumber(1 + (panelAps - CONFIG.APS_SOFT_CAP) * 0.05);
  }
  // 永动协议（Keystone）：每 1 有效攻速 → 独立伤害 ×1.02
  let perpetualMult = Big.ONE;
  if (hasKeystone.has("perpetualProtocol")) {
    perpetualMult = Big.fromNumber(1.02).pow(effAps);
  }

  // ---- 暴击 ----
  const critChance = critChanceFromLevel(player.upgrades.critChance) + acc.critRateAdd;
  const critDamage = (critDamageFromLevel(player.upgrades.critDamage) + acc.critDmgAdd) * critDmgEquipMult;

  // ---- 金币 ----
  let goldMult = Big.fromNumber(Math.max(0.0001, 1 + acc.goldPool));
  if (goldCollapseActive) {
    const def = SKILL_DEFS.gold_collapse;
    const inst = skillMap.get("gold_collapse");
    goldMult = goldMult.mul(Big.fromNumber(skillEffect(def, inst ? inst.level : 1)));
  }
  if (buffs.goldProtocolActive) goldMult = goldMult.mul(Big.fromNumber(5));

  // ---- 全局倍率 ----
  const prestigeMult = prestigeGlobalMult(prestige.energy, prestige.purchases.singularityAmp ?? 0);
  const milestoneMult = Big.fromNumber(milestoneMultFor(toBig(statistics.totalDamage).log10()));
  const globalMult = acc.globalMult.mul(talentGlobal).mul(prestigeMult).mul(milestoneMult);

  // ---- 单次伤害（非暴击） ----
  const base = baseAttack(player.upgrades.attack).mul(weaponAtkMult);
  const atkMult = Big.fromNumber(1 + acc.atkPool);
  const comboBonus = Math.min(CONFIG.COMBO_CAP + acc.comboCapAdd, state.combat.combo) * CONFIG.COMBO_BONUS_PER_HIT;
  let damagePerHit = base.mul(atkMult).mul(globalMult).mul(aspdOverflowMult).mul(perpetualMult);
  damagePerHit = damagePerHit.mul(Big.fromNumber(1 + comboBonus));

  const critMultExpected = expectedCritMult(critChance, critDamage, critLayersExtra);
  const dps = damagePerHit.mul(Big.fromNumber(critMultExpected)).mul(Big.fromNumber(Math.max(0.0001, effAps)));

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
    overflowEffMult: acc.overflowEffMult,
    dropMult: Big.ONE,
    talentMult: talentGlobal,
    prestigeMult,
    globalMult,
    critLayersExtra,
    offlineEffTalent,
    skipBaseTalent,
    hasKeystone: Array.from(hasKeystone),
    everyNAttack: acc.everyNAttack,
    comboCapAdd: acc.comboCapAdd,
    comboWindowAdd: acc.comboWindowAdd,
  };
}