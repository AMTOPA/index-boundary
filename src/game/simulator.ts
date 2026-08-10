// 自动玩家模拟器：headless 运行引擎，模拟理性玩家的购买/技能/装备/天赋/重构决策。
// 用于 /dev/balance 页面与 scripts/balance.ts、scripts/smoke.ts（不依赖 DOM，可 Node 运行）。
import { GameEngine, createNewState } from "./engine";
import { Big, toBig } from "./bignum";
import { CONFIG } from "./config";
import { SKILL_IDS, SKILL_DEFS } from "./data/skills";
import { TALENT_NODES } from "./data/talents";
import type { EquipInstance } from "./types";

export type SimStrategy = "equal" | "attack" | "gold";

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
}

// 天赋分配优先级（理性玩家近似：先伤害，后自动化）
const TALENT_PRIORITY: string[] = [
  "dest_sharp", "dest_crit", "auto_beat", "dest_super", "dest_hunter",
  "auto_offline", "auto_break", "auto_skip", "dest_keystone_absolute",
  // 贪婪树：剩余天赋点投入资源流
  "greed_loot", "greed_luck", "greed_pan", "greed_refine", "greed_keystone_compound",
];

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

function buyStrategy(eng: GameEngine, strategy: SimStrategy): void {
  if (strategy === "equal") {
    eng.smartBuy();
  } else if (strategy === "attack") {
    eng.buyUpgradeTimes("attack", 50);
    eng.buyUpgradeTimes("aspd", 5);
    eng.buyUpgradeTimes("gold", 5);
  } else {
    eng.buyUpgradeTimes("gold", 50);
    eng.buyUpgradeTimes("attack", 5);
  }
}

function allocateTalents(eng: GameEngine): void {
  let guard = 0;
  while (eng.state.talents.points > 0 && guard < 50) {
    guard += 1;
    let spent = false;
    for (const id of TALENT_PRIORITY) {
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
  const killTime = toBig(c.enemyHp).div(eng.derived.dps).toNumber();
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
      allocateTalents(eng);
      if (i % 50 === 0) autoEquip(eng);
      if (eng.canPrestige() && eng.timeSec - lastStageChange > wallSec) {
        const r = eng.prestige();
        if (r && firstPrestigeAt < 0) firstPrestigeAt = eng.timeSec;
      }
    }
    const d = eng.derived;
    if (!Number.isFinite(d.dps.toNumber())) throw new Error("模拟出现非有限 DPS");
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
  };
}