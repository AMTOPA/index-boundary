import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { Big, toBig } from "../game/bignum";
import { pickSpecialEnemy } from "../game/formulas";
import { CONFIG } from "../game/config";
import { normalizeState } from "../game/save";
import type { BossAffix, EnemyKind, EquipInstance, VoidTarget } from "../game/types";

// 构建处于 Boss 战（第 10 关）的引擎，血量固定 5000 以便控制字号
function bossEngine(
  seed: number,
  affixes: BossAffix[],
  opts: Partial<{ bossTimer: number; voidTarget: VoidTarget | null; shieldHits: number }> = {}
): GameEngine {
  const st = createNewState(seed);
  st.meta.unlocks = ["boss"];
  st.combat.stage = 10;
  st.combat.isBoss = true;
  st.combat.enemyHp = [5, 3];
  st.combat.enemyMaxHp = [5, 3];
  st.combat.bossTimer = opts.bossTimer ?? 25;
  st.combat.bossAffixes = affixes;
  st.combat.bossVoidTarget = opts.voidTarget ?? null;
  st.combat.bossShieldHits = opts.shieldHits ?? 0;
  return new GameEngine(st);
}

// 以 1 HP 敌人点击一次必杀（基础伤害 ≥ 10），用于验证奖励
function killCurrent(seed: number, kind: EnemyKind): GameEngine {
  const st = createNewState(seed);
  st.combat.stage = 1;
  st.combat.enemyKind = kind;
  st.combat.enemyHp = [1, 0]; // 1 HP
  st.combat.enemyMaxHp = [1, 0];
  const eng = new GameEngine(st);
  let kills = 0;
  eng.onEvent((ev) => { if (ev.type === "kill") kills++; });
  eng.click();
  expect(kills).toBe(1);
  return eng;
}

describe("V2 内容：特殊敌人生成判定", () => {
  const { MIMIC_CHANCE, ELITE_CHANCE } = CONFIG.SPECIAL_ENEMIES;
  it("宝箱怪 / 精英 / 普通 按 roll 分布", () => {
    expect(pickSpecialEnemy(0.01, false, false, MIMIC_CHANCE, ELITE_CHANCE)).toBe("mimic");
    expect(pickSpecialEnemy(MIMIC_CHANCE + 0.01, false, false, MIMIC_CHANCE, ELITE_CHANCE)).toBe("elite");
    expect(pickSpecialEnemy(0.9, false, false, MIMIC_CHANCE, ELITE_CHANCE)).toBe("normal");
  });
  it("Boss 关与极速推进只出普通怪", () => {
    expect(pickSpecialEnemy(0.01, true, false, MIMIC_CHANCE, ELITE_CHANCE)).toBe("normal");
    expect(pickSpecialEnemy(0.01, false, true, MIMIC_CHANCE, ELITE_CHANCE)).toBe("normal");
  });
});

describe("V2 内容：精英怪奖励", () => {
  it("金币 ×6 且必掉装备", () => {
    const e = killCurrent(3, "elite");
    const n = killCurrent(3, "normal");
    expect(e.state.statistics.totalEliteKills).toBe(1);
    expect(n.state.statistics.totalEliteKills).toBe(0);
    expect(e.state.equipment.inventory.length).toBeGreaterThanOrEqual(1);
    expect(toBig(e.state.player.gold).div(toBig(n.state.player.gold)).toNumber()).toBeCloseTo(
      CONFIG.SPECIAL_ENEMIES.ELITE_GOLD_MULT,
      5
    );
  });
  it("精英词缀生效（硬化减伤）", () => {
    const a = killCurrent(5, "elite");
    // 重新搭建：同种子精英，一个带硬化一个不带，比较单次伤害
    const mk = (affixes: BossAffix[]) => {
      const st = createNewState(5);
      st.combat.stage = 3;
      st.combat.enemyKind = "elite";
      st.combat.enemyHp = [5, 3];
      st.combat.enemyMaxHp = [5, 3];
      st.combat.bossAffixes = affixes;
      return new GameEngine(st);
    };
    const hard = mk(["harden"]);
    const plain = mk([]);
    hard.click();
    plain.click();
    const dmgHard = Big.fromTuple([5, 3]).sub(toBig(hard.state.combat.enemyHp));
    const dmgPlain = Big.fromTuple([5, 3]).sub(toBig(plain.state.combat.enemyHp));
    // 精英 bossTimer=-1 → elapsed=31 → 5 层硬化 → ×0.6
    expect(dmgHard.div(dmgPlain).toNumber()).toBeCloseTo(0.6, 1);
  });
});

describe("V2 内容：宝箱怪奖励", () => {
  it("金币 ×25 且必掉装备", () => {
    const m = killCurrent(9, "mimic");
    const n = killCurrent(9, "normal");
    expect(m.state.statistics.totalMimicKills).toBe(1);
    expect(m.state.equipment.inventory.length).toBeGreaterThanOrEqual(1);
    expect(toBig(m.state.player.gold).div(toBig(n.state.player.gold)).toNumber()).toBeCloseTo(
      CONFIG.SPECIAL_ENEMIES.MIMIC_GOLD_MULT,
      5
    );
  });
});

describe("V2 内容：Boss 词缀 能量盾", () => {
  it("前 20 次伤害固定为 1，第 21 次恢复正常", () => {
    const a = bossEngine(42, ["shield"], { shieldHits: 20 });
    const before = toBig(a.state.combat.enemyHp);
    for (let i = 0; i < 20; i++) a.click();
    const after = toBig(a.state.combat.enemyHp);
    expect(before.sub(after).toNumber()).toBeCloseTo(20, 5); // 20 次 × 1 伤害
    expect(a.state.combat.bossShieldHits).toBe(0);

    // 第 21 次与无盾对照同种子相同
    const a2 = bossEngine(42, ["shield"], { shieldHits: 20 });
    const b2 = bossEngine(42, [], {});
    for (let i = 0; i < 20; i++) { a2.click(); b2.click(); }
    const hpA = toBig(a2.state.combat.enemyHp);
    const hpB = toBig(b2.state.combat.enemyHp);
    a2.click(); b2.click();
    const dmgA = hpA.sub(toBig(a2.state.combat.enemyHp));
    const dmgB = hpB.sub(toBig(b2.state.combat.enemyHp));
    expect(dmgA.toNumber()).toBeCloseTo(dmgB.toNumber(), 5);
  });
});

describe("V2 内容：Boss 词缀 虚无", () => {
  it("免疫暴击乘区：临界打击不生效", () => {
    const a = bossEngine(7, ["void"], { voidTarget: "crit" });
    const b = bossEngine(7, [], {});
    a.buffs.criticalStrike.pending = true;
    b.buffs.criticalStrike.pending = true;
    a.click(); b.click();
    expect(a.state.combat.lastHitWasCrit).toBe(false);
    expect(b.state.combat.lastHitWasCrit).toBe(true);
    const dmgA = Big.fromTuple([5, 3]).sub(toBig(a.state.combat.enemyHp));
    const dmgB = Big.fromTuple([5, 3]).sub(toBig(b.state.combat.enemyHp));
    expect(dmgB.div(dmgA).toNumber()).toBeCloseTo(100, 1); // 临界打击 ×100 被免疫
  });

  it("免疫点击乘区：点击倍率被免疫", () => {
    const st = createNewState(11);
    st.meta.unlocks = ["boss"];
    st.combat.stage = 10;
    st.combat.isBoss = true;
    st.combat.enemyHp = [5, 3];
    st.combat.enemyMaxHp = [5, 3];
    st.combat.bossTimer = 25;
    st.combat.bossAffixes = ["void"];
    st.combat.bossVoidTarget = "click";
    const item: EquipInstance = {
      uid: "click1", slot: "charm", rarity: "rare", level: 0,
      main: { stat: "clickDmg", mult: 1 },
      affixes: [{ stat: "clickDmg", value: 1 }],
    };
    st.equipment.slots.charm = item;
    const eng = new GameEngine(st);
    eng.recomputeDerived();
    expect(eng.derived.clickMult.toNumber()).toBeCloseTo(2, 5);
    eng.click();
    const dmg = Big.fromTuple([5, 3]).sub(toBig(eng.state.combat.enemyHp));
    expect(dmg.toNumber()).toBeCloseTo(eng.derived.damagePerHit.toNumber(), 5); // 无 ×clickMult
  });

  it("免疫技能乘区：奇点炮不吃技能倍率", () => {
    const mk = (affixes: BossAffix[], vt: VoidTarget | null) => {
      const st = createNewState(13);
      st.meta.unlocks = ["boss", "skills"];
      st.combat.stage = 10;
      st.combat.isBoss = true;
      st.combat.enemyHp = [5, 5];
      st.combat.enemyMaxHp = [5, 5];
      st.combat.bossTimer = 25;
      st.combat.bossAffixes = affixes;
      st.combat.bossVoidTarget = vt;
      const item: EquipInstance = {
        uid: "skill1", slot: "charm", rarity: "rare", level: 0,
        main: { stat: "goldPct", mult: 1 },
        affixes: [{ stat: "skillDmg", value: 1 }],
      };
      st.equipment.slots.charm = item;
      const eng = new GameEngine(st);
      for (const id of ["overclock", "critical_strike", "gold_collapse", "singularity_cannon"] as const) {
        eng.unlockSkill(id);
      }
      eng.recomputeDerived();
      return eng;
    };
    const vSkill = mk(["void"], "skill");
    const none = mk([], null);
    expect(vSkill.derived.skillDmgMult.toNumber()).toBeCloseTo(2, 5);
    const hpBeforeV = toBig(vSkill.state.combat.enemyHp);
    const hpBeforeN = toBig(none.state.combat.enemyHp);
    vSkill.cast("singularity_cannon");
    none.cast("singularity_cannon");
    const dmgV = hpBeforeV.sub(toBig(vSkill.state.combat.enemyHp));
    const dmgN = hpBeforeN.sub(toBig(none.state.combat.enemyHp));
    // 无虚无的奇点炮含技能倍率 ×2；虚无免疫后不含
    expect(dmgN.div(dmgV).toNumber()).toBeCloseTo(2, 1);
  });

  it("免疫金币乘区：Boss 金币 -50%", () => {
    const mk = (vt: VoidTarget | null) => {
      const st = createNewState(17);
      st.meta.unlocks = ["boss"];
      st.combat.stage = 10;
      st.combat.isBoss = true;
      st.combat.enemyHp = [1, 1];
      st.combat.enemyMaxHp = [1, 1];
      st.combat.bossTimer = 25;
      st.combat.bossAffixes = ["void"];
      st.combat.bossVoidTarget = vt;
      return new GameEngine(st);
    };
    const vGold = mk("gold");
    const none = mk(null);
    vGold.click();
    none.click();
    expect(toBig(vGold.state.player.gold).div(toBig(none.state.player.gold)).toNumber()).toBeCloseTo(0.5, 5);
  });
});

describe("V2 内容：Boss 词缀 时空", () => {
  it("计时流速 ×1.5：Boss 计时器耗尽更快", () => {
    const a = bossEngine(21, ["time"], { bossTimer: 30 });
    const b = bossEngine(21, [], { bossTimer: 30 });
    a.tick(1);
    b.tick(1);
    expect(a.state.combat.bossTimer).toBeCloseTo(30 - CONFIG.BOSS_TIME_DRAIN_MULT, 5);
    expect(b.state.combat.bossTimer).toBeCloseTo(29, 5);
  });
});

describe("V2 内容：存档兼容", () => {
  it("旧存档缺少新字段时回退默认值", () => {
    const st = createNewState(1);
    const raw = JSON.parse(JSON.stringify(st)) as Record<string, any>;
    delete raw.combat.enemyKind;
    delete raw.combat.bossShieldHits;
    delete raw.combat.bossVoidTarget;
    delete raw.statistics.totalEliteKills;
    delete raw.statistics.totalMimicKills;
    const norm = normalizeState(raw);
    expect(norm.combat.enemyKind).toBe("normal");
    expect(norm.combat.bossShieldHits).toBe(0);
    expect(norm.combat.bossVoidTarget).toBeNull();
    expect(norm.statistics.totalEliteKills).toBe(0);
    expect(norm.statistics.totalMimicKills).toBe(0);
  });
});
