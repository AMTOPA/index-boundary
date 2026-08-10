import type { GameState } from "../types";
import { toBig } from "../bignum";

export type AchievementCheck =
  | { type: "damageMag"; mag: number }
  | { type: "goldMag"; mag: number }
  | { type: "kills"; n: number }
  | { type: "bossKills"; n: number }
  | { type: "crits"; n: number }
  | { type: "superCrits"; n: number }
  | { type: "clicks"; n: number }
  | { type: "prestiges"; n: number }
  | { type: "maxStage"; n: number }
  | { type: "enhance"; n: number }
  | { type: "combo"; n: number }
  | { type: "eliteKills"; n: number }
  | { type: "mimicKills"; n: number }
  | { type: "skillCasts"; n: number }
  | { type: "passiveLevel"; n: number }
  | { type: "leaps"; n: number }
  | { type: "firstBoss" }
  | { type: "firstPrestige" }
  | { type: "firstLeap" };

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  hidden?: boolean;
  check: AchievementCheck;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_crit", name: "初次暴击", desc: "触发第一次暴击", check: { type: "crits", n: 1 } },
  { id: "crit_100", name: "暴击百连", desc: "累计触发 100 次暴击", check: { type: "crits", n: 100 } },
  { id: "super_crit_1", name: "超越临界", desc: "触发第一次超暴击", check: { type: "superCrits", n: 1 } },
  { id: "super_crit_100", name: "临界风暴", desc: "累计触发 100 次超暴击", check: { type: "superCrits", n: 100 } },
  { id: "kill_10", name: "数据清除者", desc: "击败 10 个异常数据体", check: { type: "kills", n: 10 } },
  { id: "kill_100", name: "荒原猎手", desc: "击败 100 个异常数据体", check: { type: "kills", n: 100 } },
  { id: "kill_1000", name: "批量清理", desc: "击败 1000 个异常数据体", check: { type: "kills", n: 1000 } },
  { id: "kill_10000", name: "数据洪流", desc: "击败 10000 个异常数据体", check: { type: "kills", n: 10000 } },
  { id: "boss_1", name: "首杀 Boss", desc: "击败第一个 Boss", check: { type: "bossKills", n: 1 } },
  { id: "boss_10", name: "观测者试炼", desc: "击败 10 个 Boss", check: { type: "bossKills", n: 10 } },
  { id: "boss_50", name: "世界线稳定器", desc: "击败 50 个 Boss", check: { type: "bossKills", n: 50 } },
  { id: "click_100", name: "点击初体验", desc: "点击 100 次", check: { type: "clicks", n: 100 } },
  { id: "click_1000", name: "指尖观测者", desc: "点击 1000 次", check: { type: "clicks", n: 1000 } },
  { id: "combo_50", name: "连续观测", desc: "连击达到 50", check: { type: "combo", n: 50 } },
  { id: "combo_100", name: "极限连击", desc: "连击达到 100", check: { type: "combo", n: 100 } },
  { id: "stage_50", name: "深入荒原", desc: "到达第 50 关", check: { type: "maxStage", n: 50 } },
  { id: "stage_100", name: "荒原边界", desc: "到达第 100 关", check: { type: "maxStage", n: 100 } },
  { id: "stage_300", name: "数据风暴", desc: "到达第 300 关", check: { type: "maxStage", n: 300 } },
  { id: "stage_500", name: "机械城市", desc: "到达第 500 关", check: { type: "maxStage", n: 500 } },
  { id: "damage_1m", name: "百万伤害", desc: "累计伤害达到 1M", check: { type: "damageMag", mag: 6 } },
  { id: "damage_1b", name: "十亿伤害", desc: "累计伤害达到 1B", check: { type: "damageMag", mag: 9 } },
  { id: "damage_1e15", name: "星系级伤害", desc: "累计伤害达到 1e15", check: { type: "damageMag", mag: 15 } },
  { id: "damage_1e30", name: "宇宙级伤害", desc: "累计伤害达到 1e30", check: { type: "damageMag", mag: 30 } },
  { id: "gold_1m", name: "百万富翁", desc: "累计金币达到 1M", check: { type: "goldMag", mag: 6 } },
  { id: "gold_1e12", name: "万亿尘埃", desc: "累计金币达到 1T", check: { type: "goldMag", mag: 12 } },
  { id: "enhance_5", name: "强化入门", desc: "任意装备强化到 +5", check: { type: "enhance", n: 5 } },
  { id: "enhance_10", name: "满级强化", desc: "任意装备强化到 +10", check: { type: "enhance", n: 10 } },
  { id: "prestige_1", name: "首次坍缩", desc: "完成第一次重构", check: { type: "prestiges", n: 1 } },
  { id: "prestige_5", name: "宇宙更迭", desc: "完成 5 次重构", check: { type: "prestiges", n: 5 } },
  { id: "prestige_10", name: "坍缩大师", desc: "完成 10 次重构", check: { type: "prestiges", n: 10 }, hidden: true },
  { id: "elite_1", name: "精英猎手", desc: "击败 1 个精英怪", check: { type: "eliteKills", n: 1 } },
  { id: "elite_10", name: "清除精英", desc: "击败 10 个精英怪", check: { type: "eliteKills", n: 10 } },
  { id: "elite_50", name: "精英镇压者", desc: "击败 50 个精英怪", check: { type: "eliteKills", n: 50 } },
  { id: "elite_200", name: "秩序重构", desc: "击败 200 个精英怪", check: { type: "eliteKills", n: 200 } },
  { id: "mimic_1", name: "宝箱猎人", desc: "击败 1 个宝箱怪", check: { type: "mimicKills", n: 1 } },
  { id: "mimic_10", name: "数据小偷", desc: "击败 10 个宝箱怪", check: { type: "mimicKills", n: 10 } },
  { id: "mimic_50", name: "宝箱收割机", desc: "击败 50 个宝箱怪", check: { type: "mimicKills", n: 50 } },
  { id: "cast_50", name: "技能学徒", desc: "累计释放 50 次技能", check: { type: "skillCasts", n: 50 } },
  { id: "cast_500", name: "技能大师", desc: "累计释放 500 次技能", check: { type: "skillCasts", n: 500 } },
  { id: "cast_5000", name: "技能风暴", desc: "累计释放 5000 次技能", check: { type: "skillCasts", n: 5000 } },
  { id: "passive_10", name: "协议启动", desc: "任意被动技能达到 10 级", check: { type: "passiveLevel", n: 10 } },
  { id: "passive_25", name: "协议超载", desc: "任意被动技能达到 25 级", check: { type: "passiveLevel", n: 25 } },
  { id: "damage_1e45", name: "超星系级伤害", desc: "累计伤害达到 1e45", check: { type: "damageMag", mag: 45 } },
  { id: "damage_1e60", name: "维度级伤害", desc: "累计伤害达到 1e60", check: { type: "damageMag", mag: 60 } },
  { id: "damage_1e100", name: "法则级伤害", desc: "累计伤害达到 1e100", check: { type: "damageMag", mag: 100 } },
  { id: "damage_1e300", name: "奇点级伤害", desc: "累计伤害达到 1e300", check: { type: "damageMag", mag: 300 } },
  { id: "gold_1e15", name: "行星级财富", desc: "累计金币达到 1e15", check: { type: "goldMag", mag: 15 } },
  { id: "gold_1e30", name: "银河级财富", desc: "累计金币达到 1e30", check: { type: "goldMag", mag: 30 } },
  { id: "kill_100000", name: "数据屠夫", desc: "击败 100000 个异常数据体", check: { type: "kills", n: 100000 } },
  { id: "kill_1000000", name: "维度清理者", desc: "击败 1000000 个异常数据体", check: { type: "kills", n: 1000000 } },
  { id: "boss_100", name: "世界线猎手", desc: "击败 100 个 Boss", check: { type: "bossKills", n: 100 } },
  { id: "boss_200", name: "Boss 终结者", desc: "击败 200 个 Boss", check: { type: "bossKills", n: 200 } },
  { id: "boss_500", name: "观测者之王", desc: "击败 500 个 Boss", check: { type: "bossKills", n: 500 } },
  { id: "stage_1000", name: "恒星工厂", desc: "到达第 1000 关", check: { type: "maxStage", n: 1000 } },
  { id: "stage_2000", name: "黑洞边界", desc: "到达第 2000 关", check: { type: "maxStage", n: 2000 } },
  { id: "stage_10000", name: "边界之外", desc: "到达第 10000 关", check: { type: "maxStage", n: 10000 }, hidden: true },
  { id: "prestige_20", name: "坍缩循环", desc: "完成 20 次重构", check: { type: "prestiges", n: 20 } },
  { id: "prestige_50", name: "奇点循环者", desc: "完成 50 次重构", check: { type: "prestiges", n: 50 }, hidden: true },
  { id: "combo_200", name: "连击风暴", desc: "连击达到 200", check: { type: "combo", n: 200 } },
  { id: "combo_500", name: "无限连击", desc: "连击达到 500", check: { type: "combo", n: 500 } },
  { id: "stage_10000", name: "世界线边界", desc: "到达第 10000 关，触碰世界跃迁门槛", check: { type: "maxStage", n: 10000 } },
  { id: "leap_1", name: "首次跃迁", desc: "完成第一次世界跃迁", check: { type: "firstLeap" } },
  { id: "leap_5", name: "跨线旅者", desc: "完成 5 次世界跃迁", check: { type: "leaps", n: 5 } },
  { id: "leap_20", name: "法则编织者", desc: "完成 20 次世界跃迁", check: { type: "leaps", n: 20 }, hidden: true },
];

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export function checkAchievement(def: AchievementDef, state: GameState): boolean {
  const c = def.check;
  switch (c.type) {
    case "damageMag": return toBig(state.statistics.totalDamage).log10() >= c.mag;
    case "goldMag": return toBig(state.statistics.totalGold).log10() >= c.mag;
    case "kills": return state.statistics.totalKills >= c.n;
    case "bossKills": return state.statistics.totalBossKills >= c.n;
    case "crits": return state.statistics.totalCrits >= c.n;
    case "superCrits": return state.statistics.totalSuperCrits >= c.n;
    case "clicks": return state.statistics.totalClicks >= c.n;
    case "prestiges": return state.statistics.totalPrestiges >= c.n;
    case "maxStage": return state.statistics.allTimeMaxStage >= c.n;
    case "enhance": return Object.values(state.equipment.slots).some((e) => e && e.level >= c.n);
    case "combo": return state.combat.combo >= c.n;
    case "eliteKills": return state.statistics.totalEliteKills >= c.n;
    case "mimicKills": return state.statistics.totalMimicKills >= c.n;
    case "skillCasts": return state.statistics.totalSkillCasts >= c.n;
    case "passiveLevel": return Object.values(state.skills.passives).some((lv) => lv >= c.n);
    case "firstBoss": return state.statistics.totalBossKills >= 1;
    case "firstPrestige": return state.statistics.totalPrestiges >= 1;
    case "leaps": return (state.leap?.totalLeaps ?? 0) >= c.n;
    case "firstLeap": return (state.leap?.totalLeaps ?? 0) >= 1;
  }
}