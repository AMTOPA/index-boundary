import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { CONFIG } from "../game/config";
import { leapShopCostFrom, leapCores, leapAllStatsMult, effectiveHpGrowth } from "../game/systems/leap";
import { enemyHp, bossHp, computeDerived, emptyBuffs } from "../game/formulas";
import { worldForStage } from "../game/data/worlds";
import { Big, toBig } from "../game/bignum";
import { normalizeState } from "../game/save";

function leapReadyState(seed = 1): GameState {
  const st = createNewState(seed);
  st.meta.unlocks.push("leap");
  st.combat.stage = CONFIG.LEAP.STAGE;
  st.statistics.allTimeMaxStage = CONFIG.LEAP.STAGE;
  st.player.upgrades.attack = 50;
  st.player.gold = [5, 40];
  return st;
}
type GameState = ReturnType<typeof createNewState>;

describe("V12 内容：世界跃迁（第二层）+ 世界核心 + 奇点天赋树", () => {
  it("首次跃迁获得 1+1=2 核心（最大关卡 ≥ 上次×2）", () => {
    const st = leapReadyState(2);
    const eng = new GameEngine(st);
    expect(eng.canLeap()).toBe(true);
    const r = eng.leap();
    expect(r).not.toBeNull();
    expect(r!.cores).toBe(2);
    expect(eng.state.leap.totalLeaps).toBe(1);
    expect(eng.state.leap.cores).toBe(2);
  });

  it("未解锁/未达关卡不可跃迁", () => {
    const st = createNewState(3);
    st.combat.stage = 5000;
    const eng = new GameEngine(st);
    expect(eng.canLeap()).toBe(false);
    expect(eng.leap()).toBeNull();
  });

  it("跃迁彻底洗牌：升级/金币/装备/技能/天赋/重构清零，保留统计/成就/世界核心", () => {
    const st = leapReadyState(4);
    st.meta.achievements = ["first_crit"];
    st.equipment.slots.weapon = { uid: "w1", slot: "weapon", rarity: "epic", level: 3, main: { stat: "atkPct", mult: 6 }, affixes: [] };
    st.skills.actives.push({ id: "overclock", level: 2, cdRemaining: 0, activeUntil: 0, active: false });
    st.talents.points = 10;
    st.talents.allocations.dest_sharp = 2;
    st.prestige.energy = 50;
    st.prestige.purchases.startPower = 3;
    const eng = new GameEngine(st);
    eng.leap();
    expect(eng.state.player.upgrades.attack).toBe(0);
    expect(toBig(eng.state.player.gold).isZero()).toBe(true);
    expect(eng.state.combat.stage).toBe(1);
    expect(Object.keys(eng.state.equipment.slots).length).toBe(0);
    expect(eng.state.equipment.inventory.length).toBe(0);
    expect(eng.state.skills.actives.length).toBe(0);
    expect(eng.state.talents.points).toBe(0);
    expect(Object.keys(eng.state.talents.allocations).length).toBe(0);
    expect(eng.state.prestige.energy).toBe(0);
    expect(Object.keys(eng.state.prestige.purchases).length).toBe(0);
    expect(eng.state.statistics.totalDamage[1]).toBe(0); // 保留统计（本局伤害已清零，总伤在测试中为 0）
    expect(eng.state.meta.achievements).toContain("first_crit");
    expect(eng.state.leap.cores).toBeGreaterThan(0);
  });

  it("startStage keeps stage x+1 aligned with all base upgrades at level x", () => {
    const st = leapReadyState(401);
    st.leap.purchases.startStage = 3;
    const eng = new GameEngine(st);
    eng.leap();
    expect(eng.state.combat.stage).toBe(301);
    expect(eng.state.player.upgrades).toEqual({
      attack: 300,
      aspd: 300,
      critChance: 300,
      critDamage: 300,
      gold: 300,
    });
  });

  it("世界核心商店价格 1/2/3/5/8/13（斐波那契）", () => {
    expect(leapShopCostFrom(0, "allStats")).toBe(1);
    expect(leapShopCostFrom(1, "allStats")).toBe(2);
    expect(leapShopCostFrom(2, "allStats")).toBe(3);
    expect(leapShopCostFrom(3, "allStats")).toBe(5);
    expect(leapShopCostFrom(4, "allStats")).toBe(8);
    expect(leapShopCostFrom(5, "allStats")).toBe(13);
  });

  it("购买世界核心升级扣减核心并生效", () => {
    const st = leapReadyState(5);
    const eng = new GameEngine(st);
    eng.leap(); // cores = 2
    expect(eng.buyLeapUpgrade("allStats")).toBe(true); // cost 1
    expect(eng.state.leap.cores).toBe(1);
    expect(eng.state.leap.purchases.allStats).toBe(1);
    expect(eng.buyLeapUpgrade("allStats")).toBe(false); // cost 2，剩 1 核心不足
    expect(eng.state.leap.purchases.allStats).toBe(1);
  });

  it("全属性每 3 级 ×2", () => {
    expect(leapAllStatsMult(0).toNumber()).toBe(1);
    expect(leapAllStatsMult(3).toNumber()).toBe(2);
    expect(leapAllStatsMult(6).toNumber()).toBe(4);
  });

  it("法则指数降低怪物 HP 成长基数（有界 -0.12）", () => {
    const st = leapReadyState(6);
    st.leap.purchases.lawExponent = 10;
    const growth = effectiveHpGrowth(st);
    expect(growth).toBeCloseTo(CONFIG.HP_GROWTH - 0.05, 5);
    const st2 = leapReadyState(7);
    st2.leap.purchases.lawExponent = 99; // 超上限
    expect(effectiveHpGrowth(st2)).toBeCloseTo(CONFIG.HP_GROWTH - 0.12, 5);
  });

  it("怪物 HP 与 Boss HP 随法则指数下降", () => {
    const st = leapReadyState(8);
    st.leap.purchases.lawExponent = 20; // -0.10
    const eng = new GameEngine(st);
    const d = eng.derived;
    const hpAt = enemyHp(500, d.hpGrowth);
    const hpBase = enemyHp(500);
    expect(hpAt.lt(hpBase)).toBe(true);
  });

  it("新世界升级解锁世界 5/6", () => {
    expect(worldForStage(20000, 0).id).toBe("black_hole");
    expect(worldForStage(20000, 1).id).toBe("singularity_furnace");
    expect(worldForStage(60000, 2).id).toBe("law_terminus");
  });

  it("全属性乘区进入派生属性", () => {
    const st = leapReadyState(9);
    st.leap.purchases.allStats = 6; // ×4
    const eng = new GameEngine(st);
    expect(eng.derived.leapGlobalMult.toNumber()).toBe(4);
  });

  it("奇点天赋：法则扭曲降低 HP 成长", () => {
    const st = leapReadyState(10);
    st.meta.unlocks.push("talents");
    st.talents.points = 6;
    const eng = new GameEngine(st);
    expect(eng.allocate("sing_law")).toBe(true);
    expect(eng.allocate("sing_law")).toBe(true);
    expect(eng.state.talents.allocations.sing_law).toBe(2);
    const d = eng.derived;
    expect(d.hpGrowth).toBeCloseTo(CONFIG.HP_GROWTH - 0.006, 5);
  });

  it("奇点天赋：深渊豪赌 Keystone 提高 Boss 生命与金币倍率", () => {
    const st = leapReadyState(11);
    st.meta.unlocks.push("talents");
    st.talents.points = 40;
    const eng = new GameEngine(st);
    // 前置链：sing_law -> sing_skill_cd, sing_cap -> sing_overflow（点满），然后 keystone
    eng.allocate("sing_law"); eng.allocate("sing_law"); eng.allocate("sing_law");
    eng.allocate("sing_cap"); eng.allocate("sing_cap"); eng.allocate("sing_cap");
    eng.allocate("sing_skill_cd"); eng.allocate("sing_skill_cd"); eng.allocate("sing_skill_cd");
    eng.allocate("sing_overflow"); eng.allocate("sing_overflow"); eng.allocate("sing_overflow");
    expect(eng.allocate("sing_keystone_boss")).toBe(true);
    const d = eng.derived;
    expect(d.bossHpMult.toNumber()).toBe(2);
    expect(d.bossGoldMult.toNumber()).toBe(6);
  });

  it("奇点天赋：财富引力将当前金币数量级转为伤害", () => {
    const st = leapReadyState(12);
    st.meta.unlocks.push("talents");
    st.talents.points = 40;
    st.player.gold = [1, 30]; // 1e30 -> 30 个数量级
    const eng = new GameEngine(st);
    eng.allocate("sing_law"); eng.allocate("sing_law"); eng.allocate("sing_law");
    eng.allocate("sing_cap"); eng.allocate("sing_cap"); eng.allocate("sing_cap");
    eng.allocate("sing_skill_cd"); eng.allocate("sing_skill_cd"); eng.allocate("sing_skill_cd");
    eng.allocate("sing_overflow"); eng.allocate("sing_overflow"); eng.allocate("sing_overflow");
    expect(eng.allocate("sing_keystone_gold")).toBe(true);
    const d = eng.derived;
    expect(d.globalMult.gt(Big.fromNumber(1))).toBe(true);
  });

  it("repairs legacy leap saves with zero base upgrades", () => {
    const raw = createNewState(77);
    raw.leap.totalLeaps = 1;
    raw.leap.purchases.startStage = 3;
    raw.combat.stage = 301;
    raw.player.upgrades = { attack: 0, aspd: 0, critChance: 0, critDamage: 0, gold: 0 };

    const normalized = normalizeState(raw);
    expect(normalized.combat.stage).toBe(301);
    expect(Object.values(normalized.player.upgrades)).toEqual([300, 300, 300, 300, 300]);
  });

  it("normalize 旧档补齐 leap 字段", () => {
    const s = normalizeState({});
    expect(s.leap).toBeDefined();
    expect(s.leap.cores).toBe(0);
    expect(s.leap.totalLeaps).toBe(0);
  });

  it("自动跃迁：购买后卡墙自动跃迁", () => {
    const st = leapReadyState(13);
    const eng = new GameEngine(st);
    eng.leap(); // cores=2
    eng.buyLeapUpgrade("autoLeap"); // cost 1 -> cores 剩 1
    expect(eng.state.leap.purchases.autoLeap).toBe(1);
    // 重新到达跃迁阈值
    eng.state.combat.stage = CONFIG.LEAP.STAGE;
    eng.state.statistics.allTimeMaxStage = CONFIG.LEAP.STAGE;
    // 让击杀时间超墙：降低 DPS 模拟卡墙
    eng.state.combat.enemyHp = [1, 60]; // 1e60
    const before = eng.state.leap.totalLeaps;
    eng.tick(1 / CONFIG.TICK_RATE);
    eng.tick(1 / CONFIG.TICK_RATE);
    expect(eng.state.leap.totalLeaps).toBeGreaterThan(before);
  });
});
