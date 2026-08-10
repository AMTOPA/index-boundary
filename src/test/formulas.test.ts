import { describe, it, expect } from "vitest";
import { Big } from "../game/bignum";
import {
  enemyHp, enemyGold, isBossStage, bossHp, upgradeCost, prestigeEnergy,
  rollCrit, expectedCritMult, prestigeGlobalMult,
} from "../game/formulas";
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