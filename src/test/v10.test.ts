import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { toBig } from "../game/bignum";
import { TOOL_DEFS } from "../game/data/items";
import { equipScore } from "../game/data/equipment";
import type { EquipInstance, ToolId } from "../game/types";

function walledPrestigeEngine(seed = 1): GameEngine {
  const st = createNewState(seed);
  st.meta.unlocks = ["prestige"];
  st.statistics.runDamage = [1, 30]; // 1e30 → 能量 > 0
  st.statistics.totalPrestiges = 1; // 已至少重构 1 次（自动重构购买门槛）
  st.combat.stage = 500;
  st.combat.enemyHp = [1, 50]; // 巨大 HP → 卡墙
  st.combat.enemyMaxHp = [1, 50];
  st.player.gold = [1, 25]; // 1e25，够买 1e24 自动重构
  return new GameEngine(st);
}

describe("V10 内容：自动重构工具 + 装备评分", () => {
  it("auto_prestige 未重构前不可购买（重构次数门槛）", () => {
    const eng = walledPrestigeEngine(9);
    eng.state.statistics.totalPrestiges = 0;
    expect(eng.canBuyTool("auto_prestige")).toBe(false);
    eng.state.statistics.totalPrestiges = 1;
    expect(eng.canBuyTool("auto_prestige")).toBe(true);
  });

  it("auto_prestige 工具注册且可购买", () => {
    expect(TOOL_DEFS.auto_prestige).toBeDefined();
    const eng = walledPrestigeEngine(1);
    expect(eng.canBuyTool("auto_prestige")).toBe(true);
    expect(eng.buyTool("auto_prestige")).toBe(true);
    expect(eng.toolOwned("auto_prestige")).toBe(true);
  });

  it("卡墙且可重构时自动执行重构（每 10s 检查）", () => {
    const eng = walledPrestigeEngine(2);
    eng.buyTool("auto_prestige");
    const prestigesBefore = eng.state.statistics.totalPrestiges;
    eng.tick(1); // autoPrestigeTimer 初始 0 → 立即检查
    expect(eng.state.statistics.totalPrestiges).toBe(prestigesBefore + 1);
    expect(eng.state.prestige.energy).toBeGreaterThan(0);
  });

  it("未卡墙时不自动重构（击杀时间远小于阈值）", () => {
    const eng = walledPrestigeEngine(3);
    eng.state.combat.enemyHp = [5, 0]; // 5 HP / DPS ~10 → 击杀时间 ≈ 0.5s
    eng.state.combat.enemyMaxHp = [5, 0];
    eng.buyTool("auto_prestige");
    const before = eng.state.statistics.totalPrestiges;
    for (let i = 0; i < 30; i++) eng.tick(1);
    expect(eng.state.statistics.totalPrestiges).toBe(before);
  });

  it("未购买工具时即使卡墙也不自动重构", () => {
    const eng = walledPrestigeEngine(4);
    const before = eng.state.statistics.totalPrestiges;
    eng.tick(1);
    expect(eng.state.statistics.totalPrestiges).toBe(before);
  });

  it("装备评分函数可用且单调增长", () => {
    const base: EquipInstance = { uid: "u1", slot: "weapon", rarity: "rare", level: 0, main: { stat: "atkPct", mult: 2 }, affixes: [] };
    const s0 = equipScore(base);
    const enhanced = equipScore({ ...base, level: 5 });
    const moreAffix = equipScore({ ...base, affixes: [{ stat: "aspdPct", value: 0.1 }, { stat: "goldPct", value: 0.1 }] });
    const oc = equipScore({ ...base, overclock: 2 });
    expect(enhanced).toBeGreaterThan(s0);
    expect(moreAffix).toBeGreaterThan(s0);
    expect(oc).toBeGreaterThan(s0);
  });

  it("engine.scoreOf 与 equipScore 一致", () => {
    const eng = new GameEngine(createNewState(5));
    const item: EquipInstance = { uid: "u2", slot: "core", rarity: "epic", level: 3, main: { stat: "critDmg", mult: 6 }, affixes: [{ stat: "atkPct", value: 0.2 }] };
    expect(eng.scoreOf(item)).toBeCloseTo(equipScore(item), 8);
    void ("" as ToolId);
  });
});