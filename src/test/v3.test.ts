import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { toBig } from "../game/bignum";
import { Rng } from "../game/rng";
import { reforge, reforgeCost, canReforge, craft, craftCost, canCraft } from "../game/systems/equipment";
import { CONFIG } from "../game/config";
import type { EquipInstance, Rarity } from "../game/types";

function makeItem(rarity: Rarity, affixes: { stat: "atkPct" | "critDmg" | "goldPct" | "aspdPct"; value: number }[]): EquipInstance {
  return { uid: "i1", slot: "weapon", rarity, level: 0, main: { stat: "atkPct", mult: 1 }, affixes };
}

describe("V3 内容：装备重铸", () => {
  it("重铸重抛全部副词条并扣除碎片", () => {
    const st = createNewState(1);
    st.combat.stage = 50;
    const item = makeItem("rare", [{ stat: "critDmg", value: 0.5 }]);
    st.equipment.inventory = [item];
    st.equipment.fragments = [1, 4]; // 10000
    const cost = reforgeCost(item);
    expect(cost).toBeGreaterThan(0);
    expect(canReforge(st, "i1")).toBe(true);
    const before = JSON.stringify(item.affixes);
    expect(reforge(st, "i1", new Rng(123))).toBe(true);
    expect(item.affixes.length).toBe(2); // rare = 2 副词条
    expect(JSON.stringify(item.affixes)).not.toBe(before);
    expect(toBig(st.equipment.fragments).toNumber()).toBeCloseTo(10000 - cost, 5);
  });

  it("碎片不足时重铸失败且不改变词条", () => {
    const st = createNewState(1);
    const item = makeItem("rare", [{ stat: "critDmg", value: 0.5 }]);
    st.equipment.inventory = [item];
    st.equipment.fragments = [0, 0];
    const before = JSON.stringify(item.affixes);
    expect(reforge(st, "i1", new Rng(1))).toBe(false);
    expect(JSON.stringify(item.affixes)).toBe(before);
  });

  it("无副词条（普通）不可重铸", () => {
    const st = createNewState(1);
    const item = makeItem("common", []);
    st.equipment.inventory = [item];
    st.equipment.fragments = [1, 4];
    expect(canReforge(st, "i1")).toBe(false);
  });
});

describe("V3 内容：装备制作", () => {
  it("制作指定槽位与稀有度并扣除碎片", () => {
    const st = createNewState(1);
    st.combat.stage = 120;
    st.equipment.fragments = [1, 6]; // 1e6
    const cost = craftCost("charm", "legendary");
    expect(canCraft(st, "charm", "legendary")).toBe(true);
    expect(craft(st, "charm", "legendary", new Rng(7))).toBe(true);
    expect(st.equipment.inventory.length).toBe(1);
    const it = st.equipment.inventory[0];
    expect(it.slot).toBe("charm");
    expect(it.rarity).toBe("legendary");
    expect(it.legendary).toBeDefined();
    expect(toBig(st.equipment.fragments).toNumber()).toBeCloseTo(1e6 - cost, 5);
  });

  it("稀有度受关卡门槛限制", () => {
    const st = createNewState(1);
    st.combat.stage = 10; // legendary 需 120
    st.equipment.fragments = [1, 9];
    expect(canCraft(st, "weapon", "legendary")).toBe(false);
    expect(craft(st, "weapon", "legendary", new Rng(1))).toBe(false);
    expect(st.equipment.inventory.length).toBe(0);
  });

  it("背包满时不可制作", () => {
    const st = createNewState(1);
    st.combat.stage = 50;
    st.equipment.fragments = [1, 6];
    for (let i = 0; i < CONFIG.EQUIPMENT.INVENTORY_CAP; i++) {
      st.equipment.inventory.push(makeItem("common", []));
    }
    expect(canCraft(st, "weapon", "rare")).toBe(false);
  });
});

describe("V3 内容：引擎接口", () => {
  it("engine.canCraft/craft/重铸 走通", () => {
    const st = createNewState(1);
    st.combat.stage = 120;
    st.equipment.fragments = [1, 6];
    const eng = new GameEngine(st);
    expect(eng.canCraft("weapon", "legendary")).toBe(true);
    expect(eng.craft("weapon", "legendary")).toBe(true);
    expect(eng.state.equipment.inventory.length).toBe(1);
    eng.equipItem(eng.state.equipment.inventory[0].uid);
    const uid = eng.state.equipment.slots.weapon!.uid;
    expect(eng.canReforge(uid)).toBe(true);
    expect(eng.reforge(uid)).toBe(true);
  });
});
