import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { Big } from "../game/bignum";
import { CONFIG } from "../game/config";
import { SKILL_IDS } from "../game/data/skills";
import { upgradeCost, upgradeTotalCost, goldMultFromLevel, critDamageFromLevel } from "../game/formulas";

const BASE_UPGRADE_IDS = ["attack", "aspd", "critChance", "critDamage", "gold"] as const;

function createUpgradeTestState(stage: number, seed: number) {
  const state = createNewState(seed);
  state.combat.stage = stage;
  state.meta.unlocks = ["aspd_upgrade", "crit"];
  state.player.gold = [1e12, 0];
  return state;
}

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

  it("auto_attack 解锁后 Boss 也按 APS 累积攻击且不依赖彼岸开关", () => {
    for (const bossAutoAttack of [false, true]) {
      const st = createNewState(bossAutoAttack ? 71 : 70);
      st.meta.unlocks = ["auto_attack"];
      st.combat.stage = 10;
      st.combat.isBoss = true;
      st.combat.enemyHp = [1000, 0];
      st.combat.enemyMaxHp = [1000, 0];
      st.combat.bossTimer = 30;
      st.nexus.bossAutoAttack = bossAutoAttack;
      const eng = new GameEngine(st);
      const hpBefore = Big.fromTuple(eng.state.combat.enemyHp).toNumber();
      const attackInterval = 1 / eng.derived.effectiveAps;

      eng.tick(attackInterval * 0.4);
      expect(Big.fromTuple(eng.state.combat.enemyHp).toNumber()).toBe(hpBefore);

      eng.tick(attackInterval * 0.61);
      const hpAfter = Big.fromTuple(eng.state.combat.enemyHp).toNumber();
      expect(hpAfter).toBeLessThan(hpBefore);
      expect(hpAfter).toBeGreaterThan(0);
    }
  });

  it("auto_boss 只负责 Boss 失败后留在同关自动重试", () => {
    const retryState = createNewState(72);
    retryState.combat.stage = 10;
    retryState.combat.isBoss = true;
    retryState.combat.enemyHp = [1000, 0];
    retryState.combat.enemyMaxHp = [1000, 0];
    retryState.combat.bossTimer = 0.01;
    retryState.items.tools.auto_boss = true;
    const retryEngine = new GameEngine(retryState);

    retryEngine.tick(0.02);

    expect(retryEngine.state.combat.stage).toBe(10);
    expect(retryEngine.state.combat.isBoss).toBe(true);
    expect(retryEngine.state.combat.bossTimer).toBeGreaterThan(0);

    const fallbackState = createNewState(73);
    fallbackState.combat.stage = 10;
    fallbackState.combat.isBoss = true;
    fallbackState.combat.enemyHp = [1000, 0];
    fallbackState.combat.enemyMaxHp = [1000, 0];
    fallbackState.combat.bossTimer = 0.01;
    const fallbackEngine = new GameEngine(fallbackState);

    fallbackEngine.tick(0.02);

    expect(fallbackEngine.state.combat.stage).toBe(9);
    expect(fallbackEngine.state.combat.isBoss).toBe(false);
  });

  it("升级购买与派生属性联动", () => {
    const eng = new GameEngine();
    const st = eng.state;
    st.player.gold = [1e6, 0];
    const before = eng.derived.damagePerHit.toNumber();
    expect(eng.buyUpgrade("attack")).toBe(true);
    expect(eng.derived.damagePerHit.toNumber()).toBeGreaterThan(before);
  });

  it("caps every base upgrade at the current stage for single purchases", () => {
    const stage = 12;
    for (const id of BASE_UPGRADE_IDS) {
      const st = createUpgradeTestState(stage, 101);
      st.player.upgrades[id] = stage - 1;
      const eng = new GameEngine(st);

      expect(eng.upgradeMaxLevel(id)).toBe(stage);
      expect(eng.buyUpgrade(id)).toBe(true);
      expect(eng.state.player.upgrades[id]).toBe(stage);
      const goldAtCap = eng.state.player.gold;
      expect(eng.buyUpgrade(id)).toBe(false);
      expect(eng.state.player.upgrades[id]).toBe(stage);
      expect(eng.state.player.gold).toEqual(goldAtCap);
    }
  });

  it("caps every base upgrade at the current stage for batch purchases", () => {
    const stage = 12;
    for (const id of BASE_UPGRADE_IDS) {
      const st = createUpgradeTestState(stage, 102);
      st.player.upgrades[id] = stage - 3;
      const eng = new GameEngine(st);

      expect(eng.buyUpgradeTimes(id, 100)).toBe(3);
      expect(eng.state.player.upgrades[id]).toBe(stage);
      expect(eng.buyUpgradeTimes(id, 10)).toBe(0);
      expect(eng.state.player.upgrades[id]).toBe(stage);
    }
  });

  it("limits MAX binary search to the levels remaining before the stage cap", () => {
    const stage = 12;
    for (const id of BASE_UPGRADE_IDS) {
      const st = createUpgradeTestState(stage, 103);
      st.player.upgrades[id] = stage - 4;
      const eng = new GameEngine(st);

      expect(eng.buyUpgradeMax(id)).toBe(4);
      expect(eng.state.player.upgrades[id]).toBe(stage);
      const goldAtCap = eng.state.player.gold;
      expect(eng.buyUpgradeMax(id)).toBe(0);
      expect(eng.state.player.upgrades[id]).toBe(stage);
      expect(eng.state.player.gold).toEqual(goldAtCap);
    }
  });

  it("keeps Smart Buy within the current-stage cap for every base upgrade", () => {
    const stage = 12;
    for (const target of BASE_UPGRADE_IDS) {
      const st = createUpgradeTestState(stage, 104);
      for (const id of BASE_UPGRADE_IDS) st.player.upgrades[id] = stage;
      st.player.upgrades[target] = stage - 1;
      const eng = new GameEngine(st);

      expect(eng.smartBuy()).toBe(true);
      expect(eng.state.player.upgrades[target]).toBe(stage);
      expect(BASE_UPGRADE_IDS.every((id) => eng.state.player.upgrades[id] <= stage)).toBe(true);
      expect(eng.smartBuy()).toBe(false);
    }
  });

  it("keeps high-level rebased upgrade costs finite and non-zero", () => {
    for (const id of ["attack", "gold"] as const) {
      const single = upgradeCost(id, 15_000);
      const batch = upgradeTotalCost(id, 15_000, 500);
      expect(single.isZero()).toBe(false);
      expect(batch.isZero()).toBe(false);
      expect(batch.gt(single)).toBe(true);
    }
  });

  it("auto upgrade catches up high-stage saves in large batches without exceeding the stage cap", () => {
    const stage = 15_000;
    const st = createUpgradeTestState(stage, 105);
    st.player.gold = [1, 1_000_000];
    st.items.tools.auto_upgrade = true;
    const eng = new GameEngine(st);
    const totalCap = stage * BASE_UPGRADE_IDS.length;
    const before = BASE_UPGRADE_IDS.reduce((sum, id) => sum + eng.state.player.upgrades[id], 0);

    for (let i = 0; i < 10; i++) eng.tick(0.1);

    const after = BASE_UPGRADE_IDS.reduce((sum, id) => sum + eng.state.player.upgrades[id], 0);
    expect(after - before).toBeGreaterThanOrEqual(totalCap / 4);
    expect(BASE_UPGRADE_IDS.every((id) => eng.state.player.upgrades[id] <= stage)).toBe(true);
  });

  it("auto upgrade keeps skill-core spending at the original bounded pace", () => {
    const st = createNewState(109);
    st.items.tools.auto_upgrade = true;
    st.player.gold = [0, 0];
    st.skills.cores = [1, 100];
    st.skills.actives = [{ id: "overclock", level: 1, cdRemaining: 0, activeUntil: 0, active: false }];
    const eng = new GameEngine(st);
    const totalSkillLevels = () => eng.state.skills.actives.reduce((sum, skill) => sum + skill.level, 0)
      + Object.values(eng.state.skills.passives).reduce((sum, level) => sum + level, 0);
    const before = totalSkillLevels();

    for (let i = 0; i < 10; i++) eng.tick(0.1);

    expect(totalSkillLevels() - before).toBe(2);
  });

  it("base combo can reach its expanded 400-hit ceiling", () => {
    const st = createNewState(107);
    st.combat.combo = 399;
    st.combat.comboTimer = CONFIG.COMBO_WINDOW_SEC;
    st.combat.enemyHp = [1000, 0];
    st.combat.enemyMaxHp = [1000, 0];
    const eng = new GameEngine(st);

    eng.click();

    expect(eng.state.combat.combo).toBe(400);
  });

  it("Boss deadline frame resolves damage at the deadline without granting post-timeout attacks", () => {
    const lethal = createNewState(106);
    lethal.meta.unlocks = ["auto_attack"];
    lethal.combat.stage = 10;
    lethal.combat.isBoss = true;
    lethal.combat.enemyHp = [1, 0];
    lethal.combat.enemyMaxHp = [1, 0];
    lethal.combat.bossAffixes = [];
    const lethalEngine = new GameEngine(lethal);
    const attackInterval = 1 / lethalEngine.derived.effectiveAps;
    lethalEngine.state.combat.bossTimer = attackInterval + 0.000_001;

    lethalEngine.tick(attackInterval + 0.01);

    expect(lethalEngine.state.combat.stage).toBe(11);
    expect(lethalEngine.state.combat.isBoss).toBe(false);

    const expired = createNewState(108);
    expired.meta.unlocks = ["auto_attack"];
    expired.combat.stage = 10;
    expired.combat.isBoss = true;
    expired.combat.enemyHp = [1, 0];
    expired.combat.enemyMaxHp = [1, 0];
    expired.combat.bossAffixes = [];
    expired.combat.bossTimer = 0.01;
    const expiredEngine = new GameEngine(expired);

    expiredEngine.tick(1);

    expect(expiredEngine.state.combat.stage).toBe(9);
    expect(expiredEngine.state.combat.isBoss).toBe(false);
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
    st.combat.stage = 500;
    st.player.gold = [5, 5]; // 5e5
    const eng = new GameEngine(st);
    expect(eng.canPrestige()).toBe(true);
    const res = eng.prestige();
    expect(res).not.toBeNull();
    expect(res!.energyGained).toBeGreaterThan(0);
    expect(eng.state.combat.stage).toBe(1);
    expect(eng.state.prestige.energy).toBeGreaterThan(0);
    expect(eng.state.prestige.totalEnergyEarned).toBe(res!.energyGained);
    expect(eng.state.prestige.nextRequiredStage).toBe(600);
  });

  it("离线模拟：O(1) 估算，不产生 NaN", () => {
    const st = createNewState(42);
    st.meta.lastSeenAt = Date.now() - 3600 * 1000; // 离线 1 小时
    const eng = new GameEngine(st);
    const off = eng.handleOffline(Date.now());
    expect(off).not.toBeNull();
    if (off) {
      expect(off.seconds).toBeGreaterThan(0);
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

  it("buyUpgradeMax：闭式总价与暴力求和一致（全部升级类型）", () => {
    const types = ["attack", "aspd", "critChance", "critDamage", "gold"] as const;
    const cases: [number, number][] = [[0, 1], [0, 10], [3, 7], [24, 3], [25, 10], [49, 5], [50, 12], [99, 25], [0, 100]];
    for (const id of types) {
      for (const [from, n] of cases) {
        const eng = new GameEngine(createNewState(1));
        // 暴力求和
        let brute = Big.ZERO;
        for (let i = 0; i < n; i++) {
          brute = brute.add(upgradeCost(id, from + i));
        }
        const total = upgradeTotalCost(id, from, n);
        expect(Math.abs(total.sub(brute).div(brute).toNumber())).toBeLessThan(1e-9);
      }
    }
  });

  it("buyUpgradeMax：用当前金币买满不超支", () => {
    const st = createNewState(1);
    st.combat.stage = 1000;
    st.player.gold = [1e9, 0];
    const eng = new GameEngine(st);
    const before = eng.state.player.upgrades.attack;
    const goldBefore = Big.fromTuple(eng.state.player.gold);
    const n = eng.buyUpgradeMax("attack");
    expect(n).toBeGreaterThan(0);
    expect(eng.state.player.upgrades.attack).toBe(before + n);
    expect(goldBefore.gte(upgradeTotalCost("attack", before, n))).toBe(true);
    // 买完后再买应买不起（金币已耗尽）
    const n2 = eng.buyUpgradeMax("attack");
    expect(n2).toBe(0);
  });

  it("防御性截断：超高等级金币/暴伤不产生 Infinity（防 1e308 崩溃）", () => {
    expect(goldMultFromLevel(100000)).toBe(1e300);
    expect(goldMultFromLevel(1000000)).toBe(1e300);
    expect(critDamageFromLevel(1000000)).toBe(1e300);
  });
  it("金币升级指数无上限：等级越高倍率越高且持续增长", () => {
    
    expect(goldMultFromLevel(0)).toBe(1);
    const g1 = goldMultFromLevel(50);
    const g2 = goldMultFromLevel(500);
    expect(g2).toBeGreaterThan(g1 * 1e5); // 无软上限：500 级远高于 50 级（1.03^450≈6e5）
  });
});
  it("天赋：点数不足时不能分配（可用点数不会变负）", () => {
    const st = createNewState(5);
    st.meta.unlocks = ["talents"];
    st.talents.points = 1;
    const eng = new GameEngine(st);
    // sing_law 为 cost=2 的 1 级节点（无前置）
    expect(eng.canAllocate("sing_law")).toBe(false);
    expect(eng.allocate("sing_law")).toBe(false);
    expect(eng.state.talents.points).toBe(1);
    // 0 点同样安全
    st.talents.points = 0;
    expect(eng.allocate("sing_law")).toBe(false);
    expect(eng.state.talents.points).toBe(0);
  });

  it("天赋：加载预设时重置全部 4 棵树，可用点数不为负", () => {
    const st = createNewState(6);
    st.meta.unlocks = ["talents"];
    // 仅第三层（奇点）树有投入，主三棵树为空
    st.talents.points = 0;
    st.talents.allocations = {
      sing_law: 3, sing_cap: 3, sing_skill_cd: 3, sing_overflow: 3, sing_keystone_boss: 1,
    };
    st.talents.keystones = { singularity: "sing_keystone_boss" };
    st.talents.presets = [
      { name: "", talents: {}, keystones: {} },
      {
        name: "主树流",
        talents: { dest_sharp: 5, dest_crit: 3, dest_super: 3, dest_hunter: 1, dest_keystone_absolute: 1 },
        keystones: { destruction: "dest_keystone_absolute" },
      },
      { name: "", talents: {}, keystones: {} },
    ];
    const eng = new GameEngine(st);
    expect(eng.canLoadBuild(1)).toBe(true);
    expect(eng.loadBuild(1)).toBe(true);
    expect(eng.state.talents.points).toBeGreaterThanOrEqual(0);
    // 重新分配后应该正好等于 9（28 返还 - 19 消耗）
    expect(eng.state.talents.points).toBe(9);
  });