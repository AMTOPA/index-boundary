"use client";
import { useMemo, useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { ResourceChip } from "@/components/common/ResourceChip";
import { RARITY_LABEL, RARITY_COLOR, SLOT_LABEL, SLOT_ICON, rarityOrder, equipScore } from "@/game/data/equipment";
import { CONFIG } from "@/game/config";
import { formatNumber } from "@/game/format";
import type { EquipInstance, EquipSlot, Rarity } from "@/game/types";
import type { GameEngine } from "@/game/engine";

type InvSort = "rarity" | "score" | "slot";
const INV_SORT_LABEL: Record<InvSort, string> = { rarity: "稀有度", score: "评分", slot: "槽位" };

export function InventoryPanel() {
  const { engine } = useGame();
  const inventory = useGameSelector((s) => s.equipment.inventory);
  const fragments = useGameSelector((s) => s.equipment.fragments);
  const autoBreakdown = useGameSelector((s) => s.equipment.autoBreakdown);
  const [invSort, setInvSort] = useState<InvSort>("rarity");

  const sorted = useMemo(() => {
    const SLOTS = CONFIG.EQUIPMENT.SLOTS as readonly EquipSlot[];
    return [...inventory].sort((a, b) => {
      if (invSort === "score") return equipScore(b) - equipScore(a);
      if (invSort === "slot") return SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot);
      return rarityOrder(b.rarity) - rarityOrder(a.rarity);
    });
  }, [inventory, invSort]);

  return (
    <div className="panel inventory-panel">
      <div className="panel-title">
        <h3>背包 <span className="mono">{inventory.length}/{CONFIG.EQUIPMENT.INVENTORY_CAP}</span></h3>
        <ResourceChip icon="💠" label="碎片" value={fragments} tone="frag" />
      </div>
      <div className="equip-toolbar">
        <span className="equip-toolbar-label">自动分解 &lt;</span>
        <select
          className="equip-select"
          value={autoBreakdown ?? ""}
          onChange={(e) => engine?.setAutoBreakdown(e.target.value ? (e.target.value as Rarity) : null)}
        >
          <option value="">关闭</option>
          {(Object.keys(RARITY_LABEL) as Rarity[]).map((r) => (
            <option key={r} value={r}>{RARITY_LABEL[r]}</option>
          ))}
        </select>
        <select className="equip-select sort-select" value={invSort} onChange={(e) => setInvSort(e.target.value as InvSort)}>
          {(Object.keys(INV_SORT_LABEL) as InvSort[]).map((k) => (
            <option key={k} value={k}>排序：{INV_SORT_LABEL[k]}</option>
          ))}
        </select>
      </div>
      <div className="inventory">
        {sorted.length === 0 && <span className="inventory-empty">暂无装备</span>}
        {sorted.map((item) => (
          <InvCard key={item.uid} item={item} engine={engine} />
        ))}
      </div>
    </div>
  );
}

function InvCard({ item, engine }: { item: EquipInstance; engine: GameEngine | null }) {
  const rc = RARITY_COLOR[item.rarity];
  return (
    <div className="inv-card" data-rarity={item.rarity} title={`${RARITY_LABEL[item.rarity]} ${SLOT_LABEL[item.slot]} · 点击装备`}>
      <button className="inv-card-equip" onClick={() => engine?.equipItem(item.uid)}>
        <span className="inv-card-icon" style={{ color: rc }}>{SLOT_ICON[item.slot]}</span>
        <span className="inv-card-name" style={{ color: rc }}>{RARITY_LABEL[item.rarity]}</span>
        <span className="inv-card-meta">{SLOT_LABEL[item.slot]} +{item.level}{item.overclock ? ` ×${item.overclock}` : ""}</span>
        <span className="inv-card-score">{equipScore(item).toFixed(1)}</span>
      </button>
      <button className="inv-card-break" title="分解" onClick={() => engine?.breakdown(item.uid)}>分解</button>
    </div>
  );
}