// 装备系统：掉落 / 强化 / 分解 / 自动分解
import { Big } from "../bignum";
import { CONFIG } from "../config";
import type { AffixStat, EquipInstance, EquipSlot, GameState, Rarity } from "../types";
import { Rng } from "../rng";

let uidCounter = 0;
export function nextUid(): string {
  uidCounter += 1;
  return `eq_${uidCounter}_${Date.now().toString(36)}${Math.floor(Math.random() * 0xffff).toString(36)}`;
}

export function rollRarity(rng: Rng, stage: number, luckMult: number): Rarity {
  const candidates = (Object.keys(CONFIG.EQUIPMENT.RARITIES) as Rarity[]).filter(
    (r) => stage >= CONFIG.EQUIPMENT.RARITIES[r].dropMinStage
  );
  const weighted = candidates.map((r) => {
    const base = CONFIG.EQUIPMENT.RARITIES[r].weight;
    const luckBoost = r === "legendary" || r === "epic" ? 1 + luckMult : 1;
    return [r, base * luckBoost] as [Rarity, number];
  });
  return rng.weighted(weighted);
}

export function rollEquipment(rng: Rng, stage: number, luckMult = 0, fixedSlot?: EquipSlot, fixedRarity?: Rarity): EquipInstance {
  const rarity = fixedRarity ?? rollRarity(rng, stage, luckMult);
  const slots = CONFIG.EQUIPMENT.SLOTS as readonly EquipSlot[];
  const slot = fixedSlot ?? rng.pick(slots);
  const mainStats = CONFIG.EQUIPMENT.MAIN_POOL[slot] as readonly AffixStat[];
  const mainStat = rng.pick(mainStats);
  const rarityDef = CONFIG.EQUIPMENT.RARITIES[rarity];

  const pool = (Object.keys(CONFIG.EQUIPMENT.AFFIX_RANGES) as AffixStat[]).filter((s) => s !== mainStat);
  const chosen = rng.shuffle(pool).slice(0, rarityDef.affixCount);
  const affixes = chosen.map((stat) => {
    const range = CONFIG.EQUIPMENT.AFFIX_RANGES[stat];
    const value = rollAffixValue(stat, range.min + rng.next() * (range.max - range.min));
    return { stat, value };
  });

  const item: EquipInstance = {
    uid: nextUid(),
    slot,
    rarity,
    level: 0,
    main: { stat: mainStat, mult: rarityDef.mainMult },
    affixes,
  };
  if (rarity === "legendary") {
    const leg = rng.pick(CONFIG.EQUIPMENT.LEGENDARY_POOL);
    item.legendary = { label: leg.label, mult: leg.mult };
  }
  return item;
}

function rollAffixValue(stat: AffixStat, value: number): number {
  if (stat === "comboCap") return Math.round(value);
  if (stat === "comboWindow") return Math.round(value * 2) / 2;
  return Math.round(value * 1000) / 1000;
}

export function enhanceCost(item: EquipInstance): number {
  if (item.level >= CONFIG.EQUIPMENT.MAX_ENHANCE) return Infinity;
  const shards = CONFIG.EQUIPMENT.RARITIES[item.rarity].shards;
  return Math.ceil(CONFIG.EQUIPMENT.ENHANCE_COST_BASE * shards * Math.pow(item.level + 1, 1.5));
}

export function canEnhance(state: GameState, slot: EquipSlot): boolean {
  const item = state.equipment.slots[slot];
  if (!item) return false;
  const cost = enhanceCost(item);
  return item.level < CONFIG.EQUIPMENT.MAX_ENHANCE && Big.fromTuple(state.equipment.fragments).gte(Big.fromNumber(cost));
}

export function enhance(state: GameState, slot: EquipSlot): boolean {
  const item = state.equipment.slots[slot];
  if (!item || !canEnhance(state, slot)) return false;
  const cost = enhanceCost(item);
  state.equipment.fragments = Big.fromTuple(state.equipment.fragments).sub(Big.fromNumber(cost)).toTuple();
  item.level += 1;
  return true;
}

export function shardsForRarity(rarity: Rarity): number {
  return CONFIG.EQUIPMENT.RARITIES[rarity].shards;
}

export function breakdown(state: GameState, uid: string, shardMult = 1): boolean {
  const target = findEquip(state, uid);
  if (!target) return false;
  const shards = Math.ceil(shardsForRarity(target.rarity) * shardMult);
  state.equipment.fragments = Big.fromTuple(state.equipment.fragments).add(Big.fromNumber(shards)).toTuple();
  removeEquip(state, uid);
  return true;
}

function findEquip(state: GameState, uid: string): EquipInstance | undefined {
  for (const slot of CONFIG.EQUIPMENT.SLOTS) {
    if (state.equipment.slots[slot]?.uid === uid) return state.equipment.slots[slot];
  }
  return state.equipment.inventory.find((e) => e.uid === uid);
}

function removeEquip(state: GameState, uid: string): void {
  for (const slot of CONFIG.EQUIPMENT.SLOTS) {
    if (state.equipment.slots[slot]?.uid === uid) {
      delete state.equipment.slots[slot];
      return;
    }
  }
  state.equipment.inventory = state.equipment.inventory.filter((e) => e.uid !== uid);
}

export function equipItem(state: GameState, uid: string): boolean {
  const item = state.equipment.inventory.find((e) => e.uid === uid);
  if (!item) return false;
  const old = state.equipment.slots[item.slot];
  state.equipment.inventory = state.equipment.inventory.filter((e) => e.uid !== uid);
  if (old) state.equipment.inventory.push(old);
  state.equipment.slots[item.slot] = item;
  return true;
}

export function unequip(state: GameState, slot: EquipSlot): boolean {
  const item = state.equipment.slots[slot];
  if (!item) return false;
  delete state.equipment.slots[slot];
  state.equipment.inventory.push(item);
  return true;
}

// 掉落入库（自动分解规则优先），返回是否保留
export function addDrop(state: GameState, item: EquipInstance): boolean {
  const threshold = state.equipment.autoBreakdown;
  if (threshold) {
    const order = { common: 0, fine: 1, rare: 2, epic: 3, legendary: 4 } as Record<Rarity, number>;
    if (order[item.rarity] <= order[threshold]) {
      state.equipment.fragments = Big.fromTuple(state.equipment.fragments).add(Big.fromNumber(shardsForRarity(item.rarity))).toTuple();
      return false;
    }
  }
  if (state.equipment.inventory.length >= CONFIG.EQUIPMENT.INVENTORY_CAP) {
    // 背包满：自动分解最差的
    state.equipment.fragments = Big.fromTuple(state.equipment.fragments).add(Big.fromNumber(shardsForRarity(item.rarity))).toTuple();
    return false;
  }
  state.equipment.inventory.push(item);
  return true;
}

export function dropChance(stage: number, luckMult: number): number {
  const base = CONFIG.EQUIPMENT.BASE_DROP_CHANCE * (1 + luckMult);
  return Math.min(0.35, base * (1 + stage / 200));
}

export function itemPowerTier(stage: number): number {
  return Math.floor(stage / CONFIG.EQUIPMENT.DROP_STAGE_TIER);
}
// ---------------- 重铸 / 制作 ----------------
export function reforgeCost(item: EquipInstance, mult = 1): number {
  const shards = CONFIG.EQUIPMENT.RARITIES[item.rarity].shards;
  return Math.max(1, Math.ceil(CONFIG.EQUIPMENT.REFORGE_COST_BASE * shards * (1 + item.affixes.length) * mult));
}

export function canReforge(state: GameState, uid: string, mult = 1): boolean {
  const item = findEquip(state, uid);
  if (!item || item.affixes.length === 0) return false;
  return Big.fromTuple(state.equipment.fragments).gte(Big.fromNumber(reforgeCost(item, mult)));
}

// 重铸：花费碎片重抛全部副词条（稀有度/主属性/传奇词条保留）
export function reforge(state: GameState, uid: string, rng: Rng, mult = 1): boolean {
  const item = findEquip(state, uid);
  if (!item || item.affixes.length === 0) return false;
  const cost = reforgeCost(item, mult);
  if (Big.fromTuple(state.equipment.fragments).lt(Big.fromNumber(cost))) return false;
  state.equipment.fragments = Big.fromTuple(state.equipment.fragments).sub(Big.fromNumber(cost)).toTuple();
  const rarityDef = CONFIG.EQUIPMENT.RARITIES[item.rarity];
  const pool = (Object.keys(CONFIG.EQUIPMENT.AFFIX_RANGES) as AffixStat[]).filter((s) => s !== item.main.stat);
  const chosen = rng.shuffle(pool).slice(0, rarityDef.affixCount);
  item.affixes = chosen.map((stat) => {
    const range = CONFIG.EQUIPMENT.AFFIX_RANGES[stat];
    const value = rollAffixValue(stat, range.min + rng.next() * (range.max - range.min));
    return { stat, value };
  });
  return true;
}

export function craftCost(slot: EquipSlot, rarity: Rarity, mult = 1): number {
  const shards = CONFIG.EQUIPMENT.RARITIES[rarity].shards;
  return Math.max(1, Math.ceil(CONFIG.EQUIPMENT.CRAFT_COST_MULT * shards * mult));
}

// 制作门槛：稀有度需达到掉落门槛关卡，背包不满
export function canCraft(state: GameState, slot: EquipSlot, rarity: Rarity, mult = 1): boolean {
  const stage = state.combat.stage;
  if (stage < CONFIG.EQUIPMENT.RARITIES[rarity].dropMinStage) return false;
  if (state.equipment.inventory.length >= CONFIG.EQUIPMENT.INVENTORY_CAP) return false;
  return Big.fromTuple(state.equipment.fragments).gte(Big.fromNumber(craftCost(slot, rarity, mult)));
}

export function craft(state: GameState, slot: EquipSlot, rarity: Rarity, rng: Rng, mult = 1): boolean {
  if (!canCraft(state, slot, rarity, mult)) return false;
  const cost = craftCost(slot, rarity, mult);
  state.equipment.fragments = Big.fromTuple(state.equipment.fragments).sub(Big.fromNumber(cost)).toTuple();
  const item = rollEquipment(rng, state.combat.stage, 0, slot, rarity);
  // 制作产物直接进背包，不受自动分解规则影响（canCraft 已限制背包不满）
  state.equipment.inventory.push(item);
  return true;
}
