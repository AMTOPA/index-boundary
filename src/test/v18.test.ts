import { describe, expect, it } from "vitest";
import { CONFIG } from "../game/config";
import { GameEngine, createNewState } from "../game/engine";
import { normalizeState } from "../game/save";

function advancedAutoLeap(stage: number = CONFIG.LEAP.STAGE) {
  const state = createNewState(1801);
  state.meta.unlocks.push("leap");
  state.leap.purchases.autoLeap = 1;
  state.leap.totalLeaps = 3;
  state.leap.nextRequiredStage = CONFIG.LEAP.STAGE;
  state.combat.stage = stage;
  return new GameEngine(state);
}

describe("V18 高级自动跃迁策略", () => {
  it("高级策略满足所有阈值时会立即跃迁", () => {
    const engine = advancedAutoLeap();
    engine.setAutoLeapRule({ enabled: true, minStage: CONFIG.LEAP.STAGE, minCores: 1, minTotalLeaps: 3 });
    engine.tick(0.05);
    expect(engine.state.leap.totalLeaps).toBe(4);
  });

  it("预计核心不足时不会跃迁", () => {
    const engine = advancedAutoLeap();
    engine.setAutoLeapRule({ enabled: true, minCores: 2 });
    engine.tick(0.05);
    expect(engine.state.leap.totalLeaps).toBe(3);
  });

  it("关卡或累计跃迁阈值不足时不会跃迁", () => {
    const stageBlocked = advancedAutoLeap();
    stageBlocked.setAutoLeapRule({ enabled: true, minStage: CONFIG.LEAP.STAGE + 500 });
    stageBlocked.tick(0.05);
    expect(stageBlocked.state.leap.totalLeaps).toBe(3);

    const countBlocked = advancedAutoLeap();
    countBlocked.setAutoLeapRule({ enabled: true, minTotalLeaps: 4 });
    countBlocked.tick(0.05);
    expect(countBlocked.state.leap.totalLeaps).toBe(3);
  });

  it("关闭策略后不执行，且硬门槛仍不能绕过", () => {
    const disabled = advancedAutoLeap();
    disabled.setAutoLeapRule({ enabled: false });
    disabled.tick(0.05);
    expect(disabled.state.leap.totalLeaps).toBe(3);

    const belowGate = advancedAutoLeap(CONFIG.LEAP.STAGE - 1);
    belowGate.setAutoLeapRule({ enabled: true, minStage: 0, minCores: 1, minTotalLeaps: 3 });
    belowGate.tick(0.05);
    expect(belowGate.state.leap.totalLeaps).toBe(3);
  });

  it("旧存档会补齐安全默认值并清理非法阈值", () => {
    const legacy = normalizeState({ meta: { version: CONFIG.SAVE_VERSION }, leap: { autoRule: { minStage: -10, minCores: "bad", minTotalLeaps: 3.9 } } });
    expect(legacy.leap.autoRule).toEqual({ enabled: true, minStage: 0, minCores: 1, minTotalLeaps: 3 });
  });

  it("?????????????????????", () => {
    const blocked = advancedAutoLeap();
    blocked.state.meta.activeChallenge = "no_crit";
    blocked.tick(0.05);
    expect(blocked.state.leap.totalLeaps).toBe(3);

    const preserved = advancedAutoLeap();
    preserved.setAutoLeapRule({ minStage: CONFIG.LEAP.STAGE, minCores: 1, minTotalLeaps: 3 });
    preserved.tick(0.05);
    expect(preserved.state.leap.autoRule).toEqual({ enabled: true, minStage: CONFIG.LEAP.STAGE, minCores: 1, minTotalLeaps: 3 });
  });

  it("??????????????", () => {
    const state = createNewState(1802);
    state.meta.unlocks.push("leap");
    state.leap.purchases.autoLeap = 1;
    state.leap.totalLeaps = 2;
    state.combat.stage = CONFIG.LEAP.STAGE;
    const fast = new GameEngine(state);
    fast.state.combat.enemyHp = [1, 0];
    fast.tick(0.05);
    expect(fast.state.leap.totalLeaps).toBe(2);

    const wallState = createNewState(1803);
    wallState.meta.unlocks.push("leap");
    wallState.leap.purchases.autoLeap = 1;
    wallState.leap.totalLeaps = 2;
    wallState.combat.stage = CONFIG.LEAP.STAGE;
    const wall = new GameEngine(wallState);
    wall.state.combat.enemyHp = [1, 20];
    wall.tick(0.05);
    expect(wall.state.leap.totalLeaps).toBe(3);
  });
});
