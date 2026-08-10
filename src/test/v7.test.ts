import { describe, it, expect } from "vitest";
import { GameEngine, createNewState } from "../game/engine";
import { toBig } from "../game/bignum";
import { SKILL_DEFS, SKILL_IDS } from "../game/data/skills";
import { enemyGold } from "../game/formulas";
import type { SkillId } from "../game/types";

function skillEngine(seed = 1, ids: SkillId[] = []): GameEngine {
  const st = createNewState(seed);
  st.meta.unlocks = ["skills"];
  st.combat.enemyHp = [1, 9];
  st.combat.enemyMaxHp = [1, 9];
  const eng = new GameEngine(st);
  for (const id of ids) eng.unlockSkill(id);
  return eng;
}

function bossEngine(seed = 1): GameEngine {
  const st = createNewState(seed);
  st.meta.unlocks = ["skills", "boss"];
  st.combat.stage = 10;
  st.combat.isBoss = true;
  st.combat.enemyHp = [1, 12];
  st.combat.enemyMaxHp = [1, 12];
  st.combat.bossTimer = 25;
  return new GameEngine(st);
}

describe("V7 内容：技能扩展（12 主动）", () => {
  it("注册 12 个主动技能且定义完整", () => {
    expect(SKILL_IDS.length).toBe(12);
    for (const id of SKILL_IDS) {
      expect(SKILL_DEFS[id]).toBeDefined();
      expect(SKILL_DEFS[id].name).toBeTruthy();
      expect(SKILL_DEFS[id].desc).toBeTruthy();
    }
  });

  it("新技能可解锁", () => {
    const eng = skillEngine(1, []);
    for (const id of ["emp_burst", "time_freeze", "overload_combo", "data_flood", "charged_hit", "split_matrix", "quantum_replay", "final_protocol"] as SkillId[]) {
      expect(eng.unlockSkill(id)).toBe(true);
    }
    expect(eng.state.skills.actives.length).toBe(8);
  });

  it("电磁脉冲：造成伤害且 Boss 剩余时间增加", () => {
    const eng = bossEngine();
    eng.unlockSkill("emp_burst");
    const hpBefore = toBig(eng.state.combat.enemyHp);
    eng.cast("emp_burst");
    const dmg = hpBefore.sub(toBig(eng.state.combat.enemyHp));
    expect(dmg.toNumber()).toBeGreaterThan(0);
    expect(eng.state.combat.bossTimer).toBeGreaterThan(25);
  });

  it("时空冻结：活跃期 Boss 计时暂停，攻速 ×1.5", () => {
    const frozen = bossEngine(1);
    frozen.unlockSkill("time_freeze");
    const apsBefore = frozen.derived.panelAps;
    frozen.cast("time_freeze");
    expect(frozen.derived.panelAps).toBeCloseTo(apsBefore * 1.5, 5);
    frozen.tick(1);
    expect(frozen.state.combat.bossTimer).toBe(25); // 冻结不流失

    const normal = bossEngine(2);
    normal.tick(1);
    expect(normal.state.combat.bossTimer).toBe(24); // 正常流失
  });

  it("过载连击：连击存在时伤害提升", () => {
    const mk = (useSkill: boolean) => {
      const eng = skillEngine(useSkill ? 3 : 4, ["overload_combo"]);
      eng.state.combat.combo = 10;
      if (useSkill) eng.cast("overload_combo");
      return eng.derived.damagePerHit.toNumber();
    };
    const plain = mk(false);
    const boosted = mk(true);
    expect(boosted).toBeGreaterThan(plain);
  });

  it("数据洪流：立即获得关卡金币 ×300×金币倍率", () => {
    const eng = skillEngine(5, ["data_flood"]);
    const goldBefore = toBig(eng.state.player.gold);
    const stageGold = enemyGold(eng.state.combat.stage);
    const goldMult = eng.derived.goldMult;
    eng.cast("data_flood");
    const gained = toBig(eng.state.player.gold).sub(goldBefore);
    expect(gained.toNumber()).toBeCloseTo(stageGold.mul(toBig(300)).mul(goldMult).toNumber(), 3);
  });

  it("充能一击：下一次攻击 ×250", () => {
    const eng = skillEngine(6, ["charged_hit"]);
    eng.cast("charged_hit");
    expect(eng.buffs.chargedHit.pending).toBe(true);
    const hpBefore = toBig(eng.state.combat.enemyHp);
    eng.click();
    expect(eng.buffs.chargedHit.pending).toBe(false);
    const dmg = hpBefore.sub(toBig(eng.state.combat.enemyHp));
    expect(dmg.toNumber()).toBeGreaterThan(eng.derived.damagePerHit.mul(toBig(245)).toNumber());
  });

  it("分裂矩阵：最终伤害 ×1.3", () => {
    const eng = skillEngine(7, ["split_matrix"]);
    const before = eng.derived.damagePerHit;
    eng.cast("split_matrix");
    expect(eng.derived.damagePerHit.toNumber()).toBeCloseTo(before.mul(toBig(1.3)).toNumber(), 3);
  });

  it("量子重演：其他技能冷却 -25 秒", () => {
    const eng = skillEngine(8, ["overclock", "emp_burst", "quantum_replay"]);
    eng.cast("overclock"); // cd 60
    eng.cast("emp_burst"); // cd 45
    eng.cast("quantum_replay");
    const oc = eng.state.skills.actives.find((s) => s.id === "overclock")!;
    const eb = eng.state.skills.actives.find((s) => s.id === "emp_burst")!;
    expect(oc.cdRemaining).toBeCloseTo(35, 5);
    expect(eb.cdRemaining).toBeCloseTo(20, 5);
  });

  it("终焉协议：攻击 ×3、金币 ×2、攻速 -50%", () => {
    const eng = skillEngine(9, ["final_protocol"]);
    const dmgBefore = eng.derived.damagePerHit;
    const goldBefore = eng.derived.goldMult;
    const apsBefore = eng.derived.panelAps;
    eng.cast("final_protocol");
    expect(eng.derived.damagePerHit.toNumber()).toBeCloseTo(dmgBefore.mul(toBig(3)).toNumber(), 3);
    expect(eng.derived.goldMult.toNumber()).toBeCloseTo(goldBefore.mul(toBig(2)).toNumber(), 3);
    expect(eng.derived.panelAps).toBeCloseTo(apsBefore * 0.5, 5);
  });
});