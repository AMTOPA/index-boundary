import { describe, it, expect } from "vitest";
import { Big } from "../game/bignum";
import {
  enemyHp, enemyGold, isBossStage, bossHp, upgradeCost, prestigeEnergy,
  rollCrit, expectedCritMult, prestigeGlobalMult,
  critChanceFromLevel, computeDerived, emptyBuffs, depthHpGrowth,
} from "../game/formulas";
import { createNewState } from "../game/engine";
import { CONFIG } from "../game/config";

describe("怪物与关卡公式", () => {
  it("enemyHp 按 10×1.18^stage 增长", () => {
    expect(Math.log10(enemyHp(1).toNumber())).toBeCloseTo(Math.log10(10 * 1.18), 5);
    expect(Math.log10(enemyHp(100).toNumber())).toBeCloseTo(1 + 100 * Math.log10(1.18), 5);
    expect(enemyHp(200).log10()).toBeGreaterThan(enemyHp(100).log10());
  });

  it("enemyGold 与 HP 正相关", () => {
    expect(enemyGold(100).gt(enemyGold(50))).toBe(true);
    expect(enemyGold(50).gt(enemyGold(10))).toBe(true);
  });

  it("Boss 每 10 关", () => {
    expect(isBossStage(10)).toBe(true);
    expect(isBossStage(20)).toBe(true);
    expect(isBossStage(11)).toBe(false);
  });

  it("Boss HP 高于普通怪", () => {
    expect(bossHp(10).compare(enemyHp(10))).toBeGreaterThan(0);
    expect(Math.log10(bossHp(10).toNumber())).toBeCloseTo(Math.log10(enemyHp(10).toNumber()) + Math.log10(20), 4);
  });
});

describe("升级成本", () => {
  it("成本单调递增", () => {
    let prev = 0;
    for (let lv = 1; lv <= 60; lv++) {
      const c = upgradeCost("attack", lv).toNumber();
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
  });
  it("Rebase 分段后仍可控", () => {
    const c25 = upgradeCost("attack", 25).log10();
    const c26 = upgradeCost("attack", 26).log10();
    // 26 级进入新 rebase 段（×5），成本跳跃不超过 10 倍量级
    expect(c26 - c25).toBeLessThan(Math.log10(1.16 * 5) + 0.01);
  });
});

describe("暴击", () => {
  it("roll=0 必暴击", () => {
    const r = rollCrit(0.1, Big.fromNumber(2), 0, 0);
    expect(r.crit).toBe(true);
    expect(r.superCrit).toBe(false);
    expect(r.mult.toNumber()).toBeCloseTo(2, 10);
  });
  it("roll>=chance 不暴击", () => {
    const r = rollCrit(0.1, Big.fromNumber(2), 0, 0.5);
    expect(r.crit).toBe(false);
  });
  it("chance>=1 产生多层暴击", () => {
    const r = rollCrit(1.5, Big.fromNumber(2), 0, 0.1);
    expect(r.crit).toBe(true);
    expect(r.superCrit).toBe(true);
    expect(r.mult.toNumber()).toBeCloseTo(4, 10); // 2^2
  });
  it("multi-crit beyond JS number range stays finite Big (dps-zero regression)", () => {
    const m = expectedCritMult(92.19, Big.fromNumber(2102), 0);
    expect(Number.isFinite(m.log10())).toBe(true);
    expect(m.log10()).toBeGreaterThan(300);
    const r = rollCrit(92.19, Big.fromNumber(2102), 0, 0);
    expect(Number.isFinite(r.mult.log10())).toBe(true);
  });
  it("monotonic expected crit mult", () => {
    expect(expectedCritMult(0.3, Big.fromNumber(2), 0).toNumber()).toBeGreaterThan(expectedCritMult(0.05, Big.fromNumber(2), 0).toNumber());
  });
});

describe("重构", () => {
  it("低于阈值无能量", () => {
    expect(prestigeEnergy(Big.fromNumber(1e10))).toBe(0);
    expect(prestigeEnergy(Big.fromNumber(1e19))).toBe(0);
  });
  it("高于阈值有能量", () => {
    expect(prestigeEnergy(new Big(1, 21))).toBeGreaterThan(0);
    const e100 = prestigeEnergy(new Big(1, 100));
    expect(e100).toBe(Math.floor(Math.pow(80, CONFIG.PRESTIGE.ENERGY_EXP)));
  });
  it("全局倍率 (1+E)^(2+amp)", () => {
    const g0 = prestigeGlobalMult(10, 0).toNumber();
    expect(g0).toBeCloseTo(Math.pow(11, 2), 6);
    const g1 = prestigeGlobalMult(10, 1).toNumber();
    expect(g1).toBeCloseTo(Math.pow(11, 3), 6);
  });
});

describe("深度软化（1000 关后 HP 指数有界逼近 1.05）", () => {
  it("1000 关前无变化，之后有界逼近下限", () => {
    expect(depthHpGrowth(500, 1.18)).toBeCloseTo(1.18, 10);
    expect(depthHpGrowth(1000, 1.18)).toBeCloseTo(1.18, 10);
    const g1700 = depthHpGrowth(1700, 1.18);
    expect(g1700).toBeGreaterThan(1.05);
    expect(g1700).toBeLessThan(1.18);
    const g5000 = depthHpGrowth(5000, 1.18);
    expect(g5000).toBeGreaterThanOrEqual(1.05);
    expect(g5000).toBeLessThan(1.07);
    expect(g1700).toBeGreaterThan(g5000);
    // 早期敌人 HP 完全不变（关键：不破坏 1h/10h 曲线）
    const hp500 = enemyHp(500, 1.18);
    const hp500Raw = Big.fromNumber(10).mul(Big.fromNumber(1.18).pow(500));
    expect(hp500.toNumber()).toBeCloseTo(hp500Raw.toNumber(), 6);
  });
});
describe("暴击率封顶与溢出转化（平衡修复）", () => {
  it("升级暴击率渐近软上限，永不超 100%", () => {
    const asymptote = CONFIG.BASE_CRIT_CHANCE + CONFIG.CRIT_CHANCE_UPGRADE_CAP;
    expect(asymptote).toBeLessThan(1);
    for (const lv of [1, 10, 50, 100, 300, 1000, 10000]) {
      expect(critChanceFromLevel(lv)).toBeLessThan(asymptote + 1e-9);
      expect(critChanceFromLevel(lv)).toBeLessThan(1);
    }
    // 早期保持接近线性手感：10 级 ≈ 0.05 + perLevel×10（渐近曲线偏差在 1 位小数容差内）
    expect(critChanceFromLevel(10)).toBeCloseTo(0.05 + CONFIG.UPGRADES.critChance.perLevel * 10, 1);
  });

  it("critAgain（暴击再次暴击）对 chance<1 同样生效（与 rollCrit 一致）", () => {
    const withKeystone = expectedCritMult(0.5, Big.fromNumber(3), 1);
    const without = expectedCritMult(0.5, Big.fromNumber(3), 0);
    // 期望：0.5×3^2 + 0.5 = 5；无 Keystone：0.5×3 + 0.5 = 2
    expect(withKeystone.toNumber()).toBeCloseTo(5, 8);
    expect(without.toNumber()).toBeCloseTo(2, 8);
    // 与 rollCrit 单次语义一致：暴击时 ×3^(1+1)=9
    const r = rollCrit(0.5, Big.fromNumber(3), 1, 0);
    expect(r.crit).toBe(true);
    expect(r.mult.toNumber()).toBeCloseTo(9, 8);
  });

  it("computeDerived 暴击率封顶 100%，溢出转暴击伤害", () => {
    const st = createNewState(1);
    st.player.upgrades.critChance = 10000; // 升级渐近到上限
    st.skills.passives.focus = 100; // 被动 +100% → 溢出
    const d = computeDerived(st, emptyBuffs(), 0);
    expect(d.critChance).toBe(1); // 封顶

    const st0 = createNewState(2);
    st0.player.upgrades.critChance = 10000;
    const d0 = computeDerived(st0, emptyBuffs(), 0);
    expect(d0.critChance).toBeLessThan(1); // 仅升级未到 100%
    expect(d.critDamage.toNumber()).toBeGreaterThan(d0.critDamage.toNumber()); // 溢出转暴伤
  });
});