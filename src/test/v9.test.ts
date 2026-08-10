import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { toBig } from "../game/bignum";
import { normalizeState } from "../game/save";
import { ensureDaily, rollDaily, todayStr } from "../game/systems/daily";
import type { ChallengeId } from "../game/types";

function weakEngine(seed = 1): GameEngine {
  const st = createNewState(seed);
  st.meta.unlocks = ["skills"];
  st.combat.enemyHp = [1, 2]; // 10 HP
  st.combat.enemyMaxHp = [1, 2];
  return new GameEngine(st);
}

function kill(eng: GameEngine, n: number): void {
  for (let i = 0; i < n; i++) {
    const hp = toBig(eng.state.combat.enemyHp);
    if (hp.isZero()) break;
    eng.state.combat.enemyHp = hp.mul(toBig(0.1)).toTuple(); // 剩 10%
    eng.state.combat.enemyMaxHp = hp.toTuple();
    eng.click();
  }
}

describe("V9 内容：挑战模式 + 每日任务", () => {
  it("新状态初始化：每日 3 任务 + 挑战进度", () => {
    const eng = new GameEngine(createNewState(1));
    expect(eng.state.daily.date).toBeTruthy();
    expect(eng.state.daily.quests.length).toBe(3);
    expect(eng.state.meta.activeChallenge).toBeNull();
    for (const id of ["no_crit", "slow_universe", "poverty"] as ChallengeId[]) {
      expect(eng.state.challenges[id]).toBeDefined();
      expect(eng.state.challenges[id].claimed).toBe(false);
    }
  });

  it("挑战修饰符：无暴击 / 慢速宇宙 / 贫困", () => {
    const eng = weakEngine(2);
    eng.state.player.upgrades.critChance = 20; // 20%+5% = 25%
    eng.recomputeDerived();
    expect(eng.derived.critChance).toBeGreaterThan(0);
    eng.startChallenge("no_crit");
    expect(eng.derived.critChance).toBe(0);

    const slow = weakEngine(3);
    const aps = slow.derived.panelAps;
    slow.startChallenge("slow_universe");
    expect(slow.derived.panelAps).toBeCloseTo(aps * 0.5, 8);

    const poor = weakEngine(4);
    const gold = poor.derived.goldMult.toNumber();
    poor.startChallenge("poverty");
    expect(poor.derived.goldMult.toNumber()).toBeCloseTo(gold * 0.5, 8);
  });

  it("开启挑战重置本局（关卡/金币/升级）且不计重构次数", () => {
    const eng = weakEngine(5);
    eng.state.combat.stage = 300;
    eng.state.player.gold = [5, 20];
    eng.state.player.upgrades.attack = 40;
    eng.state.statistics.totalPrestiges = 3;
    eng.startChallenge("poverty");
    expect(eng.state.combat.stage).toBe(1);
    expect(toBig(eng.state.player.gold).toNumber()).toBe(0);
    expect(eng.state.player.upgrades.attack).toBe(0);
    expect(eng.state.statistics.totalPrestiges).toBe(3); // 不算重构
    expect(eng.state.meta.activeChallenge).toBe("poverty");
  });

  it("挑战进度随推关更新并可领取一次性奖励", () => {
    const eng = weakEngine(6);
    eng.startChallenge("poverty");
    kill(eng, 5);
    expect(eng.state.challenges.poverty.best).toBe(eng.state.combat.stage);
    eng.state.challenges.poverty.best = 200; // 直接达成目标
    eng.recomputeDerived();
    const coresBefore = toBig(eng.state.skills.cores).toNumber();
    const talentBefore = eng.state.talents.points;
    expect(eng.canClaimChallenge("poverty")).toBe(true);
    expect(eng.claimChallenge("poverty")).toBe(true);
    expect(toBig(eng.state.skills.cores).toNumber()).toBe(coresBefore + 5);
    expect(eng.state.talents.points).toBe(talentBefore + 1);
    expect(eng.claimChallenge("poverty")).toBe(false); // 只能领一次
  });

  it("每日任务进度：击杀 / Boss / 技能 / 金币 / 关卡", () => {
    const eng = weakEngine(7);
    eng.state.meta.unlocks = ["skills", "boss"];
    eng.state.daily.quests = [
      { id: "kill", type: "kills", target: 100, progress: 0, claimed: false },
      { id: "boss", type: "bossKills", target: 5, progress: 0, claimed: false },
      { id: "skill", type: "skillCasts", target: 10, progress: 0, claimed: false },
      { id: "gold", type: "gold", target: 8, progress: 0, claimed: false },
      { id: "stage", type: "stageReach", target: 150, progress: 0, claimed: false },
    ];
    const byType = (t: string) => eng.state.daily.quests.find((q) => q.type === t)!;

    kill(eng, 3);
    expect(byType("kills").progress).toBeGreaterThanOrEqual(3);
    expect(byType("stageReach").progress).toBe(eng.state.daily.bestStage);
    expect(byType("gold").progress).toBeGreaterThanOrEqual(0);

    // Boss 击杀
    const boss = new GameEngine(createNewState(8));
    boss.state.meta.unlocks = ["skills"];
    boss.state.daily.quests = [{ id: "boss", type: "bossKills", target: 5, progress: 0, claimed: false }];
    boss.state.combat.stage = 10;
    boss.state.combat.isBoss = true;
    boss.state.combat.enemyHp = [1, 2];
    boss.state.combat.enemyMaxHp = [1, 2];
    boss.state.combat.bossTimer = 30;
    kill(boss, 1);
    expect(boss.state.daily.quests[0].progress).toBe(1);

    // 技能施放
    const sk = weakEngine(9);
    sk.state.meta.unlocks = ["skills"];
    sk.state.daily.quests = [{ id: "skill", type: "skillCasts", target: 10, progress: 0, claimed: false }];
    sk.unlockSkill("overclock");
    sk.cast("overclock");
    expect(sk.state.daily.quests[0].progress).toBe(1);
  });

  it("每日任务领取奖励", () => {
    const eng = weakEngine(10);
    eng.state.daily.quests = [{ id: "kill", type: "kills", target: 10, progress: 10, claimed: false }];
    const coresBefore = toBig(eng.state.skills.cores).toNumber();
    expect(eng.claimDailyQuest(0)).toBe(true);
    expect(eng.state.daily.quests[0].claimed).toBe(true);
    expect(toBig(eng.state.skills.cores).toNumber()).toBeGreaterThan(coresBefore);
    expect(eng.claimDailyQuest(0)).toBe(false);
  });

  it("跨天重置每日任务", () => {
    const st = createNewState(11);
    const eng = new GameEngine(st);
    const oldDate = eng.state.daily.date;
    eng.state.daily.date = "2000-01-01";
    ensureDaily(eng.state, Date.now() + 1000);
    expect(eng.state.daily.date).not.toBe("2000-01-01");
    expect(eng.state.daily.date).toBe(todayStr(Date.now() + 1000));
    expect(eng.state.daily.quests.length).toBe(3);
    void oldDate;
  });

  it("rollDaily 生成 3 个不重复任务", () => {
    const d = rollDaily("2026-08-10", 12345);
    expect(d.quests.length).toBe(3);
    const ids = d.quests.map((q) => q.id);
    expect(new Set(ids).size).toBe(3);
    for (const q of d.quests) {
      expect(q.target).toBeGreaterThan(0);
      expect(q.progress).toBe(0);
      expect(q.claimed).toBe(false);
    }
  });

  it("normalize 兼容旧档（无 daily/challenges/activeChallenge）", () => {
    const s = normalizeState({});
    expect(s.daily.quests).toBeDefined();
    expect(s.challenges.no_crit).toBeDefined();
    expect(s.meta.activeChallenge).toBeNull();
  });
});