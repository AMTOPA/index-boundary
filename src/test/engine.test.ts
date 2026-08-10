import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { Big } from "../game/bignum";
import { CONFIG } from "../game/config";
import { SKILL_IDS } from "../game/data/skills";

describe("GameEngine", () => {
  it("新存档生成敌人", () => {
    const eng = new GameEngine();
    expect(eng.state.combat.stage).toBe(1);
    expect(Big.fromTuple(eng.state.combat.enemyMaxHp).isZero()).toBe(false);
  });

  it("点击造成伤害", () => {
    // 固定高 HP，避免 5% 基础暴击随机击杀导致换关（确定性）
    const st = createNewState(1);
    st.combat.enemyHp = [1000, 0];
    st.combat.enemyMaxHp = [1000, 0];
    const eng = new GameEngine(st);
    const before = Big.fromTuple(eng.state.combat.enemyHp).toNumber();
    eng.click();
    const after = Big.fromTuple(eng.state.combat.enemyHp).toNumber();
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
  });

  it("击杀后推进关卡，Boss 每 10 关出现", () => {
    const st = createNewState(7);
    st.combat.stage = 9;
    st.combat.enemyHp = [1, 0];
    st.combat.enemyMaxHp = [1, 0];
    const eng = new GameEngine(st);
    eng.click(); // 击杀第 9 关
    expect(eng.state.combat.stage).toBe(10);
    expect(eng.state.combat.isBoss).toBe(true);
    expect(eng.state.combat.bossTimer).toBeGreaterThan(0);
  });

  it("升级购买与派生属性联动", () => {
    const eng = new GameEngine();
    const st = eng.state;
    st.player.gold = [1e6, 0];
    const before = eng.derived.damagePerHit.toNumber();
    expect(eng.buyUpgrade("attack")).toBe(true);
    expect(eng.derived.damagePerHit.toNumber()).toBeGreaterThan(before);
  });

  it("技能释放与冷却", () => {
    const st = createNewState(3);
    st.skills.actives = [{ id: "overclock", level: 1, cdRemaining: 0, activeUntil: 0, active: false }];
    const eng = new GameEngine(st);
    const apsBefore = eng.derived.panelAps;
    expect(eng.cast("overclock")).toBe(true);
    expect(eng.derived.panelAps).toBeGreaterThan(apsBefore);
    // 冷却中不能重复释放
    expect(eng.cast("overclock")).toBe(false);
  });

  it("重构：能量结算并重置", () => {
    const st = createNewState(11);
    st.statistics.runDamage = [1, 30]; // 1e30
    st.meta.unlocks = ["prestige"];
    st.combat.stage = 400;
    st.player.gold = [5, 5]; // 5e5
    const eng = new GameEngine(st);
    expect(eng.canPrestige()).toBe(true);
    const res = eng.prestige();
    expect(res).not.toBeNull();
    expect(res!.energyGained).toBeGreaterThan(0);
    expect(eng.state.combat.stage).toBe(1);
    expect(eng.state.prestige.energy).toBeGreaterThan(0);
    expect(eng.state.prestige.totalEnergyEarned).toBe(res!.energyGained);
  });

  it("离线模拟：O(1) 估算，不产生 NaN", () => {
    const st = createNewState(42);
    st.meta.lastSeenAt = Date.now() - 3600 * 1000; // 离线 1 小时
    const eng = new GameEngine(st);
    const off = eng.handleOffline(Date.now());
    expect(off).not.toBeNull();
    if (off) {
      expect(off.secondsSimulated).toBeGreaterThan(0);
      expect(Number.isFinite(off.goldGained.toNumber())).toBe(true);
      expect(off.kills).toBeGreaterThan(0);
      expect(off.stagesAdvanced).toBeGreaterThan(0);
    }
  });

  it("1 小时自动玩家冒烟：无 NaN、能推进、能打 Boss", () => {
    const eng = new GameEngine();
    const dt = 1 / CONFIG.TICK_RATE;
    const ticks = Math.floor(3600 / dt);
    let buy = 0;
    for (let i = 0; i < ticks; i++) {
      eng.tick(dt);
      const stage = eng.state.combat.stage;
      if (stage < 5 || eng.state.combat.isBoss) eng.click();
      else if (i % 30 === 0) eng.click();
      buy++;
      if (buy >= 10) {
        buy = 0;
        eng.smartBuy();
        for (const id of SKILL_IDS) {
          const inst = eng.state.skills.actives.find((s) => s.id === id);
          if (inst && inst.cdRemaining <= 0 && !inst.active) eng.cast(id);
        }
        if (eng.canPrestige()) eng.prestige();
      }
    }
    const d = eng.derived;
    expect(Number.isFinite(d.dps.toNumber())).toBe(true);
    expect(Number.isFinite(d.damagePerHit.toNumber())).toBe(true);
    expect(eng.state.combat.stage).toBeGreaterThan(1);
    expect(eng.state.statistics.totalKills).toBeGreaterThan(50);
    expect(eng.state.statistics.allTimeMaxStage).toBeGreaterThanOrEqual(eng.state.combat.stage);
  });
});