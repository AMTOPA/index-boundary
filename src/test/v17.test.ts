import { describe, expect, it } from "vitest";
import { CONFIG } from "../game/config";
import { createNewState, GameEngine } from "../game/engine";
import { fnv1a, importSave, migrateState, normalizeState } from "../game/save";
import { leapCoresForStage } from "../game/systems/leap";

function leapReady(seed: number): GameEngine {
  const state = createNewState(seed);
  state.meta.unlocks.push("leap");
  state.combat.stage = CONFIG.LEAP.STAGE;
  return new GameEngine(state);
}

describe("V17 contract: 分层重置门槛", () => {
  it("跃迁门槛每次增加 500 关并封顶 15000 关", () => {
    const engine = leapReady(1701);
    expect(engine.leapRequiredStage()).toBe(10_000);

    for (let i = 0; i < 12; i++) {
      engine.state.combat.stage = engine.leapRequiredStage();
      expect(engine.canLeap()).toBe(true);
      expect(engine.leap()).not.toBeNull();
      const expected = Math.min(15_000, 10_000 + (i + 1) * 500);
      expect(engine.state.leap.nextRequiredStage).toBe(expected);
    }

    expect(engine.leapRequiredStage()).toBe(15_000);
  });

  it("动态门槛不能被旧的固定 10000 关绕过", () => {
    const engine = leapReady(1707);
    expect(engine.leap()).not.toBeNull();
    expect(engine.leapRequiredStage()).toBe(10_500);
    engine.state.combat.stage = 10_000;
    expect(engine.canLeap()).toBe(false);
    expect(engine.leap()).toBeNull();
    engine.state.combat.stage = 10_500;
    expect(engine.canLeap()).toBe(true);
  });

  it("跃迁会把重构门槛重置为 500 关", () => {
    const engine = leapReady(1702);
    engine.state.prestige.nextRequiredStage = 5900;
    expect(engine.leap()).not.toBeNull();
    expect(engine.state.prestige.nextRequiredStage).toBe(CONFIG.PRESTIGE.BASE_STAGE);
  });

  it("法则重写会重置重构与跃迁门槛", () => {
    const state = createNewState(1703);
    state.meta.unlocks.push("lawRewrite");
    state.combat.stage = CONFIG.LAWS.REWRITE_STAGE;
    state.statistics.allTimeMaxStage = CONFIG.LAWS.REWRITE_STAGE;
    state.prestige.nextRequiredStage = 7000;
    state.leap.nextRequiredStage = 15_000;
    const engine = new GameEngine(state);

    expect(engine.rewriteLaw()).not.toBeNull();
    expect(engine.state.prestige.nextRequiredStage).toBe(CONFIG.PRESTIGE.BASE_STAGE);
    expect(engine.state.leap.nextRequiredStage).toBe(CONFIG.LEAP.STAGE);
  });

  it("进入彼岸与回响时也不会携带低层高门槛", () => {
    const nexusState = createNewState(1704);
    nexusState.combat.stage = CONFIG.NEXUS.ENTRY_STAGE;
    nexusState.leap.purchases.newWorld = CONFIG.NEXUS.REQUIRED_NEW_WORLD;
    nexusState.laws.shards = CONFIG.NEXUS.ENTRY_SHARDS;
    nexusState.prestige.nextRequiredStage = 8000;
    nexusState.leap.nextRequiredStage = 15_000;
    const nexus = new GameEngine(nexusState);

    expect(nexus.enterNexus()).not.toBeNull();
    expect(nexus.state.prestige.nextRequiredStage).toBe(CONFIG.PRESTIGE.BASE_STAGE);
    expect(nexus.state.leap.nextRequiredStage).toBe(CONFIG.LEAP.STAGE);

    const echoState = createNewState(1705);
    echoState.nexus.entered = true;
    echoState.combat.stage = CONFIG.ECHO.ENTRY_STAGE;
    echoState.echo.totalSealsEarned = CONFIG.ECHO.ENTRY_SEALS;
    echoState.echo.seals = CONFIG.ECHO.ENTRY_COST;
    echoState.prestige.nextRequiredStage = 9000;
    echoState.leap.nextRequiredStage = 15_000;
    const echo = new GameEngine(echoState);

    expect(echo.enterEcho()).not.toBeNull();
    expect(echo.state.prestige.nextRequiredStage).toBe(CONFIG.PRESTIGE.BASE_STAGE);
    expect(echo.state.leap.nextRequiredStage).toBe(CONFIG.LEAP.STAGE);
  });
});

describe("V17 contract: 世界核心阶梯奖励", () => {
  it.each([
    [14_999, 1],
    [15_000, 2],
    [15_999, 2],
    [16_000, 3],
    [17_000, 4],
    [18_000, 5],
    [25_000, 12],
    [100_000, 87],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
  ])("第 %i 关获得 %i 个世界核心", (stage, cores) => {
    expect(leapCoresForStage(stage)).toBe(cores);
  });
});


describe("V17 contract: 特殊模式禁止高层重置", () => {
  function readyStates(seed: number) {
    const leap = createNewState(seed);
    leap.meta.unlocks.push("leap");
    leap.combat.stage = CONFIG.LEAP.STAGE;

    const law = createNewState(seed + 1);
    law.meta.unlocks.push("lawRewrite");
    law.combat.stage = CONFIG.LAWS.REWRITE_STAGE;
    law.statistics.allTimeMaxStage = CONFIG.LAWS.REWRITE_STAGE;

    const nexus = createNewState(seed + 2);
    nexus.combat.stage = CONFIG.NEXUS.ENTRY_STAGE;
    nexus.leap.purchases.newWorld = CONFIG.NEXUS.REQUIRED_NEW_WORLD;
    nexus.laws.shards = CONFIG.NEXUS.ENTRY_SHARDS;

    const echo = createNewState(seed + 3);
    echo.nexus.entered = true;
    echo.combat.stage = CONFIG.ECHO.ENTRY_STAGE;
    echo.echo.totalSealsEarned = CONFIG.ECHO.ENTRY_SEALS;
    echo.echo.seals = CONFIG.ECHO.ENTRY_COST;
    return { leap, law, nexus, echo };
  }

  it.each(["challenge", "season"] as const)("%s 中禁止跃迁、法则重写与维度进入", (mode) => {
    const states = readyStates(mode === "challenge" ? 1710 : 1720);
    for (const state of Object.values(states)) {
      if (mode === "challenge") state.meta.activeChallenge = "no_crit";
      else state.meta.activeModifiers = ["poverty"];
    }

    const leap = new GameEngine(states.leap);
    const law = new GameEngine(states.law);
    const nexus = new GameEngine(states.nexus);
    const echo = new GameEngine(states.echo);
    expect(leap.canLeap()).toBe(false);
    expect(leap.leap()).toBeNull();
    expect(law.canRewriteLaw()).toBe(false);
    expect(law.rewriteLaw()).toBeNull();
    expect(nexus.canEnterNexus()).toBe(false);
    expect(nexus.enterNexus()).toBeNull();
    expect(echo.canEnterEcho()).toBe(false);
    expect(echo.enterEcho()).toBeNull();
  });
});


describe("V18 contract: 分层增益继承", () => {
  it("重构会继承当前跃迁层的起始世界，并与起始力量叠加", () => {
    const state = createNewState(1801);
    state.meta.unlocks.push("prestige", "leap");
    state.leap.purchases = { startStage: 1, allStats: 2, lawExponent: 1, newWorld: 1 };
    state.prestige.purchases.startPower = 2;
    state.prestige.nextRequiredStage = CONFIG.PRESTIGE.BASE_STAGE;
    state.combat.stage = CONFIG.PRESTIGE.BASE_STAGE;
    state.statistics.runDamage = [1, 30];
    const engine = new GameEngine(state);

    expect(engine.prestige()).not.toBeNull();
    expect(engine.state.combat.stage).toBe(101);
    expect(engine.state.player.upgrades).toEqual({
      attack: 120,
      aspd: 100,
      critChance: 100,
      critDamage: 100,
      gold: 100,
    });
    expect(engine.state.leap.purchases).toEqual({ startStage: 1, allStats: 2, lawExponent: 1, newWorld: 1 });
    expect(engine.derived.leapGlobalMult.toNumber()).toBeCloseTo(Math.pow(1.3, 2), 8);
  });

  it("无起始世界时重构仍维持原有的 1 关起步规则", () => {
    const state = createNewState(1802);
    state.meta.unlocks.push("prestige");
    state.prestige.purchases.startPower = 2;
    state.combat.stage = CONFIG.PRESTIGE.BASE_STAGE;
    state.statistics.runDamage = [1, 30];
    const engine = new GameEngine(state);

    expect(engine.prestige()).not.toBeNull();
    expect(engine.state.combat.stage).toBe(1);
    expect(engine.state.player.upgrades).toEqual({ attack: 20, aspd: 0, critChance: 0, critDamage: 0, gold: 0 });
  });

  it("进入彼岸会清空重构、跃迁和法则已购增益，但保留货币与彼岸层", () => {
    const state = createNewState(1803);
    state.combat.stage = CONFIG.NEXUS.ENTRY_STAGE;
    state.leap.cores = 9;
    state.leap.purchases = { newWorld: CONFIG.NEXUS.REQUIRED_NEW_WORLD, startStage: 3, allStats: 4 };
    state.laws.shards = CONFIG.NEXUS.ENTRY_SHARDS + 10;
    state.laws.purchases = { critExp: 3, goldBoost: 2 };
    state.prestige.energy = 200;
    state.prestige.purchases.startPower = 5;
    const engine = new GameEngine(state);

    expect(engine.enterNexus()).not.toBeNull();
    expect(engine.state.leap.cores).toBe(9);
    expect(engine.state.laws.shards).toBe(CONFIG.NEXUS.ENTRY_SHARDS + 10 - CONFIG.NEXUS.ENTRY_COST);
    expect(engine.state.prestige.purchases).toEqual({});
    expect(engine.state.leap.purchases).toEqual({});
    expect(engine.state.laws.purchases).toEqual({});
    expect(engine.state.nexus.entered).toBe(true);
  });

  it("进入回响会清空重构、跃迁、法则和彼岸已购增益，但保留货币与回响层", () => {
    const state = createNewState(1804);
    state.nexus.entered = true;
    state.nexus.purchases = { nexusDmg: 3, nexusGold: 2 };
    state.combat.stage = CONFIG.ECHO.ENTRY_STAGE;
    state.echo.totalSealsEarned = CONFIG.ECHO.ENTRY_SEALS;
    state.echo.seals = CONFIG.ECHO.ENTRY_COST + 20;
    state.leap.cores = 8;
    state.leap.purchases = { startStage: 2, allStats: 3 };
    state.laws.shards = 40;
    state.laws.purchases = { critExp: 2 };
    state.prestige.energy = 100;
    state.prestige.purchases.startPower = 4;
    const engine = new GameEngine(state);

    expect(engine.enterEcho()).not.toBeNull();
    expect(engine.state.leap.cores).toBe(8);
    expect(engine.state.laws.shards).toBe(40);
    expect(engine.state.echo.seals).toBe(20);
    expect(engine.state.prestige.purchases).toEqual({});
    expect(engine.state.leap.purchases).toEqual({});
    expect(engine.state.laws.purchases).toEqual({});
    expect(engine.state.nexus.purchases).toEqual({});
    expect(engine.state.echo.entered).toBe(true);
  });

  it("法则层增益经过重构与跃迁仍存在，再次法则重写时也保留", () => {
    const state = createNewState(1810);
    state.meta.unlocks.push("prestige", "leap", "lawRewrite");
    state.laws.purchases = { critExp: 3, goldBoost: 2 };
    state.combat.stage = CONFIG.PRESTIGE.BASE_STAGE;
    state.statistics.runDamage = [1, 30];
    const engine = new GameEngine(state);

    expect(engine.prestige()).not.toBeNull();
    expect(engine.state.laws.purchases).toEqual({ critExp: 3, goldBoost: 2 });

    engine.state.meta.unlocks.push("leap");
    engine.state.combat.stage = engine.leapRequiredStage();
    expect(engine.leap()).not.toBeNull();
    expect(engine.state.laws.purchases).toEqual({ critExp: 3, goldBoost: 2 });

    engine.state.meta.unlocks.push("lawRewrite");
    engine.state.combat.stage = CONFIG.LAWS.REWRITE_STAGE;
    engine.state.statistics.allTimeMaxStage = CONFIG.LAWS.REWRITE_STAGE;
    expect(engine.rewriteLaw()).not.toBeNull();
    expect(engine.state.laws.purchases).toEqual({ critExp: 3, goldBoost: 2 });
  });

  it("彼岸层增益经过重构、跃迁与法则重写仍存在", () => {
    const state = createNewState(1811);
    state.meta.unlocks.push("prestige", "leap", "lawRewrite");
    state.nexus.entered = true;
    state.nexus.purchases = { nexusDmg: 3, nexusGold: 2 };
    state.combat.stage = CONFIG.PRESTIGE.BASE_STAGE;
    state.statistics.runDamage = [1, 30];
    const engine = new GameEngine(state);

    expect(engine.prestige()).not.toBeNull();
    expect(engine.state.nexus.purchases).toEqual({ nexusDmg: 3, nexusGold: 2 });
    engine.state.meta.unlocks.push("leap");
    engine.state.combat.stage = engine.leapRequiredStage();
    expect(engine.leap()).not.toBeNull();
    expect(engine.state.nexus.purchases).toEqual({ nexusDmg: 3, nexusGold: 2 });
    engine.state.meta.unlocks.push("lawRewrite");
    engine.state.combat.stage = CONFIG.LAWS.REWRITE_STAGE;
    engine.state.statistics.allTimeMaxStage = CONFIG.LAWS.REWRITE_STAGE;
    expect(engine.rewriteLaw()).not.toBeNull();
    expect(engine.state.nexus.purchases).toEqual({ nexusDmg: 3, nexusGold: 2 });
  });

  it("回响层增益经过所有低层重置仍存在", () => {
    const state = createNewState(1812);
    state.meta.unlocks.push("prestige", "leap", "lawRewrite");
    state.nexus.entered = true;
    state.echo.entered = true;
    state.echo.purchases = { echoDmg: 3, echoGold: 2 };
    state.combat.stage = CONFIG.PRESTIGE.BASE_STAGE;
    state.statistics.runDamage = [1, 30];
    const engine = new GameEngine(state);

    expect(engine.prestige()).not.toBeNull();
    expect(engine.state.echo.purchases).toEqual({ echoDmg: 3, echoGold: 2 });
    engine.state.meta.unlocks.push("leap");
    engine.state.combat.stage = engine.leapRequiredStage();
    expect(engine.leap()).not.toBeNull();
    expect(engine.state.echo.purchases).toEqual({ echoDmg: 3, echoGold: 2 });
    engine.state.meta.unlocks.push("lawRewrite");
    engine.state.combat.stage = CONFIG.LAWS.REWRITE_STAGE;
    engine.state.statistics.allTimeMaxStage = CONFIG.LAWS.REWRITE_STAGE;
    expect(engine.rewriteLaw()).not.toBeNull();
    expect(engine.state.echo.purchases).toEqual({ echoDmg: 3, echoGold: 2 });
  });

  it("v7 旧档会修复跃迁起始世界未在重构后生效的问题", () => {
    const raw = createNewState(1805);
    raw.meta.version = 7;
    raw.leap.purchases.startStage = 2;
    raw.prestige.purchases.startPower = 3;
    raw.prestige.totalEnergyEarned = 10;
    raw.combat.stage = 1;
    raw.player.upgrades = { attack: 30, aspd: 0, critChance: 0, critDamage: 0, gold: 0 };

    const normalized = normalizeState(raw);
    expect(normalized.combat.stage).toBe(201);
    expect(normalized.player.upgrades).toEqual({
      attack: 230,
      aspd: 200,
      critChance: 200,
      critDamage: 200,
      gold: 200,
    });
    expect(normalized.meta.version).toBe(CONFIG.SAVE_VERSION);
  });

  it("真实 v7 导入链会补齐跃迁基线且保留购买记录", () => {
    const state = createNewState(1813);
    state.meta.version = 7;
    state.leap.purchases = { startStage: 1, allStats: 2 };
    state.prestige.purchases.startPower = 2;
    state.prestige.totalEnergyEarned = 10;
    state.combat.stage = 12;
    state.player.upgrades = { attack: 35, aspd: 5, critChance: 0, critDamage: 0, gold: 0 };
    const version = 7;
    const timestamp = 1_786_528_800_000;
    const body = JSON.stringify(state) + String(version) + String(timestamp);
    const imported = importSave(JSON.stringify({
      format: "index-boundary-save",
      version,
      timestamp,
      checksum: fnv1a(body),
      state,
    }));

    expect(imported).not.toBeNull();
    expect(imported!.combat.stage).toBe(101);
    expect(imported!.player.upgrades).toEqual({ attack: 120, aspd: 100, critChance: 100, critDamage: 100, gold: 100 });
    expect(imported!.leap.purchases).toEqual({ startStage: 1, allStats: 2 });
    expect(imported!.meta.version).toBe(CONFIG.SAVE_VERSION);
  });

  it("v7 已进入高维的旧档不会被迁移不可逆删除购买记录", () => {
    const nexus = createNewState(1806);
    nexus.meta.version = 7;
    nexus.nexus.entered = true;
    nexus.leap.purchases = { allStats: 4 };
    nexus.laws.purchases = { critExp: 3 };
    nexus.nexus.purchases = { nexusDmg: 2 };
    const normalizedNexus = normalizeState(nexus);
    expect(normalizedNexus.leap.purchases).toEqual({ allStats: 4 });
    expect(normalizedNexus.laws.purchases).toEqual({ critExp: 3 });
    expect(normalizedNexus.nexus.purchases).toEqual({ nexusDmg: 2 });

    const echo = createNewState(1807);
    echo.meta.version = 7;
    echo.nexus.entered = true;
    echo.echo.entered = true;
    echo.leap.purchases = { allStats: 4 };
    echo.laws.purchases = { critExp: 3 };
    echo.nexus.purchases = { nexusDmg: 2 };
    echo.echo.purchases = { echoDmg: 1 };
    const normalizedEcho = normalizeState(echo);
    expect(normalizedEcho.leap.purchases).toEqual({ allStats: 4 });
    expect(normalizedEcho.laws.purchases).toEqual({ critExp: 3 });
    expect(normalizedEcho.nexus.purchases).toEqual({ nexusDmg: 2 });
    expect(normalizedEcho.echo.purchases).toEqual({ echoDmg: 1 });
  });

  it("v7 旧错误重构档即使已推进和升级，也只增不减地补齐跃迁基线", () => {
    const raw = createNewState(1808);
    raw.meta.version = 7;
    raw.leap.purchases.startStage = 2;
    raw.prestige.purchases.startPower = 3;
    raw.prestige.totalEnergyEarned = 10;
    raw.combat.stage = 57;
    raw.player.upgrades = { attack: 250, aspd: 80, critChance: 220, critDamage: 40, gold: 205 };

    const normalized = normalizeState(raw);
    expect(normalized.combat.stage).toBe(201);
    expect(normalized.player.upgrades).toEqual({
      attack: 250,
      aspd: 200,
      critChance: 220,
      critDamage: 200,
      gold: 205,
    });
  });
});

describe("V17 contract: v6 存档修复", () => {
  it("旧档完成过跃迁时重置遗留的重构门槛并初始化跃迁门槛", () => {
    const raw = createNewState(1706) as unknown as Record<string, unknown>;
    const prestige = raw.prestige as { nextRequiredStage: number };
    const leap = raw.leap as { totalLeaps: number; nextRequiredStage?: number };
    prestige.nextRequiredStage = 5900;
    leap.totalLeaps = 4;
    delete leap.nextRequiredStage;

    const migrated = normalizeState(migrateState(raw, 6));
    expect(migrated.prestige.nextRequiredStage).toBe(CONFIG.PRESTIGE.BASE_STAGE);
    expect(migrated.leap.nextRequiredStage).toBe(CONFIG.LEAP.STAGE);
    expect(migrated.meta.version).toBe(CONFIG.SAVE_VERSION);
  });

  it("只进行过法则重写、从未跃迁的旧档也会修复低层门槛", () => {
    const raw = createNewState(1708) as unknown as Record<string, unknown>;
    const meta = raw.meta as { version: number };
    const prestige = raw.prestige as { nextRequiredStage: number };
    const leap = raw.leap as { totalLeaps: number; nextRequiredStage?: number };
    const laws = raw.laws as { totalRewrites: number };
    meta.version = 6;
    prestige.nextRequiredStage = 5900;
    leap.totalLeaps = 0;
    laws.totalRewrites = 1;
    delete leap.nextRequiredStage;

    const migrated = normalizeState(migrateState(raw, 6));
    expect(migrated.prestige.nextRequiredStage).toBe(CONFIG.PRESTIGE.BASE_STAGE);
    expect(migrated.leap.nextRequiredStage).toBe(CONFIG.LEAP.STAGE);
  });

  it("真实 v6 导入链会执行门槛迁移并校验 checksum", () => {
    const state = createNewState(1709);
    state.meta.version = 6;
    state.prestige.nextRequiredStage = 5900;
    state.leap.totalLeaps = 1;
    delete (state.leap as { nextRequiredStage?: number }).nextRequiredStage;
    const version = 6;
    const timestamp = 1_786_442_400_000;
    const body = JSON.stringify(state) + String(version) + String(timestamp);
    const imported = importSave(JSON.stringify({
      format: "index-boundary-save",
      version,
      timestamp,
      checksum: fnv1a(body),
      state,
    }));

    expect(imported).not.toBeNull();
    expect(imported!.prestige.nextRequiredStage).toBe(CONFIG.PRESTIGE.BASE_STAGE);
    expect(imported!.leap.nextRequiredStage).toBe(CONFIG.LEAP.STAGE);
    expect(imported!.meta.version).toBe(CONFIG.SAVE_VERSION);
  });

  it("旧云存档绕过迁移链直接规范化时也会修复门槛", () => {
    const normalized = normalizeState({
      meta: { version: 6 },
      prestige: { nextRequiredStage: 5900 },
      leap: { totalLeaps: 0 },
      laws: { totalRewrites: 1 },
    });
    expect(normalized.prestige.nextRequiredStage).toBe(CONFIG.PRESTIGE.BASE_STAGE);
    expect(normalized.leap.nextRequiredStage).toBe(CONFIG.LEAP.STAGE);
  });

  it("坏档中的跃迁门槛会被钳制到合法区间", () => {
    const low = normalizeState({ meta: { version: 7 }, leap: { nextRequiredStage: 1 } });
    const high = normalizeState({ meta: { version: 7 }, leap: { nextRequiredStage: 999_999 } });
    const invalid = normalizeState({ meta: { version: 7 }, leap: { nextRequiredStage: "oops" } });
    expect(low.leap.nextRequiredStage).toBe(CONFIG.LEAP.STAGE);
    expect(high.leap.nextRequiredStage).toBe(CONFIG.LEAP.MAX_STAGE_REQUIREMENT);
    expect(invalid.leap.nextRequiredStage).toBe(CONFIG.LEAP.STAGE);
  });
});
