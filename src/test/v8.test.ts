import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { toBig } from "../game/bignum";
import { PASSIVE_DEFS, PASSIVE_IDS, passiveCoreCost } from "../game/data/skills";
import { checkAchievement, ACHIEVEMENTS, achievementById } from "../game/data/achievements";
import { migrateState, normalizeState } from "../game/save";
import type { EquipInstance, PassiveId, SkillId } from "../game/types";

function skillEngine(seed = 1, ids: SkillId[] = []): GameEngine {
  const st = createNewState(seed);
  st.meta.unlocks = ["skills"];
  st.combat.enemyHp = [1, 9];
  st.combat.enemyMaxHp = [1, 9];
  const eng = new GameEngine(st);
  for (const id of ids) eng.unlockSkill(id);
  return eng;
}

describe("V8 内容：被动技能 + 技能联动词条 + 成就补全", () => {
  it("被动技能注册与核心升级", () => {
    expect(PASSIVE_IDS.length).toBe(3);
    for (const id of PASSIVE_IDS) {
      expect(PASSIVE_DEFS[id]).toBeDefined();
      expect(PASSIVE_DEFS[id].effectPerLevel).toBeGreaterThan(0);
    }
    const eng = skillEngine(1);
    eng.state.skills.cores = toBig(100).toTuple();
    expect(eng.canUpgradePassive("rhythm")).toBe(true);
    expect(eng.upgradePassive("rhythm")).toBe(true);
    expect(eng.state.skills.passives.rhythm).toBe(1);
    expect(eng.upgradePassive("focus")).toBe(true);
    expect(eng.upgradePassive("greed")).toBe(true);
    expect(eng.state.skills.passives.focus).toBe(1);
    expect(eng.state.skills.passives.greed).toBe(1);
  });

  it("被动效果进入派生属性：节律攻速 / 聚能暴击 / 贪婪金币", () => {
    const eng = skillEngine(2);
    const before = { aps: eng.derived.panelAps, crit: eng.derived.critChance, gold: eng.derived.goldMult.toNumber() };
    eng.state.skills.passives = { rhythm: 10, focus: 10, greed: 10 };
    eng.recomputeDerived();
    expect(eng.derived.panelAps).toBeCloseTo(before.aps * (1 + 10 * PASSIVE_DEFS.rhythm.effectPerLevel), 5);
    expect(eng.derived.critChance).toBeCloseTo(before.crit + 10 * PASSIVE_DEFS.focus.effectPerLevel, 8);
    expect(eng.derived.goldMult.toNumber()).toBeCloseTo(before.gold * (1 + 10 * PASSIVE_DEFS.greed.effectPerLevel / (1 + before.gold - 1)), 5);
  });

  it("技能冷却/持续时间词条生效", () => {
    const eng = skillEngine(3, ["time_freeze", "overclock"]);
    const item: EquipInstance = {
      uid: "eq_test_1",
      slot: "module",
      rarity: "rare",
      level: 0,
      main: { stat: "skillDmg", mult: 1 },
      affixes: [
        { stat: "skillCd", value: 0.2 },
        { stat: "skillDuration", value: 0.25 },
      ],
    };
    eng.state.equipment.slots.module = item;
    eng.recomputeDerived();
    expect(eng.derived.skillCdMult).toBeCloseTo(0.8, 8);
    expect(eng.derived.skillDurationMult).toBeCloseTo(1.25, 8);

    eng.cast("overclock");
    const inst = eng.state.skills.actives.find((s) => s.id === "overclock")!;
    const baseCd = 60;
    expect(inst.cdRemaining).toBeCloseTo(baseCd * 0.8, 5);
    expect(inst.activeUntil).toBeCloseTo(10 * 1.25, 5); // 持续时间延长
  });

  it("技能施放统计 totalSkillCasts", () => {
    const eng = skillEngine(4, ["overclock"]);
    eng.state.skills.actives[0].cdRemaining = 0;
    eng.cast("overclock");
    expect(eng.state.statistics.totalSkillCasts).toBe(1);
  });

  it("新增成就判定：技能施放/被动等级/精英/宝箱怪", () => {
    const st = createNewState(5);
    st.statistics.totalSkillCasts = 60;
    const cast = achievementById("cast_50")!;
    expect(checkAchievement(cast, st)).toBe(true);

    st.skills.passives = { rhythm: 10, focus: 0, greed: 0 };
    const passive = achievementById("passive_10")!;
    expect(checkAchievement(passive, st)).toBe(true);

    st.statistics.totalEliteKills = 1;
    st.statistics.totalMimicKills = 1;
    expect(checkAchievement(achievementById("elite_1")!, st)).toBe(true);
    expect(checkAchievement(achievementById("mimic_1")!, st)).toBe(true);

    st.statistics.totalDamage = [1, 46];
    expect(checkAchievement(achievementById("damage_1e45")!, st)).toBe(true);
  });

  it("数量级成就补全注册", () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(50);
    for (const id of ["damage_1e100", "damage_1e300", "gold_1e30", "kill_1000000", "stage_10000", "prestige_50", "combo_500"]) {
      expect(achievementById(id)).toBeDefined();
    }
  });

  it("存档迁移 v1→v2：passiveLevel → passives.rhythm", () => {
    const raw = { skills: { passiveLevel: 7 } } as Record<string, unknown>;
    const out = migrateState(raw, 1);
    const skills = (out as any).skills;
    expect(skills.passives.rhythm).toBe(7);
    expect(skills.passives.focus).toBe(0);
    expect(skills.passives.greed).toBe(0);
    expect(skills.passiveLevel).toBeUndefined();
    const norm = normalizeState(out);
    expect(norm.skills.passives.rhythm).toBe(7);
    expect(norm.statistics.totalSkillCasts).toBe(0);
  });

  it("被动技能核心成本曲线存在", () => {
    expect(passiveCoreCost(0)).toBe(1);
    expect(passiveCoreCost(4)).toBeGreaterThan(1);
  });
});