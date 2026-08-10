import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { CONFIG } from "../game/config";
import { lawShards, lawShopCostFrom, lawCritExp, lawGoldExp, lawApsCapAdd, lawGoldToDmgMult, canRewriteLaw } from "../game/systems/law";
import { enemyGold, computeDerived, emptyBuffs, effectiveAps } from "../game/formulas";
import { Big, toBig } from "../game/bignum";
import { normalizeState } from "../game/save";

type GameState = ReturnType<typeof createNewState>;

function lawReadyState(seed = 1): GameState {
  const st = createNewState(seed);
  st.meta.unlocks.push("lawRewrite");
  st.combat.stage = CONFIG.LAWS.REWRITE_STAGE;
  st.statistics.allTimeMaxStage = CONFIG.LAWS.REWRITE_STAGE;
  st.player.upgrades.attack = 50;
  st.player.gold = [5, 40];
  return st;
}

describe("V13 内容：法则重写（第三层）+ 法则碎片 + 公式补丁", () => {
  it("未解锁/未达关卡不可重写", () => {
    const st = createNewState(2);
    st.combat.stage = 20000;
    expect(canRewriteLaw(st)).toBe(false);
    const eng = new GameEngine(st);
    expect(eng.rewriteLaw()).toBeNull();
  });

  it("30000 关可重写，首次获得 2 碎片（1+翻倍）", () => {
    const st = lawReadyState(3);
    const eng = new GameEngine(st);
    expect(eng.canRewriteLaw()).toBe(true);
    const r = eng.rewriteLaw();
    expect(r).not.toBeNull();
    expect(r!.shards).toBe(2);
    expect(eng.state.laws.totalRewrites).toBe(1);
    expect(eng.state.laws.shards).toBe(2);
  });

  it("重写彻底洗牌：重置升级/金币/装备/技能/天赋/重构/跃迁已购升级，保留核心/统计/成就/碎片", () => {
    const st = lawReadyState(4);
    st.meta.achievements = ["first_crit"];
    st.equipment.slots.weapon = { uid: "w1", slot: "weapon", rarity: "epic", level: 3, main: { stat: "atkPct", mult: 6 }, affixes: [] };
    st.skills.actives.push({ id: "overclock", level: 2, cdRemaining: 0, activeUntil: 0, active: false });
    st.talents.points = 10;
    st.talents.allocations.dest_sharp = 2;
    st.prestige.energy = 50;
    st.prestige.purchases.startPower = 3;
    st.leap.cores = 7;
    st.leap.purchases.allStats = 3;
    st.leap.purchases.newWorld = 1;
    st.laws.shards = 5;
    const eng = new GameEngine(st);
    eng.rewriteLaw();
    expect(eng.state.player.upgrades.attack).toBe(0);
    expect(toBig(eng.state.player.gold).isZero()).toBe(true);
    expect(eng.state.combat.stage).toBe(1);
    expect(Object.keys(eng.state.equipment.slots).length).toBe(0);
    expect(eng.state.skills.actives.length).toBe(0);
    expect(eng.state.talents.points).toBe(0);
    expect(eng.state.prestige.energy).toBe(0);
    expect(Object.keys(eng.state.leap.purchases).length).toBe(0);
    expect(eng.state.leap.cores).toBe(7); // 未花费核心保留
    expect(eng.state.statistics.totalDamage).toEqual(st.statistics.totalDamage); // 统计保留
    expect(eng.state.meta.achievements).toContain("first_crit");
    expect(eng.state.laws.shards).toBe(5 + 2); // 碎片保留 + 新获得
    expect(eng.state.laws.totalShardsEarned).toBe(2);
  });

  it("碎片公式：50000 → 3，100000 → 8（翻倍前）", () => {
    const st = createNewState(5);
    st.statistics.allTimeMaxStage = 50000;
    st.laws.lastRewriteMaxStage = 100000;
    expect(lawShards(st)).toBe(3); // 不翻倍
    st.statistics.allTimeMaxStage = 100000;
    st.laws.lastRewriteMaxStage = 60000; // 100000 < 120000 → 不翻倍
    expect(lawShards(st)).toBe(8);
  });

  it("补丁价格：costBase=1 → 1/2/3/5/8/13（斐波那契），goldToDmg 固定 3", () => {
    expect(lawShopCostFrom(0, "critExp")).toBe(1);
    expect(lawShopCostFrom(1, "critExp")).toBe(2);
    expect(lawShopCostFrom(2, "critExp")).toBe(3);
    expect(lawShopCostFrom(3, "critExp")).toBe(5);
    expect(lawShopCostFrom(4, "critExp")).toBe(8);
    expect(lawShopCostFrom(5, "critExp")).toBe(13);
    expect(lawShopCostFrom(0, "goldToDmg")).toBe(3);
  });

  it("补丁有硬上限：critExp max 6 → 指数 1.3；超上限不可再买", () => {
    const st = lawReadyState(6);
    st.laws.shards = 100;
    const eng = new GameEngine(st);
    for (let i = 0; i < 6; i++) expect(eng.buyLawPatch("critExp")).toBe(true);
    expect(eng.state.laws.purchases.critExp).toBe(6);
    expect(eng.buyLawPatch("critExp")).toBe(false);
    expect(lawCritExp(eng.state)).toBeCloseTo(1.3, 5);
  });

  it("暴击指数生效：critExp Lv1 → critDamage = 2^1.05", () => {
    const st = lawReadyState(7);
    st.laws.purchases.critExp = 1;
    const d = computeDerived(st, emptyBuffs(), 0);
    expect(d.critDamage).toBeCloseTo(Math.pow(2, 1.05), 6);
  });

  it("金币指数：0.92 → 0.93@Lv1，上限 0.98；enemyGold 使用生效指数", () => {
    const st = lawReadyState(8);
    st.laws.purchases.goldExp = 1;
    expect(lawGoldExp(st)).toBeCloseTo(0.93, 5);
    const g = enemyGold(10, CONFIG.HP_GROWTH, lawGoldExp(st));
    const base = enemyGold(10, CONFIG.HP_GROWTH, 0.92);
    expect(g.gt(base)).toBe(true);
    st.laws.purchases.goldExp = 99;
    expect(lawGoldExp(st)).toBeCloseTo(0.98, 5);
  });

  it("攻速破限：软上限 10 → 12@Lv2，面板高于上限时有效攻速提升", () => {
    const st = lawReadyState(9);
    st.laws.purchases.apsCap = 2;
    expect(lawApsCapAdd(st)).toBe(2);
    const base = effectiveAps(30);
    const lawed = effectiveAps(30, 2);
    expect(lawed).toBeGreaterThan(base);
    const d = computeDerived(st, emptyBuffs(), 0);
    expect(d.effectiveAps).toBe(effectiveAps(d.panelAps, 2));
  });

  it("金币转伤：未购买 → ×1；购买后金币每高 10 倍（≥10^12）→ ×1.1，有界", () => {
    const st = createNewState(10);
    expect(lawGoldToDmgMult(st).eq(Big.ONE)).toBe(true);
    st.laws.purchases.goldToDmg = 1;
    st.player.gold = [1, 12]; // 10^12
    expect(lawGoldToDmgMult(st).toNumber()).toBeCloseTo(1, 6);
    st.player.gold = [1, 13];
    expect(lawGoldToDmgMult(st).toNumber()).toBeCloseTo(1.1, 6);
    st.player.gold = [1, 72];
    expect(lawGoldToDmgMult(st).toNumber()).toBeCloseTo(Math.pow(1.1, 60), 6);
    const d = computeDerived(st, emptyBuffs(), 0);
    expect(d.goldToDmgMult.toNumber()).toBeCloseTo(Math.pow(1.1, 60), 6);
  });

  it("金币转伤计入单次伤害（独立乘区）", () => {
    const st = lawReadyState(11);
    st.player.gold = [1, 14];
    const d0 = computeDerived(st, emptyBuffs(), 0);
    st.laws.purchases.goldToDmg = 1;
    const d1 = computeDerived(st, emptyBuffs(), 0);
    expect(d1.damagePerHit.gt(d0.damagePerHit)).toBe(true);
  });

  it("normalizeState 为旧存档补齐 laws", () => {
    const raw = createNewState(12);
    const json = JSON.parse(JSON.stringify(raw));
    delete json.laws;
    const norm = normalizeState(json);
    expect(norm.laws).toBeDefined();
    expect(norm.laws.shards).toBe(0);
    expect(norm.laws.purchases).toEqual({});
  });

  it("重写后 goldHpExp 进入派生属性，供引擎金币结算使用", () => {
    const st = lawReadyState(13);
    st.laws.purchases.goldExp = 2;
    const d = computeDerived(st, emptyBuffs(), 0);
    expect(d.goldHpExp).toBeCloseTo(0.94, 5);
  });
});
