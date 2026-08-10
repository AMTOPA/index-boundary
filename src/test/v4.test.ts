import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { toBig } from "../game/bignum";
import type { GameEvent, SkillId } from "../game/types";

describe("V4 内容：永久工具商店", () => {
  it("buyTool 扣除金币并置已拥有", () => {
    const st = createNewState(1);
    st.player.gold = [1, 9]; // 1e9 足够购买
    const eng = new GameEngine(st);
    expect(eng.canBuyTool("auto_upgrade")).toBe(true);
    const goldBefore = toBig(eng.state.player.gold);
    const cost = toBig(eng.toolCost("auto_upgrade"));
    expect(eng.buyTool("auto_upgrade")).toBe(true);
    expect(eng.toolOwned("auto_upgrade")).toBe(true);
    expect(toBig(eng.state.player.gold).toNumber()).toBeCloseTo(goldBefore.sub(cost).toNumber(), 5);
  });

  it("重复购买失败且不重复扣款", () => {
    const st = createNewState(1);
    st.player.gold = [1, 9];
    const eng = new GameEngine(st);
    expect(eng.buyTool("auto_boss")).toBe(true);
    const gold = toBig(eng.state.player.gold).toNumber();
    expect(eng.buyTool("auto_boss")).toBe(false);
    expect(toBig(eng.state.player.gold).toNumber()).toBeCloseTo(gold, 5);
  });

  it("金币不足时 canBuyTool / buyTool 均失败", () => {
    const st = createNewState(1);
    st.player.gold = [0, 0];
    const eng = new GameEngine(st);
    expect(eng.canBuyTool("auto_skill")).toBe(false);
    expect(eng.buyTool("auto_skill")).toBe(false);
    expect(eng.toolOwned("auto_skill")).toBe(false);
  });

  it("buyTool 触发 unlock 事件", () => {
    const st = createNewState(1);
    st.player.gold = [1, 15]; // 1e15 ≥ 1e12（auto_skill 新价）
    const eng = new GameEngine(st);
    const keys: string[] = [];
    eng.onEvent((e: GameEvent) => {
      if (e.type === "unlock") keys.push(e.key);
    });
    eng.buyTool("auto_skill");
    expect(keys).toContain("auto_skill");
  });
});

describe("V4 内容：自动释放技能", () => {
  function skillEngine(seed: number, ids: SkillId[]): GameEngine {
    const st = createNewState(seed);
    st.meta.unlocks = ["skills"];
    const eng = new GameEngine(st);
    for (const id of ids) eng.unlockSkill(id);
    return eng;
  }

  it("auto_skill 冷却结束自动释放并进入冷却", () => {
    const eng = skillEngine(1, ["overclock"]);
    const casts: SkillId[] = [];
    eng.onEvent((e: GameEvent) => {
      if (e.type === "skillCast") casts.push(e.skill);
    });
    eng.state.items.tools.auto_skill = true;
    eng.tick(0.1);
    expect(casts).toContain("overclock");
    const inst = eng.state.skills.actives[0];
    expect(inst.cdRemaining).toBeGreaterThan(0);
  });

  it("冷却期间不会重复释放", () => {
    const eng = skillEngine(2, ["overclock"]);
    let casts = 0;
    eng.onEvent((e: GameEvent) => {
      if (e.type === "skillCast") casts++;
    });
    eng.state.items.tools.auto_skill = true;
    eng.tick(0.1);
    eng.tick(0.1);
    expect(casts).toBe(1);
  });

  it("未购买 auto_skill 时不会自动释放", () => {
    const eng = skillEngine(3, ["overclock"]);
    let casts = 0;
    eng.onEvent((e: GameEvent) => {
      if (e.type === "skillCast") casts++;
    });
    eng.tick(0.1);
    expect(casts).toBe(0);
  });

  it("瞬时技能（奇点炮）也会自动释放", () => {
    const eng = skillEngine(4, ["singularity_cannon"]);
    let casts = 0;
    eng.onEvent((e: GameEvent) => {
      if (e.type === "skillCast") casts++;
    });
    eng.state.items.tools.auto_skill = true;
    eng.tick(0.1);
    expect(casts).toBe(1);
  });
});

describe("V4 内容：自动挑战 Boss", () => {
  function bossEngine(seed: number): GameEngine {
    const st = createNewState(seed);
    st.meta.unlocks = ["boss"];
    st.combat.stage = 10;
    st.combat.isBoss = true;
    st.combat.enemyHp = [1, 6];
    st.combat.enemyMaxHp = [1, 6];
    st.combat.bossTimer = 25;
    return new GameEngine(st);
  }

  it("auto_boss 失败后同关重试（stage 不变且刷新计时）", () => {
    const eng = bossEngine(1);
    eng.state.items.tools.auto_boss = true;
    const fails: number[] = [];
    eng.onEvent((e: GameEvent) => {
      if (e.type === "bossFail") fails.push(e.stage);
    });
    eng.tick(30);
    expect(fails).toContain(10);
    expect(eng.state.combat.stage).toBe(10);
    expect(eng.state.combat.isBoss).toBe(true);
    expect(eng.state.combat.bossTimer).toBeGreaterThan(0);
  });

  it("无 auto_boss 时退回前一关", () => {
    const eng = bossEngine(2);
    eng.tick(30);
    expect(eng.state.combat.stage).toBe(9); // 退回前一关刷资源
    expect(eng.state.combat.isBoss).toBe(false); // 非 Boss 关
  });
});

describe("V4 内容：自动分解门槛", () => {
  it("setAutoBreakdown 无工具时拒绝", () => {
    const st = createNewState(1);
    const eng = new GameEngine(st);
    expect(eng.setAutoBreakdown("rare")).toBe(false);
    expect(eng.state.equipment.autoBreakdown).toBeNull();
  });

  it("购买自动分解器后可设置", () => {
    const st = createNewState(1);
    st.player.gold = [1, 9];
    const eng = new GameEngine(st);
    eng.buyTool("auto_breakdown");
    expect(eng.setAutoBreakdown("rare")).toBe(true);
    expect(eng.state.equipment.autoBreakdown).toBe("rare");
  });

describe("V4 内容：持续技能到期后可再次自动释放", () => {
  it("overclock buff 到期后 auto_skill 会再次释放", () => {
    const st = createNewState(5);
    st.meta.unlocks = ["skills"];
    const eng = new GameEngine(st);
    eng.unlockSkill("overclock");
    eng.state.items.tools.auto_skill = true;
    let casts = 0;
    eng.onEvent((e: GameEvent) => {
      if (e.type === "skillCast") casts++;
    });
    // 推进 71 秒：第一次释放 + buff 到期 + 冷却结束 + 第二次释放
    for (let t = 0; t < 710; t++) eng.tick(0.1);
    expect(casts).toBe(2); // 恰好两次：冷却结束即释放，到期后才会再次释放
    const inst = eng.state.skills.actives[0];
    // 到期后 active 复位为 false（buff 以 activeUntil 为准）
    expect(inst.active).toBe(false);
  });
});
});
