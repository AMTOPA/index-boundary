import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { normalizeState } from "../game/save";

function talentEngine(seed = 1): GameEngine {
  const st = createNewState(seed);
  st.meta.unlocks = ["talents"];
  st.talents.points = 20;
  return new GameEngine(st);
}

describe("V11 内容：构筑预设（天赋方案存档/加载）", () => {
  it("初始化 3 个空预设槽", () => {
    const eng = new GameEngine(createNewState(1));
    expect(eng.state.talents.presets.length).toBe(3);
    for (const p of eng.state.talents.presets) {
      expect(p.name).toBe("");
      expect(Object.keys(p.talents).length).toBe(0);
    }
  });

  it("保存预设快照并加载还原", () => {
    const eng = talentEngine(2);
    expect(eng.allocate("dest_sharp")).toBe(true);
    expect(eng.allocate("dest_crit")).toBe(true);
    eng.saveBuild(0, "预设A");
    const snap = eng.state.talents.presets[0];
    expect(snap.name).toBe("预设A");
    expect(snap.talents.dest_sharp).toBe(1);
    expect(snap.talents.dest_crit).toBe(1);

    // 改成另一套
    eng.resetTree("destruction");
    expect(eng.allocate("auto_beat")).toBe(true);
    expect(eng.state.talents.allocations.auto_beat ?? 0).toBe(1);

    expect(eng.canLoadBuild(0)).toBe(true);
    expect(eng.loadBuild(0)).toBe(true);
    expect(eng.state.talents.allocations.dest_sharp).toBe(1);
    expect(eng.state.talents.allocations.dest_crit).toBe(1);
    expect(eng.state.talents.allocations.auto_beat ?? 0).toBe(0);
  });

  it("空槽位不可加载", () => {
    const eng = talentEngine(3);
    expect(eng.canLoadBuild(1)).toBe(false);
    expect(eng.loadBuild(1)).toBe(false);
  });

  it("点数不足时不可加载", () => {
    const eng = talentEngine(4);
    eng.state.talents.points = 10;
    eng.allocate("dest_sharp");
    eng.allocate("dest_crit");
    eng.allocate("dest_super");
    eng.saveBuild(0, "预设A");
    // 花光点后改为小方案
    eng.resetTree("destruction");
    eng.state.talents.points = 1;
    eng.allocate("auto_beat");
    expect(eng.canLoadBuild(0)).toBe(false);
    expect(eng.loadBuild(0)).toBe(false);
  });

  it("normalize 旧档补齐 3 个预设槽", () => {
    const s = normalizeState({});
    expect(s.talents.presets.length).toBe(3);
    expect(s.talents.presets[0].name).toBe("");
  });
});