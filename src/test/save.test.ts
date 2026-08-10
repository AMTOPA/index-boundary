import { describe, it, expect } from "vitest";
import { makeSave, fnv1a, exportSave, importSave, migrateState, normalizeState, setStorage, saveGame, loadGame, clearSave } from "../game/save";
import { createNewState } from "../game/engine";

describe("存档系统", () => {
  it("fnv1a 稳定", () => {
    expect(fnv1a("hello")).toBe(fnv1a("hello"));
    expect(fnv1a("hello")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("导出/导入往返一致", () => {
    const st = createNewState(123);
    st.combat.stage = 42;
    st.player.gold = [2.5, 18];
    const text = exportSave(st);
    const back = importSave(text);
    expect(back).not.toBeNull();
    expect(back!.combat.stage).toBe(42);
    expect(back!.player.gold[0]).toBeCloseTo(2.5, 10);
    expect(back!.player.gold[1]).toBe(18);
  });

  it("篡改存档校验失败", () => {
    const st = createNewState(1);
    const file = JSON.parse(exportSave(st)) as { state: { combat: { stage: number } } };
    file.state.combat.stage = 999; // 篡改
    expect(importSave(JSON.stringify(file))).toBeNull();
  });

  it("格式错误返回 null", () => {
    expect(importSave("not json")).toBeNull();
    expect(importSave(JSON.stringify({ format: "other" }))).toBeNull();
  });

  it("migrateState 链式迁移（当前无迁移时原样返回）", () => {
    const raw = { combat: { stage: 5 } };
    const out = migrateState(raw, 1);
    expect(out).toBe(raw);
  });

  it("normalizeState 补齐缺失字段", () => {
    const s = normalizeState({});
    expect(s.combat.stage).toBe(1);
    expect(Array.isArray(s.meta.unlocks)).toBe(true);
    expect(Array.isArray(s.equipment.inventory)).toBe(true);
    const partial = normalizeState({ combat: { stage: 77 } });
    expect(partial.combat.stage).toBe(77);
    expect(partial.player.gold).toBeDefined();
  });

  it("makeSave 带版本与时间戳", () => {
    const st = createNewState(2);
    const f = makeSave(st);
    expect(f.format).toBe("index-boundary-save");
    expect(f.version).toBeGreaterThanOrEqual(1);
    expect(f.timestamp).toBeGreaterThan(0);
    expect(f.checksum.length).toBe(8);
  });

  it("注入存储后 save/load 往返", () => {
    const mem = new Map<string, string>();
    setStorage({
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => { mem.set(k, v); },
      removeItem: (k) => { mem.delete(k); },
    });
    const st = createNewState(9);
    st.combat.stage = 33;
    saveGame(st);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.state.combat.stage).toBe(33);
    expect(loaded!.fromBackup).toBe(false);
    clearSave();
    expect(loadGame()).toBeNull();
    setStorage(null);
  });
});
  it("normalizeState 自愈负数天赋点（旧版本 bug 存档）", () => {
    const s = normalizeState({ talents: { points: -3 } });
    expect(s.talents.points).toBe(0);
    // 正常正数不受影响
    const ok = normalizeState({ talents: { points: 7 } });
    expect(ok.talents.points).toBe(7);
  });