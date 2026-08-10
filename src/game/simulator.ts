// 自动玩家模拟器：headless 运行引擎，模拟理性玩家的购买/技能/装备/天赋/重构决策。
// 用于 /dev/balance 页面与 scripts/balance.ts、scripts/smoke.ts（不依赖 DOM，可 Node 运行）。
import { GameEngine, createNewState } from "./engine";
import { Big, toBig } from "./bignum";
import { CONFIG } from "./config";
import { SKILL_IDS, SKILL_DEFS } from "./data/skills";
import { TALENT_NODES } from "./data/talents";
import type { EquipInstance } from "./types";

export type SimStrategy = "equal" | "attack" | "gold" | "crit" | "aspd";

export interface SimOptions {
  hours?: number;
  seed?: number;
  strategy?: SimStrategy;
  wallPrestigeSec?: number;
}

export interface SimResult {
  strategy: SimStrategy;
  hours: number;
  stage: number;
  maxStage: number;
  dps: Big;
  gold: Big;
  totalDamageMag: number;
  kills: number;
  bossKills: number;
  prestiges: number;
  energy: number;
  firstPrestigeAt: number; // 秒；未重构为 -1
  timeTo100: number;
  timeTo300: number;
  timeTo400: number;
  timeTo500: number;
  firstPrestigeStage: number; // 首次重构时的关卡
  reclearTime: number; // 首次重构后重新打到重构前最高关卡的耗时（秒，-1 未达到）
  killTimeSamples: { t: number; stage: number; killTime: number }[]; // 击杀时间曲线采样（每 30s）
}

// 天赋分配优先级（理性玩家近似：先伤害，后自动化；按构筑流派差异化）
const TALENT_PRIORITY: Record<SimStrategy, string[]> = {
  equal: [
    "dest_sharp", "dest_crit", "auto_beat", "dest_super", "dest_hunter",
    "auto_offline", "auto_break", "auto_skip", "dest_keystone_absolute",
    "greed_loot", "greed_luck", "greed_pan", "greed_refine", "greed_keystone_compound",
  ],
  attack: [
    "dest_sharp", "dest_crit", "dest_super", "dest_hunter", "dest_keystone_absolute",
    "auto_offline", "auto_skip", "greed_loot",
  ],
  gold: [
    "greed_loot", "greed_pan", "greed_refine", "greed_keystone_compound",
    "dest_sharp", "auto_offline", "auto_skip",
  ],
  // 暴击流：暴击再暴击 Keystone 为核心
  crit: [
    "dest_crit", "dest_sharp", "dest_super", "dest_hunter", "dest_keystone_critagain",
    "greed_loot", "auto_offline", "auto_skip",
  ],
  // 攻速流：永动协议 Keystone 为核心（攻速→伤害）
  aspd: [
    "auto_beat", "auto_break", "auto_offline", "auto_skip", "auto_keystone_perpetual",
    "dest_sharp", "dest_crit", "greed_loot",
  ],
};

function itemScore(item: EquipInstance): number {
  return item.main.mult * (1 + item.level * 0.15) * (1 + item.affixes.length * 0.1);
}

function autoEquip(eng: GameEngine): void {
  const inv = eng.state.equipment.inventory;
  const slots = eng.state.equipment.slots;
  for (const item of inv) {
    const cur = slots[item.slot];
    if (!cur || itemScore(item) > itemScore(cur)) {
      eng.equipItem(item.uid);
    }
  }
}

// 非退化策略：攻击优先 = 重攻击轻经济；金币优先 = 重经济保基础攻击；暴击/攻速 = 流派构筑
function buyStrategy(eng: GameEngine, strategy: SimStrategy): void {
  if (strategy === "equal") {
    // 活跃玩家的“自动升级+手动连点”：每个 0.5s 周期内尽量购买收益最高的升级
    for (let k = 0; k < 30 && eng.smartBuy(); k++) { /* keep buying */ }
  } else if (strategy === "attack") {
    eng.buyUpgradeTimes("attack", 20);
    eng.buyUpgradeTimes("aspd", 5);
    eng.buyUpgradeTimes("gold", 8);
    eng.buyUpgradeTimes("critDamage", 3);
  } else if (strategy === "gold") {
    eng.buyUpgradeTimes("gold", 10);
    eng.buyUpgradeTimes("attack", 12);
    eng.buyUpgradeTimes("aspd", 3);
  } else if (strategy === "crit") {
    eng.buyUpgradeTimes("attack", 12);
    eng.buyUpgradeTimes("critChance", 12);
    eng.buyUpgradeTimes("critDamage", 10);
    eng.buyUpgradeTimes("aspd", 3);
    eng.buyUpgradeTimes("gold", 5);
  } else {
    eng.buyUpgradeTimes("aspd", 16);
    eng.buyUpgradeTimes("attack", 12);
    eng.buyUpgradeTimes("gold", 5);
    eng.buyUpgradeTimes("critDamage", 3);
  }
}

function allocateTalents(eng: GameEngine, strategy: SimStrategy): void {
  let guard = 0;
  while (eng.state.talents.points > 0 && guard < 50) {
    guard += 1;
    let spent = false;
    for (const id of TALENT_PRIORITY[strategy]) {
      if (eng.state.talents.points <= 0) break;
      if (eng.canAllocate(id) && eng.allocate(id)) { spent = true; break; }
    }
    if (!spent) break;
  }
}

function unlockSkills(eng: GameEngine): void {
  if (!eng.isUnlocked("skills")) return;
  for (const id of SKILL_IDS) {
    if (!eng.state.skills.actives.some((s) => s.id === id)) eng.unlockSkill(id);
  }
}

function castReadySkills(eng: GameEngine): void {
  const c = eng.state.combat;
  const boss = c.isBoss;
  const hp = toBig(c.enemyHp);
  const dps = eng.derived.dps;
  const killTime = hp.isZero() || dps.isZero() ? 0 : hp.div(dps).toNumber();
  const walled = Number.isFinite(killTime) && killTime > CONFIG.SKILL_CAST_WALL_SEC;
  for (const id of SKILL_IDS) {
    const inst = eng.state.skills.actives.find((s) => s.id === id);
    if (!inst || inst.cdRemaining > 0 || inst.active) continue;
    // 持续增益类随时保持；瞬时爆发类只在 Boss 战/卡墙时释放（模拟理性玩家）
    const isBurst = SKILL_DEFS[id].duration === 0;
    if (isBurst && !(boss || walled)) continue;
    eng.cast(id);
  }
}

export function runAutoPlayer(opts: SimOptions = {}): SimResult {
  const hours = opts.hours ?? 1;
  const seed = opts.seed ?? 20260809;
  const strategy = opts.strategy ?? "equal";
  const wallSec = opts.wallPrestigeSec ?? 15;

  const eng = new GameEngine(createNewState(seed));
  const dt = 1 / CONFIG.TICK_RATE;
  const ticks = Math.floor((hours * 3600) / dt);

  let buy = 0;
  let lastStage = eng.state.combat.stage;
  let lastStageChange = 0;
  let firstPrestigeAt = -1;
  let timeTo100 = -1, timeTo300 = -1, timeTo400 = -1, timeTo500 = -1;
  let firstPrestigeStage = -1;
  let reclearAt = -1;
  let sawPrestige = false;
  const killTimeSamples: { t: number; stage: number; killTime: number }[] = [];

  for (let i = 0; i < ticks; i++) {
    eng.tick(dt);
    const stage = eng.state.combat.stage;
    if (stage !== lastStage) { lastStage = stage; lastStageChange = eng.timeSec; }
    if (stage < 5 || eng.state.combat.isBoss) eng.click();
    else if (i % 30 === 0) eng.click();
    if (stage === 100 && timeTo100 < 0) timeTo100 = eng.timeSec;
    if (stage >= 300 && timeTo300 < 0) timeTo300 = eng.timeSec;
    if (stage >= 400 && timeTo400 < 0) timeTo400 = eng.timeSec;
    if (stage >= 500 && timeTo500 < 0) timeTo500 = eng.timeSec;

    buy++;
    if (buy >= 10) {
      buy = 0;
      buyStrategy(eng, strategy);
      unlockSkills(eng);
      castReadySkills(eng);
      allocateTalents(eng, strategy);
      if (i % 50 === 0) autoEquip(eng);
      // 重推检测（每 0.5s）：重构后回到首次重构时的关卡即记录耗时
      if (sawPrestige && reclearAt < 0 && eng.state.combat.stage >= firstPrestigeStage) {
        reclearAt = eng.timeSec;
      }
      // 理性玩家：只在（接近）历史最高关卡的墙上重构，避免在旧进度下方反复重置
      const nearMax = stage >= eng.state.statistics.allTimeMaxStage;
      if (eng.canPrestige() && nearMax && eng.timeSec - lastStageChange > wallSec) {
        const r = eng.prestige();
        if (r && firstPrestigeAt < 0) {
          firstPrestigeAt = eng.timeSec;
          firstPrestigeStage = stage;
          sawPrestige = true;
        }
      }
    }
    const d = eng.derived;
    if (!Number.isFinite(d.dps.log10())) throw new Error("sim non-finite DPS");
    if (i % (30 / dt) === 0) {
      const kt = toBig(eng.state.combat.enemyHp).isZero() ? 0 : toBig(eng.state.combat.enemyHp).div(d.dps).toNumber();
      killTimeSamples.push({ t: eng.timeSec, stage: eng.state.combat.stage, killTime: Number.isFinite(kt) ? kt : -1 });
    }
  }

  const td = eng.state.statistics.totalDamage;
  const mag = Math.floor(td[1] + Math.log10(Math.max(1e-300, td[0] ?? 1)));
  return {
    strategy,
    hours,
    stage: eng.state.combat.stage,
    maxStage: eng.state.statistics.allTimeMaxStage,
    dps: eng.derived.dps,
    gold: Big.fromTuple(eng.state.player.gold),
    totalDamageMag: mag,
    kills: eng.state.statistics.totalKills,
    bossKills: eng.state.statistics.totalBossKills,
    prestiges: eng.state.statistics.totalPrestiges,
    energy: eng.state.prestige.energy,
    firstPrestigeAt,
    timeTo100,
    timeTo300,
    timeTo400,
    timeTo500,
    firstPrestigeStage,
    reclearTime: reclearAt >= 0 ? reclearAt - firstPrestigeAt : -1,
    killTimeSamples,
  };
}