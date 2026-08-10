import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { toBig } from "../game/bignum";
import { CONFIG } from "../game/config";
import { talentNodeById, TALENT_TREES } from "../game/data/talents";
import { reforgeCost } from "../game/systems/equipment";
import type { EquipInstance } from "../game/types";

function greedEngine(seed = 1): GameEngine {
  const st = createNewState(seed);
  st.meta.unlocks = ["talents"];
  st.talents.points = 100;
  return new GameEngine(st);
}

// 点满贪婪树前置（掠夺4/幸运4/淘金3/精炼3），返回引擎
function fullGreed(seed = 1): GameEngine {
  const eng = greedEngine(seed);
  for (let i = 0; i < 4; i++) eng.allocate("greed_loot");
  for (let i = 0; i < 4; i++) eng.allocate("greed_luck");
  for (let i = 0; i < 3; i++) eng.allocate("greed_pan");
  for (let i = 0; i < 3; i++) eng.allocate("greed_refine");
  return eng;
}

describe("V5 内容：贪婪天赋树", () => {
  it("贪婪树注册且节点结构正确", () => {
    expect(TALENT_TREES.greed).toBeDefined();
    const n = talentNodeById("greed_loot");
    expect(n).toBeDefined();
    expect(n!.tree).toBe("greed");
    expect(talentNodeById("greed_keystone_compound")!.type).toBe("keystone");
  });

  it("掠夺：金币 +25%/点", () => {
    const eng = greedEngine();
    const before = eng.derived.goldMult.toNumber();
    expect(eng.allocate("greed_loot")).toBe(true);
    expect(eng.allocate("greed_loot")).toBe(true);
    expect(eng.derived.goldMult.toNumber()).toBeCloseTo(before * 1.5, 5);
  });

  it("幸运：掉率 +10%/点", () => {
    const eng = greedEngine();
    expect(eng.allocate("greed_luck")).toBe(true);
    expect(eng.derived.dropMult.toNumber()).toBeCloseTo(1.1, 5);
  });

  it("淘金：溢出效率 +20%/点（前置掠夺需满）", () => {
    const eng = greedEngine();
    expect(eng.allocate("greed_pan")).toBe(false); // 前置未满
    for (let i = 0; i < 4; i++) eng.allocate("greed_loot");
    expect(eng.allocate("greed_pan")).toBe(true);
    expect(eng.derived.overflowEffMult.toNumber()).toBeCloseTo(1.2, 5);
  });

  it("精炼：分解碎片 +25%/点，引擎分解按倍率结算", () => {
    const eng = greedEngine();
    for (let i = 0; i < 4; i++) eng.allocate("greed_luck");
    for (let i = 0; i < 3; i++) eng.allocate("greed_refine");
    expect(eng.derived.shardGainMult).toBeCloseTo(1.75, 5);
    const item: EquipInstance = { uid: "c1", slot: "weapon", rarity: "common", level: 0, main: { stat: "atkPct", mult: 1 }, affixes: [] };
    eng.state.equipment.inventory = [item];
    expect(eng.breakdown("c1")).toBe(true);
    expect(toBig(eng.state.equipment.fragments).toNumber()).toBe(2); // ceil(1 × 1.75)
  });

  it("Keystone 指数复利：累计金币每高 10 倍 → 伤害 +5%", () => {
    const dpsWith = (goldMag: number, keystone: boolean): number => {
      const eng = fullGreed();
      if (keystone) expect(eng.allocate("greed_keystone_compound")).toBe(true);
      eng.state.statistics.totalGold = [1, goldMag];
      eng.recomputeDerived();
      return eng.derived.dps.toNumber();
    };
    const base = dpsWith(0, false); // 1 金币 → 0 档
    expect(dpsWith(10, false)).toBeCloseTo(base, 5); // 无 Keystone 时金币不影响伤害
    const ratio = dpsWith(10, true) / base; // 1e10 → 10 档
    expect(ratio).toBeCloseTo(Math.pow(1.05, 10), 3);
  });

  it("Keystone 精密制造：重铸 -50%、制作 -30%", () => {
    const eng = fullGreed();
    expect(eng.allocate("greed_keystone_craft")).toBe(true);
    expect(eng.derived.reforgeCostMult).toBeCloseTo(0.5, 5);
    expect(eng.derived.craftCostMult).toBeCloseTo(0.7, 5);
    const item: EquipInstance = { uid: "r1", slot: "weapon", rarity: "rare", level: 0, main: { stat: "atkPct", mult: 1 }, affixes: [{ stat: "atkPct", value: 0.1 }, { stat: "critDmg", value: 0.2 }] };
    eng.state.equipment.inventory = [item];
    expect(eng.reforgeCostOf("r1")).toBe(Math.max(1, Math.ceil(reforgeCost(item) * 0.5)));
    const craftFull = CONFIG.EQUIPMENT.CRAFT_COST_MULT * CONFIG.EQUIPMENT.RARITIES.rare.shards;
    expect(eng.craftCostOf("weapon", "rare")).toBe(Math.max(1, Math.ceil(craftFull * 0.7)));
  });

  it("Keystone 互斥：贪婪树只能选一个", () => {
    const eng = fullGreed();
    expect(eng.allocate("greed_keystone_compound")).toBe(true);
    expect(eng.allocate("greed_keystone_craft")).toBe(false);
    expect(eng.state.talents.keystones.greed).toBe("greed_keystone_compound");
  });

  it("重置贪婪树返还点数", () => {
    const eng = fullGreed();
    const spent = 4 + 4 + 6 + 6;
    expect(eng.state.talents.points).toBe(100 - spent);
    eng.resetTree("greed");
    expect(eng.state.talents.points).toBe(100);
    expect(eng.state.talents.allocations.greed_loot ?? 0).toBe(0);
  });
});