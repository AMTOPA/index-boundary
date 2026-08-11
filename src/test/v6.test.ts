import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { toBig } from "../game/bignum";
import { Rng } from "../game/rng";
import { rollEquipment } from "../game/systems/equipment";
import { RARITY_LABEL, RARITY_COLOR, SLOT_LABEL, SLOT_ICON, rarityOrder } from "../game/data/equipment";
import { CONFIG } from "../game/config";
import type { EquipInstance, EquipSlot, Rarity } from "../game/types";

describe("V6 内容：装备槽位扩展（6 槽）", () => {
  it("7 个槽位都能随机到", () => {
    const rng = new Rng(777);
    const found = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const item = rollEquipment(rng, 500, 0);
      found.add(item.slot);
    }
    for (const s of CONFIG.EQUIPMENT.SLOTS) expect(found.has(s)).toBe(true);
  });

  it("新槽位有标签与图标且可装备", () => {
    expect(SLOT_LABEL.module).toBe("模组");
    expect(SLOT_ICON.beacon).toBeDefined();
    const st = createNewState(1);
    const eng = new GameEngine(st);
    const item = rollEquipment(new Rng(1), 500, 0, "relic", "epic");
    st.equipment.inventory = [item];
    expect(eng.equipItem(item.uid)).toBe(true);
    expect(eng.state.equipment.slots.relic).toBeDefined();
  });
});

describe("V6 内容：稀有度扩展（8 档）", () => {
  it("高阶稀有度可掉落并带传奇词条", () => {
    const rng = new Rng(42);
    let sawSingularity = false;
    let sawMythic = false;
    for (let i = 0; i < 3000; i++) {
      const item = rollEquipment(rng, 600, 1.5);
      if (item.rarity === "singularity") { sawSingularity = true; expect(item.legendary).toBeDefined(); }
      if (item.rarity === "mythic") sawMythic = true;
      if (item.rarity === "aberrant") expect(item.legendary).toBeDefined();
      if (sawSingularity && sawMythic) break;
    }
    expect(sawSingularity).toBe(true);
    expect(sawMythic).toBe(true);
  });

  it("稀有度顺序与标签/颜色齐全", () => {
    expect(rarityOrder("singularity")).toBe(7);
    expect(rarityOrder("common")).toBe(0);
    const all: Rarity[] = ["common", "fine", "rare", "epic", "legendary", "mythic", "aberrant", "singularity"];
    for (const r of all) {
      expect(RARITY_LABEL[r]).toBeTruthy();
      expect(RARITY_COLOR[r]).toBeTruthy();
    }
  });

  it("低关卡不会掉出高阶稀有度（dropMinStage 门槛）", () => {
    const rng = new Rng(9);
    for (let i = 0; i < 2000; i++) {
      const item = rollEquipment(rng, 100, 0);
      expect(["mythic", "aberrant", "singularity"]).not.toContain(item.rarity);
    }
  });

  it("制作新稀有度受关卡门槛限制", () => {
    const st = createNewState(1);
    st.combat.stage = 300;
    st.equipment.fragments = [1, 9];
    const eng = new GameEngine(st);
    expect(eng.canCraft("weapon", "mythic")).toBe(true); // 门槛 220
    expect(eng.canCraft("weapon", "singularity")).toBe(false); // 门槛 450
  });

describe("V6 内容：装备超频", () => {
  function ocEngine(): GameEngine {
    const st = createNewState(1);
    st.equipment.fragments = [1, 6]; // 1e6
    st.equipment.slots.weapon = {
      uid: "w", slot: "weapon", rarity: "rare", level: 10,
      main: { stat: "atkPct", mult: 3.5 },
      affixes: [{ stat: "atkPct", value: 0.2 }, { stat: "critDmg", value: 0.5 }],
    };
    return new GameEngine(st);
  }

  it("未满 +10 不可超频", () => {
    const eng = ocEngine();
    eng.state.equipment.slots.weapon!.level = 9;
    expect(eng.canOverclock("weapon")).toBe(false);
    expect(eng.overclock("weapon")).toBe(false);
  });

  it("超频：重置强化、提升主属性、追加副词条、扣除碎片", () => {
    const eng = ocEngine();
    const item = eng.state.equipment.slots.weapon!;
    expect(eng.canOverclock("weapon")).toBe(true);
    const cost = eng.overclockCostOf("weapon");
    const before = toBig(eng.state.equipment.fragments).toNumber();
    expect(eng.overclock("weapon")).toBe(true);
    expect(item.overclock).toBe(1);
    expect(item.level).toBe(0);
    expect(item.main.mult).toBeCloseTo(3.5 * 1.2, 3);
    expect(item.affixes.length).toBe(3); // 2 + 1
    expect(toBig(eng.state.equipment.fragments).toNumber()).toBeCloseTo(before - cost, 5);
  });

  it("超频次数封顶（MAX=3）", () => {
    const eng = ocEngine();
    const item = eng.state.equipment.slots.weapon!;
    for (let i = 0; i < 3; i++) {
      item.level = 10;
      expect(eng.overclock("weapon")).toBe(true);
    }
    item.level = 10;
    expect(eng.canOverclock("weapon")).toBe(false);
    expect(item.overclock).toBe(3);
  });
});

describe("V6 内容：自动换装工具", () => {
  it("无工具时不会自动换装", () => {
    const st = createNewState(1);
    const eng = new GameEngine(st);
    const weak: EquipInstance = { uid: "w1", slot: "weapon", rarity: "common", level: 0, main: { stat: "atkPct", mult: 1 }, affixes: [] };
    const strong: EquipInstance = { uid: "w2", slot: "weapon", rarity: "rare", level: 0, main: { stat: "atkPct", mult: 3.5 }, affixes: [{ stat: "atkPct", value: 0.2 }, { stat: "critDmg", value: 0.5 }] };
    st.equipment.slots.weapon = weak;
    st.equipment.inventory = [strong];
    eng.maybeAutoEquip();
    expect(eng.state.equipment.slots.weapon!.uid).toBe("w1");
  });

  it("购买工具后自动装备评分更高的装备", () => {
    const st = createNewState(1);
    st.combat.stage = 250;
    st.meta.discoveries = ["equipment"];
    st.player.gold = [1, 27]; // 1e27: current auto_equip price
    const eng = new GameEngine(st);
    const weak: EquipInstance = { uid: "w1", slot: "weapon", rarity: "common", level: 0, main: { stat: "atkPct", mult: 1 }, affixes: [] };
    const strong: EquipInstance = { uid: "w2", slot: "weapon", rarity: "rare", level: 0, main: { stat: "atkPct", mult: 3.5 }, affixes: [{ stat: "atkPct", value: 0.2 }, { stat: "critDmg", value: 0.5 }] };
    st.equipment.slots.weapon = weak;
    st.equipment.inventory = [strong];
    expect(eng.buyTool("auto_equip")).toBe(true);
    expect(eng.state.equipment.slots.weapon!.uid).toBe("w2");
    expect(eng.state.equipment.inventory.find((e) => e.uid === "w2")).toBeUndefined();
  });

  it("掉落时自动换装（maybeAutoEquip 保留低分装备于背包）", () => {
    const st = createNewState(2);
    const eng = new GameEngine(st);
    eng.state.items.tools.auto_equip = true;
    const weak: EquipInstance = { uid: "w1", slot: "weapon", rarity: "common", level: 0, main: { stat: "atkPct", mult: 1 }, affixes: [] };
    st.equipment.slots.weapon = weak;
    const strong: EquipInstance = { uid: "w2", slot: "weapon", rarity: "epic", level: 0, main: { stat: "atkPct", mult: 6 }, affixes: [] };
    st.equipment.inventory = [strong];
    eng.maybeAutoEquip();
    expect(eng.state.equipment.slots.weapon!.uid).toBe("w2");
    // 卸下后低分装备仍在背包
    eng.unequip("weapon");
    expect(eng.state.equipment.inventory.some((e) => e.uid === "w1")).toBe(true);
  });
});
});
