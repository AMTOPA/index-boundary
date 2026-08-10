import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { toBig } from "../game/bignum";
import { CONFIG } from "../game/config";
import { normalizeState } from "../game/save";
import type { ChallengeId } from "../game/types";

function weakEngine(seed = 1): GameEngine {
  const st = createNewState(seed);
  st.meta.unlocks = ["skills"];
  st.combat.enemyHp = [1, 2]; // 10 HP
  st.combat.enemyMaxHp = [1, 2];
  return new GameEngine(st);
}

function unlockBase(eng: GameEngine): void {
  for (const id of CONFIG.SEASON.UNLOCK_CHALLENGES) {
    eng.state.challenges[id].claimed = true;
  }
}

function kill(eng: GameEngine, n: number): void {
  for (let i = 0; i < n; i++) {
    const hp = toBig(eng.state.combat.enemyHp);
    if (hp.isZero()) break;
    eng.state.combat.enemyHp = hp.mul(toBig(0.1)).toTuple();
    eng.state.combat.enemyMaxHp = hp.toTuple();
    eng.click();
  }
}

describe("V14 内容：试炼赛季（Roguelite 挑战赛季）", () => {
  it("新状态初始化：season 默认值 + activeModifiers 为空", () => {
    const eng = new GameEngine(createNewState(1));
    expect(eng.state.meta.activeModifiers).toEqual([]);
    expect(eng.state.season.unlocked).toBe(false);
    expect(eng.state.season.bestScore).toBe(0);
    expect(eng.state.season.bestStage).toBe(0);
    expect(eng.state.season.claimedTiers).toEqual([]);
    expect(eng.state.season.lastModifiers).toEqual([]);
    expect(eng.state.challenges.durable).toBeDefined();
    expect(eng.state.challenges.skill_slow).toBeDefined();
  });

  it("解锁：通关全部基础挑战后 isSeasonUnlocked 为 true", () => {
    const eng = weakEngine(2);
    expect(eng.isSeasonUnlocked()).toBe(false);
    eng.state.challenges.no_crit.claimed = true;
    expect(eng.isSeasonUnlocked()).toBe(false);
    eng.state.challenges.slow_universe.claimed = true;
    eng.state.challenges.poverty.claimed = true;
    expect(eng.isSeasonUnlocked()).toBe(true);
  });

  it("startSeason 校验：未解锁 / 空 / 重复 / 超数量 / 非法修饰符均拒绝", () => {
    const eng = weakEngine(3);
    expect(eng.startSeason(["no_crit"])).toBe(false); // 未解锁
    unlockBase(eng);
    expect(eng.startSeason([])).toBe(false);
    expect(eng.startSeason(["no_crit", "no_crit"])).toBe(false);
    expect(eng.startSeason(["no_crit", "slow_universe", "poverty", "durable"])).toBe(false);
    expect(eng.startSeason(["not_a_mod" as ChallengeId])).toBe(false);
    expect(eng.state.meta.activeModifiers).toEqual([]);
  });

  it("startSeason：重置本局并写入赛季状态（互斥单挑战）", () => {
    const eng = weakEngine(4);
    unlockBase(eng);
    eng.state.combat.stage = 300;
    eng.state.player.gold = [5, 20];
    eng.state.player.upgrades.attack = 40;
    eng.state.meta.activeChallenge = "no_crit";
    expect(eng.startSeason(["durable", "skill_slow"])).toBe(true);
    expect(eng.state.meta.activeChallenge).toBeNull();
    expect(eng.state.meta.activeModifiers).toEqual(["durable", "skill_slow"]);
    expect(eng.state.combat.stage).toBe(1);
    expect(toBig(eng.state.player.gold).toNumber()).toBe(0);
    expect(eng.state.player.upgrades.attack).toBe(0);
    expect(eng.state.season.unlocked).toBe(true);
    expect(eng.state.season.lastModifiers).toEqual(["durable", "skill_slow"]);
  });

  it("修饰符生效：顽石外壳敌人生命 ×2", () => {
    const a = weakEngine(5);
    const b = weakEngine(5);
    unlockBase(a);
    unlockBase(b);
    a.startSeason(["poverty"]); // 同种子 → 同敌人种类
    const hpBase = toBig(a.state.combat.enemyMaxHp);
    b.startSeason(["durable"]);
    expect(b.derived.enemyHpMult).toBe(2);
    expect(a.derived.enemyHpMult).toBe(1);
    expect(toBig(b.state.combat.enemyMaxHp).div(hpBase).toNumber()).toBeCloseTo(2, 6);
  });

  it("修饰符生效：技能迟滞冷却 ×2 / 叠加无暴击 + 慢速宇宙", () => {
    const sk = weakEngine(6);
    unlockBase(sk);
    const cdBefore = sk.derived.skillCdMult;
    sk.startSeason(["skill_slow"]);
    expect(sk.derived.skillCdMult).toBeCloseTo(cdBefore * 2, 8);

    const eng = weakEngine(7);
    unlockBase(eng);
    eng.startSeason(["no_crit", "slow_universe"]);
    eng.state.player.upgrades.critChance = 20;
    eng.state.player.upgrades.aspd = 10;
    eng.recomputeDerived();
    expect(eng.derived.critChance).toBe(0);

    const base = weakEngine(8);
    base.state.player.upgrades.aspd = 10;
    base.recomputeDerived();
    expect(eng.derived.panelAps).toBeCloseTo(base.derived.panelAps * 0.5, 8);
  });

  it("进度：赛季分 / 最佳关随推关更新，且计入对应基础挑战", () => {
    const eng = weakEngine(9);
    unlockBase(eng);
    expect(eng.startSeason(["poverty", "slow_universe"])).toBe(true);
    kill(eng, 3);
    const stage = eng.state.combat.stage;
    expect(stage).toBeGreaterThan(1);
    expect(eng.state.season.bestStage).toBe(stage);
    expect(eng.state.season.bestScore).toBe(eng.seasonScoreOf(stage, ["poverty", "slow_universe"]));
    expect(eng.state.season.bestScore).toBe(Math.floor(stage * (1 + 2 * CONFIG.SEASON.WEIGHT_PER_MODIFIER)));
    expect(eng.state.challenges.poverty.best).toBe(stage);
    expect(eng.state.challenges.slow_universe.best).toBe(stage);
    // 未选的修饰符不计入
    expect(eng.state.challenges.durable.best).toBe(0);
  });

  it("档位：按赛季分领取铜/银/金一次性奖励", () => {
    const eng = weakEngine(10);
    unlockBase(eng);
    expect(eng.canClaimSeasonTier("bronze")).toBe(false);
    eng.state.season.bestScore = CONFIG.SEASON.TIERS.gold.threshold;
    expect(eng.canClaimSeasonTier("bronze")).toBe(true);
    expect(eng.canClaimSeasonTier("silver")).toBe(true);
    expect(eng.canClaimSeasonTier("gold")).toBe(true);
    const coresBefore = toBig(eng.state.skills.cores).toNumber();
    const talentBefore = eng.state.talents.points;
    const shardsBefore = eng.state.laws.shards;
    expect(eng.claimSeasonTier("gold")).toBe(true);
    expect(eng.claimSeasonTier("gold")).toBe(false); // 只能领一次
    expect(toBig(eng.state.skills.cores).toNumber()).toBe(coresBefore + CONFIG.SEASON.TIERS.gold.rewardCores);
    expect(eng.state.talents.points).toBe(talentBefore + CONFIG.SEASON.TIERS.gold.rewardTalent);
    expect(eng.state.laws.shards).toBe(shardsBefore + CONFIG.SEASON.TIERS.gold.rewardShards);
    expect(eng.state.season.claimedTiers).toContain("gold");
  });

  it("互斥与停止：单挑战 ↔ 赛季互斥，stopSeason 清除修饰符", () => {
    const eng = weakEngine(11);
    unlockBase(eng);
    eng.startSeason(["no_crit"]);
    expect(eng.isSeasonRun()).toBe(true);
    eng.startChallenge("poverty");
    expect(eng.state.meta.activeModifiers).toEqual([]);
    expect(eng.state.meta.activeChallenge).toBe("poverty");
    eng.startSeason(["durable"]);
    expect(eng.state.meta.activeChallenge).toBeNull();
    expect(eng.state.meta.activeModifiers).toEqual(["durable"]);
    eng.stopSeason();
    expect(eng.state.meta.activeModifiers).toEqual([]);
    expect(eng.isSeasonRun()).toBe(false);
  });

  it("normalize 兼容旧档（无 season / activeModifiers）", () => {
    const s = normalizeState({ meta: { version: 2 } } as unknown);
    expect(s.season.bestScore).toBe(0);
    expect(s.season.bestStage).toBe(0);
    expect(s.season.claimedTiers).toEqual([]);
    expect(s.season.lastModifiers).toEqual([]);
    expect(s.meta.activeModifiers).toEqual([]);
    expect(s.meta.lastScoreSubmit.season).toBeUndefined();
  });
});