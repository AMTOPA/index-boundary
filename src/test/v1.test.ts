import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { Big } from "../game/bignum";
import { worldForStage } from "../game/data/worlds";
import { bossHp } from "../game/formulas";
import { Rng } from "../game/rng";
import { rollEquipment } from "../game/systems/equipment";
import { CONFIG } from "../game/config";
import type { BossAffix, EquipInstance } from "../game/types";

// 构造一个处于 Boss 战（第 10 关）的引擎，便于测试词缀
function bossEngine(seed: number, affixes: BossAffix[], bossTimer = 25): GameEngine {
  const st = createNewState(seed);
  st.meta.unlocks = ["boss"];
  st.combat.stage = 10;
  st.combat.isBoss = true;
  st.combat.enemyHp = bossHp(10).toTuple();
  st.combat.enemyMaxHp = bossHp(10).toTuple();
  st.combat.bossTimer = bossTimer;
  st.combat.bossAffixes = affixes;
  return new GameEngine(st);
}

describe("V1 内容：世界", () => {
  it("世界阶段划分", () => {
    expect(worldForStage(1).id).toBe("data_wastes");
    expect(worldForStage(200).id).toBe("mech_city");
    expect(worldForStage(600).id).toBe("star_factory");
    expect(worldForStage(2500).id).toBe("black_hole");
    expect(worldForStage(99999).id).toBe("black_hole");
  });
  it("新世界有自己的颜色与 Boss 词缀池", () => {
    expect(worldForStage(600).color).toBe("#ff8c42");
    expect(worldForStage(600).bossPool).toContain("harden");
    expect(worldForStage(600).bossPool).toContain("deflect");
  });
});

describe("V1 内容：护符槽", () => {
  it("可随机到护符并装备", () => {
    const rng = new Rng(12345);
    let found = false;
    for (let i = 0; i < 300; i++) {
      const item = rollEquipment(rng, 100, 0);
      if (item.slot === "charm") {
        found = true;
        const st = createNewState(1);
        st.equipment.inventory = [item];
        const eng = new GameEngine(st);
        expect(eng.equipItem(item.uid)).toBe(true);
        expect(eng.state.equipment.slots.charm).toBeDefined();
        break;
      }
    }
    expect(found).toBe(true);
  });
});

describe("V1 内容：套装", () => {
  function withSet(slots: Partial<Record<string, EquipInstance>>): GameEngine {
    const st = createNewState(7);
    const eng = new GameEngine(st);
    for (const [slot, item] of Object.entries(slots)) {
      st.equipment.slots[slot as "weapon"] = item;
    }
    eng.recomputeDerived();
    return eng;
  }
  const item = (uid: string, slot: "weapon" | "core" | "engine" | "charm", main: { stat: "atkPct" | "critDmg" | "aspdPct" | "goldPct"; mult: number }): EquipInstance =>
    ({ uid, slot, rarity: "rare", level: 0, main, affixes: [] });

  it("超频协议（武器+引擎）：攻速独立 ×1.25", () => {
    const eng = withSet({
      weapon: item("w", "weapon", { stat: "atkPct", mult: 1 }),
      engine: item("e", "engine", { stat: "aspdPct", mult: 1 }),
    });
    expect(eng.derived.panelAps).toBeCloseTo(1.25, 5);
  });
  it("临界法则（核心+护符）：暴击伤害 +50%", () => {
    const eng = withSet({
      core: item("c", "core", { stat: "critDmg", mult: 1 }),
      charm: item("h", "charm", { stat: "goldPct", mult: 1 }),
    });
    expect(eng.derived.critDamage).toBeCloseTo(2.5, 5);
  });
  it("数据洪流（引擎+护符）：金币 +50%", () => {
    const eng = withSet({
      engine: item("e2", "engine", { stat: "aspdPct", mult: 1 }),
      charm: item("h2", "charm", { stat: "goldPct", mult: 1 }),
    });
    expect(eng.derived.goldMult.toNumber()).toBeCloseTo(1.5, 5);
  });
  it("猎杀协议（武器+核心）：Boss 伤害独立 ×1.5", () => {
    const eng = withSet({
      weapon: item("w2", "weapon", { stat: "atkPct", mult: 1 }),
      core: item("c2", "core", { stat: "critDmg", mult: 1 }),
    });
    expect(eng.derived.bossDmgMult.toNumber()).toBeCloseTo(1.5, 5);
  });
  it("未凑齐套装不生效", () => {
    const eng = withSet({ weapon: item("w3", "weapon", { stat: "atkPct", mult: 1 }) });
    expect(eng.derived.panelAps).toBeCloseTo(1, 5);
  });
});

describe("V1 内容：新 Boss 词缀", () => {
  it("硬化：随时间叠加减伤（同种子同暴击结果）", () => {
    const a = bossEngine(42, ["harden"], 12); // elapsed=18 → 3 层 → 24% 减伤
    const b = bossEngine(42, [], 12);
    a.click();
    b.click();
    const dmgA = bossHp(10).sub(Big.fromTuple(a.state.combat.enemyHp));
    const dmgB = bossHp(10).sub(Big.fromTuple(b.state.combat.enemyHp));
    expect(dmgA.div(dmgB).toNumber()).toBeCloseTo(0.76, 1);
  });

  it("偏斜：非暴击伤害 -70%", () => {
    // 找一个首次点击非暴击的种子（rng 序列一致，结论确定）
    let seed = 1;
    let plain: GameEngine | null = null;
    for (; seed < 500; seed++) {
      const e = bossEngine(seed, [], 25);
      e.click();
      if (!e.state.combat.lastHitWasCrit) { plain = e; break; }
    }
    expect(plain).not.toBeNull();
    const defl = bossEngine(seed, ["deflect"], 25);
    defl.click();
    const dmgPlain = bossHp(10).sub(Big.fromTuple(plain!.state.combat.enemyHp));
    const dmgDefl = bossHp(10).sub(Big.fromTuple(defl.state.combat.enemyHp));
    expect(dmgDefl.div(dmgPlain).toNumber()).toBeCloseTo(0.3, 1);
  });

  it("偏斜：不惩罚暴击", () => {
    const a = bossEngine(99, ["deflect"], 25);
    const b = bossEngine(99, [], 25);
    a.buffs.criticalStrike.pending = true;
    b.buffs.criticalStrike.pending = true;
    a.click();
    b.click();
    expect(a.state.combat.lastHitWasCrit).toBe(true);
    expect(a.state.combat.enemyHp).toEqual(b.state.combat.enemyHp);
  });
});