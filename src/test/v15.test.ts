import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { computeDerived, emptyBuffs, challengePermMult } from "../game/formulas";
import { toBig } from "../game/bignum";
import { CONFIG } from "../game/config";
import type { Rarity } from "../game/types";

function baseEngine(seed = 1): GameEngine {
  const st = createNewState(seed);
  st.meta.unlocks = ["prestige", "equipment", "auto_attack"];
  return new GameEngine(st);
}

describe("V15 内容：挑战永久增益 + 挑战禁用重构倍率 + 自动分解修复", () => {
  it("通关挑战获得永久增益（不同挑战对应不同乘区）", () => {
    const eng = baseEngine(1);
    eng.state.challenges.no_crit.claimed = true;
    eng.state.challenges.poverty.claimed = true;
    eng.recomputeDerived();
    expect(challengePermMult(eng.state, "click")).toBeCloseTo(1.2, 8);
    expect(challengePermMult(eng.state, "gold")).toBeCloseTo(1.2, 8);
    expect(challengePermMult(eng.state, "aspd")).toBeCloseTo(1, 8);
    expect(eng.derived.clickMult.toNumber()).toBeCloseTo(1.2, 8);
    expect(eng.derived.goldMult.toNumber()).toBeCloseTo(1.2, 8);
  });

  it("挑战/赛季进行中禁用重构（奇点能量）全局倍率", () => {
    const eng = baseEngine(2);
    eng.state.prestige.energy = 100; // (1+100)^2 ≈ 1e4
    eng.recomputeDerived();
    expect(eng.derived.prestigeMult.toNumber()).toBeGreaterThan(1);
    eng.startChallenge("poverty");
    expect(eng.derived.prestigeMult.toNumber()).toBe(1);
    eng.stopChallenge();
    eng.recomputeDerived();
    expect(eng.derived.prestigeMult.toNumber()).toBeGreaterThan(1);
  });

  it("设定自动分解档位时立即清理背包存量并计入碎片", () => {
    const eng = baseEngine(3);
    eng.state.items.tools.auto_breakdown = true;
    const mk = (rarity: Rarity): void => {
      eng.state.equipment.inventory.push({ uid: `u_${rarity}_${Math.random()}`, slot: "weapon", rarity, level: 0, main: { stat: "atkPct", mult: 1.5 }, affixes: [] });
    };
    mk("common"); mk("rare"); mk("legendary");
    const fragBefore = toBig(eng.state.equipment.fragments).toNumber();
    eng.setAutoBreakdown("rare");
    // 严格低于档位：common 被清理，rare/legendary 保留
    expect(eng.state.equipment.inventory.length).toBe(2);
    expect(eng.state.equipment.inventory.some((i) => i.rarity === "rare")).toBe(true);
    expect(eng.state.equipment.inventory.some((i) => i.rarity === "legendary")).toBe(true);
    const gain = toBig(eng.state.equipment.fragments).toNumber() - fragBefore;
    expect(gain).toBe(CONFIG.EQUIPMENT.RARITIES.common.shards);
  });

  it("购买自动分解器且已设档位时也立即清理一次背包", () => {
    const eng = baseEngine(6);
    eng.state.player.gold = [1, 9]; // 1e9 ≥ 1e8（auto_breakdown 新价）
    eng.state.equipment.autoBreakdown = "fine"; // 已设档位
    eng.state.equipment.inventory.push({ uid: "b1", slot: "weapon", rarity: "common", level: 0, main: { stat: "atkPct", mult: 1.5 }, affixes: [] });
    const fragBefore = toBig(eng.state.equipment.fragments).toNumber();
    expect(eng.buyTool("auto_breakdown")).toBe(true);
    expect(eng.state.equipment.inventory.length).toBe(0); // common 被清理
    expect(toBig(eng.state.equipment.fragments).toNumber()).toBeGreaterThan(fragBefore);
  });

  it("自动重构：未重构过不可购买（金币足够也不行）", () => {
    const eng = baseEngine(5);
    eng.state.player.gold = [1, 25]; // 1e25 ≥ 1e24
    expect(eng.canBuyTool("auto_prestige")).toBe(false);
    eng.state.prestige.totalEnergyEarned = 1;
    expect(eng.canBuyTool("auto_prestige")).toBe(true);
  });

  it("computeDerived 纯函数：挑战永久增益与禁用重构互不干扰", () => {
    const st = createNewState(7);
    st.meta.unlocks = ["prestige"];
    st.prestige.energy = 50;
    st.challenges.durable.claimed = true;
    const outside = computeDerived(st, emptyBuffs(), 0);
    expect(outside.bossDmgMult.toNumber()).toBeCloseTo(1.2, 8);
    expect(outside.prestigeMult.toNumber()).toBeGreaterThan(1);
    st.meta.activeChallenge = "durable";
    const inside = computeDerived(st, emptyBuffs(), 0);
    expect(inside.bossDmgMult.toNumber()).toBeCloseTo(1.2, 8);
    expect(inside.prestigeMult.toNumber()).toBe(1);
  });
});