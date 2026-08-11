import { describe, expect, it } from "vitest";
import { toBig } from "../game/bignum";
import { CONFIG } from "../game/config";
import { GameEngine, createNewState } from "../game/engine";
import { computeDerived, emptyBuffs } from "../game/formulas";
import { migrateState, normalizeState } from "../game/save";
import type { GameState } from "../game/types";

const BASE_UPGRADE_IDS = ["attack", "aspd", "critChance", "critDamage", "gold"] as const;

function totalBaseLevels(state: GameState): number {
  return BASE_UPGRADE_IDS.reduce((sum, id) => sum + state.player.upgrades[id], 0);
}

function autoUpgradeEngine(level: 1 | 2 | 3, seed: number): GameEngine {
  const state = createNewState(seed);
  state.combat.stage = 100_000;
  state.meta.unlocks = ["aspd_upgrade", "crit"];
  state.player.gold = [1, 1_000_000];
  state.items.toolLevels.auto_upgrade = level;
  state.items.tools.auto_upgrade = true;
  return new GameEngine(state);
}

function prestigeReadyState(stage: number, requiredStage: number, seed: number): GameState {
  const state = createNewState(seed);
  state.meta.unlocks = ["prestige"];
  state.meta.discoveries = ["prestige"];
  state.combat.stage = stage;
  state.prestige.nextRequiredStage = requiredStage;
  state.statistics.runDamage = [1, 30];
  return state;
}

describe("V16 contract: permanent tool tiers", () => {
  it("purchases all three auto-upgrade tiers with their exact gates and prices", () => {
    const state = createNewState(1601);
    state.combat.stage = 100;
    state.player.gold = [2, 33];
    const engine = new GameEngine(state);

    expect(CONFIG.TOOLS.auto_upgrade.map((tier) => tier.gold)).toEqual([[1, 8], [1, 30], [1, 33]]);
    expect(engine.toolLevel("auto_upgrade")).toBe(0);
    expect(engine.canBuyTool("auto_upgrade")).toBe(true);
    expect(engine.buyTool("auto_upgrade")).toBe(true);
    expect(engine.toolLevel("auto_upgrade")).toBe(1);

    expect(engine.canBuyTool("auto_upgrade")).toBe(false);
    expect(engine.toolPurchaseReasons("auto_upgrade")).toContain("\u9700\u5b8c\u6210 1 \u6b21\u91cd\u6784");
    engine.state.statistics.totalPrestiges = 1;
    expect(engine.canBuyTool("auto_upgrade")).toBe(true);
    expect(engine.buyTool("auto_upgrade")).toBe(true);
    expect(engine.toolLevel("auto_upgrade")).toBe(2);

    expect(engine.canBuyTool("auto_upgrade")).toBe(false);
    expect(engine.toolPurchaseReasons("auto_upgrade")).toContain("\u9700\u5b8c\u6210 3 \u6b21\u91cd\u6784");
    engine.state.statistics.totalPrestiges = 3;
    expect(engine.canBuyTool("auto_upgrade")).toBe(true);
    expect(engine.buyTool("auto_upgrade")).toBe(true);
    expect(engine.toolLevel("auto_upgrade")).toBe(3);
    expect(engine.toolNextTier("auto_upgrade")).toBeNull();
    expect(engine.buyTool("auto_upgrade")).toBe(false);
  });

  it("runs low, medium, and high auto-upgrade throughput as separate tiers", () => {
    expect(CONFIG.AUTO_UPGRADE_TIERS).toEqual([
      { intervalSec: 0.5, reevaluations: 1, maxBatch: 10 },
      { intervalSec: 0.1, reevaluations: 5, maxBatch: 500 },
      { intervalSec: 0.05, reevaluations: 8, maxBatch: 6250 },
    ]);

    const low = autoUpgradeEngine(1, 1602);
    const medium = autoUpgradeEngine(2, 1603);
    const high = autoUpgradeEngine(3, 1604);
    const lowBefore = totalBaseLevels(low.state);
    const mediumBefore = totalBaseLevels(medium.state);
    const highBefore = totalBaseLevels(high.state);

    low.tick(0.001);
    medium.tick(0.001);
    high.tick(0.001);

    expect(totalBaseLevels(low.state) - lowBefore).toBe(10);
    expect(totalBaseLevels(medium.state) - mediumBefore).toBe(2500);
    expect(totalBaseLevels(high.state) - highBefore).toBe(50_000);
  });

  it("treats a legacy boolean auto_upgrade ownership flag as level 2", () => {
    const state = createNewState(1605);
    state.items.tools.auto_upgrade = true;
    delete state.items.toolLevels.auto_upgrade;
    const engine = new GameEngine(state);

    expect(engine.toolLevel("auto_upgrade")).toBe(2);
    expect(engine.toolCost("auto_upgrade")).toEqual([1, 33]);
  });

  it("requires the auto-breakdown talent permission for purchase", () => {
    const state = createNewState(1606);
    state.combat.stage = 150;
    state.player.gold = [1, 18];
    const engine = new GameEngine(state);

    expect(engine.canBuyTool("auto_breakdown")).toBe(false);
    expect(engine.toolPurchaseReasons("auto_breakdown")).toContain("\u9700\u5148\u53d6\u5f97\u5929\u8d4b\u8d2d\u4e70\u6743\u9650");
    expect(engine.buyTool("auto_breakdown")).toBe(false);
    expect(toBig(engine.state.player.gold).eq(toBig([1, 18]))).toBe(true);

    engine.state.talents.allocations.auto_break = 1;
    expect(engine.canBuyTool("auto_breakdown")).toBe(true);
    expect(engine.buyTool("auto_breakdown")).toBe(true);
    expect(engine.toolLevel("auto_breakdown")).toBe(1);
  });

  it("keeps a legacy-owned auto-breakdown tool usable without repurchasing permission", () => {
    const state = createNewState(1607);
    state.items.tools.auto_breakdown = true;
    delete state.items.toolLevels.auto_breakdown;
    const engine = new GameEngine(state);

    expect(engine.toolLevel("auto_breakdown")).toBe(1);
    expect(engine.toolOwned("auto_breakdown")).toBe(true);
    expect(engine.setAutoBreakdown("rare")).toBe(true);
    expect(engine.state.equipment.autoBreakdown).toBe("rare");
  });

  it("enforces level 1 and level 2 auto-prestige purchase requirements", () => {
    const level1State = createNewState(1608);
    level1State.player.gold = [1, 24];
    const level1 = new GameEngine(level1State);

    expect(level1.canBuyTool("auto_prestige")).toBe(false);
    expect(level1.toolPurchaseReasons("auto_prestige")).toContain("\u9700\u5b8c\u6210 1 \u6b21\u91cd\u6784");
    level1.state.statistics.totalPrestiges = 1;
    expect(level1.canBuyTool("auto_prestige")).toBe(true);
    expect(level1.buyTool("auto_prestige")).toBe(true);
    expect(level1.toolLevel("auto_prestige")).toBe(1);
    expect(toBig(level1.state.player.gold).isZero()).toBe(true);

    const level2State = createNewState(1609);
    level2State.items.tools.auto_prestige = true;
    level2State.items.toolLevels.auto_prestige = 1;
    level2State.player.gold = [1, 36];
    level2State.statistics.totalPrestiges = 2;
    level2State.prestige.energy = 99;
    const level2 = new GameEngine(level2State);

    expect(level2.canBuyTool("auto_prestige")).toBe(false);
    expect(level2.toolPurchaseReasons("auto_prestige")).toEqual(expect.arrayContaining([
      "\u9700\u5b8c\u6210 3 \u6b21\u91cd\u6784",
      "\u9700\u6301\u6709 100 \u5947\u70b9\u80fd\u91cf",
    ]));
    level2.state.statistics.totalPrestiges = 3;
    expect(level2.canBuyTool("auto_prestige")).toBe(false);
    level2.state.prestige.energy = 100;
    expect(level2.canBuyTool("auto_prestige")).toBe(true);
    expect(level2.buyTool("auto_prestige")).toBe(true);
    expect(level2.toolLevel("auto_prestige")).toBe(2);
    expect(level2.state.prestige.energy).toBe(100);
    expect(toBig(level2.state.player.gold).isZero()).toBe(true);
  });
});

describe("V16 contract: prestige stage gates and automation", () => {
  it("requires stage 500 first, then increases the requirement by 100", () => {
    const engine = new GameEngine(prestigeReadyState(499, 500, 1610));

    expect(engine.prestigeRequiredStage()).toBe(500);
    expect(engine.canPrestige()).toBe(false);
    engine.state.combat.stage = 500;
    expect(engine.canPrestige()).toBe(true);
    expect(engine.prestige()).not.toBeNull();
    expect(engine.state.prestige.nextRequiredStage).toBe(600);

    engine.state.statistics.runDamage = [1, 30];
    engine.state.combat.stage = 599;
    expect(engine.canPrestige()).toBe(false);
    engine.state.combat.stage = 600;
    expect(engine.canPrestige()).toBe(true);
    expect(engine.prestige()).not.toBeNull();
    expect(engine.state.prestige.nextRequiredStage).toBe(700);
  });

  it("caps the increasing prestige requirement at stage 10000", () => {
    const engine = new GameEngine(prestigeReadyState(9900, 9900, 1611));

    expect(engine.prestige()).not.toBeNull();
    expect(engine.state.prestige.nextRequiredStage).toBe(10_000);
    engine.state.statistics.runDamage = [1, 30];
    engine.state.combat.stage = 9999;
    expect(engine.canPrestige()).toBe(false);
    engine.state.combat.stage = 10_000;
    expect(engine.prestige()).not.toBeNull();
    expect(engine.state.prestige.nextRequiredStage).toBe(10_000);
  });

  it("does not let an advanced auto-prestige rule bypass the hard stage gate", () => {
    const state = prestigeReadyState(499, 500, 1612);
    state.items.tools.auto_prestige = true;
    state.items.toolLevels.auto_prestige = 2;
    state.items.autoPrestigeRule = { enabled: true, metric: "stage", comparator: "gte", value: 1 };
    const engine = new GameEngine(state);

    engine.tick(0.1);
    expect(engine.state.statistics.totalPrestiges).toBe(0);
    expect(engine.state.combat.stage).toBe(499);

    engine.state.combat.stage = 500;
    engine.tick(1);
    expect(engine.state.statistics.totalPrestiges).toBe(1);
    expect(engine.state.combat.stage).toBe(1);
  });

  it("requires the configured advanced threshold after the hard gate is met", () => {
    const state = prestigeReadyState(500, 500, 1613);
    state.items.tools.auto_prestige = true;
    state.items.toolLevels.auto_prestige = 2;
    state.items.autoPrestigeRule = { enabled: true, metric: "stage", comparator: "gte", value: 600 };
    const engine = new GameEngine(state);

    engine.tick(0.1);
    expect(engine.state.statistics.totalPrestiges).toBe(0);
    engine.state.combat.stage = 600;
    engine.tick(1);
    expect(engine.state.statistics.totalPrestiges).toBe(1);
  });
});

describe("V16 contract: authority gates and first-run resonance", () => {
  it("blocks prestige during challenges and seasons", () => {
    const challenge = new GameEngine(prestigeReadyState(500, 500, 1614));
    challenge.state.meta.activeChallenge = "no_crit";
    expect(challenge.canPrestige()).toBe(false);
    expect(challenge.prestige()).toBeNull();

    const season = new GameEngine(prestigeReadyState(500, 500, 1615));
    season.state.meta.activeModifiers = ["poverty"];
    expect(season.canPrestige()).toBe(false);
  });

  it("blocks Nexus and Echo shop purchases until the dimension is entered", () => {
    const state = createNewState(1616);
    state.laws.shards = 100;
    state.echo.seals = 100;
    const engine = new GameEngine(state);

    expect(engine.canBuyNexus("nexusDmg")).toBe(false);
    expect(engine.buyNexusUpgrade("nexusDmg")).toBe(false);
    expect(engine.canBuyEcho("echoDmg")).toBe(false);
    expect(engine.buyEchoUpgrade("echoDmg")).toBe(false);

    engine.state.nexus.entered = true;
    engine.state.echo.entered = true;
    expect(engine.canBuyNexus("nexusDmg")).toBe(true);
    expect(engine.canBuyEcho("echoDmg")).toBe(true);
  });

  it("applies first-run resonance to damage only and disables it in challenges", () => {
    const state = createNewState(1617);
    state.combat.stage = 500;
    const normal = computeDerived(state, emptyBuffs(), 0);
    expect(normal.globalMult.toNumber()).toBeGreaterThan(1000);
    expect(normal.goldMult.toNumber()).toBeCloseTo(1, 8);

    state.meta.activeChallenge = "no_crit";
    const challenged = computeDerived(state, emptyBuffs(), 0);
    expect(challenged.globalMult.toNumber()).toBeCloseTo(1, 8);
    expect(challenged.goldMult.toNumber()).toBeCloseTo(1, 8);
  });

  it("keeps advanced auto-prestige paused until explicitly enabled", () => {
    const state = prestigeReadyState(1000, 500, 1618);
    state.items.tools.auto_prestige = true;
    state.items.toolLevels.auto_prestige = 2;
    state.items.autoPrestigeRule = { enabled: false, metric: "stage", comparator: "gte", value: 1000 };
    const engine = new GameEngine(state);

    engine.tick(1);
    expect(engine.state.statistics.totalPrestiges).toBe(0);
    engine.setAutoPrestigeRule({ enabled: true });
    engine.tick(1);
    expect(engine.state.statistics.totalPrestiges).toBe(1);
  });
});

describe("V16 contract: v5 migration and cloud normalization", () => {
  it("migrates v5 boolean tools to v6 levels and adds the default rule", () => {
    const raw = {
      items: {
        tools: {
          auto_upgrade: true,
          auto_breakdown: true,
          auto_prestige: true,
          auto_boss: false,
        },
      },
    };

    const migrated = migrateState(raw, 5) as typeof raw & {
      items: typeof raw.items & {
        toolLevels: Record<string, number>;
        autoPrestigeRule: { enabled: boolean; metric: string; comparator: string; value: number };
      };
    };

    expect(migrated.items.toolLevels).toEqual({
      auto_upgrade: 2,
      auto_breakdown: 1,
      auto_prestige: 1,
    });
    expect(migrated.items.autoPrestigeRule).toEqual({ enabled: false, metric: "stage", comparator: "gte", value: 1000 });
  });

  it("normalizes legacy cloud saves without requiring the local migration chain", () => {
    const normalized = normalizeState({
      meta: { unlocks: ["prestige"] },
      items: {
        tools: {
          auto_upgrade: true,
          auto_breakdown: true,
          auto_prestige: true,
        },
      },
      statistics: {
        totalPrestiges: 4,
        allTimeMaxStage: 1200,
      },
    });

    expect(normalized.items.toolLevels.auto_upgrade).toBe(2);
    expect(normalized.items.toolLevels.auto_breakdown).toBe(1);
    expect(normalized.items.toolLevels.auto_prestige).toBe(1);
    expect(normalized.items.autoPrestigeRule).toEqual({ enabled: false, metric: "stage", comparator: "gte", value: 1000 });
    expect(normalized.prestige.nextRequiredStage).toBe(900);
    expect(normalized.meta.discoveries).toContain("prestige");
    expect(normalized.meta.version).toBe(CONFIG.SAVE_VERSION);

    const engine = new GameEngine(normalized);
    expect(engine.setAutoBreakdown("rare")).toBe(true);
    expect(engine.toolLevel("auto_upgrade")).toBe(2);
  });
});
