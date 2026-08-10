"use client";
import { useMemo, useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { ResourceChip } from "@/components/common/ResourceChip";
import { formatNumber } from "@/game/format";
import {
  RARITY_LABEL, RARITY_COLOR, SLOT_LABEL, SLOT_ICON, AFFIX_LABEL, formatAffixValue,
  rarityOrder, activeSets, equipScore,
} from "@/game/data/equipment";
import { CONFIG } from "@/game/config";
import type { EquipSlot, Rarity, EquipInstance } from "@/game/types";
import type { GameEngine } from "@/game/engine";

const SLOTS: EquipSlot[] = CONFIG.EQUIPMENT.SLOTS as unknown as EquipSlot[];

type InvSort = "rarity" | "score" | "slot";
const INV_SORT_LABEL: Record<InvSort, string> = {
  rarity: "稀有度",
  score: "评分",
  slot: "槽位",
};

export function EquipPanel() {
  const { engine } = useGame();
  const unlocked = useGameSelector((s) => s.meta.unlocks.includes("equipment"));
  const slots = useGameSelector((s) => s.equipment.slots);
  const inventory = useGameSelector((s) => s.equipment.inventory);
  const fragments = useGameSelector((s) => s.equipment.fragments);
  const autoBreakdown = useGameSelector((s) => s.equipment.autoBreakdown);
  const [craftSlot, setCraftSlot] = useState<EquipSlot>("weapon");
  const [craftRarity, setCraftRarity] = useState<Rarity>("fine");
  const [invSort, setInvSort] = useState<InvSort>("rarity");

  const sortedInventory = useMemo(
    () =>
      [...inventory].sort((a, b) => {
        if (invSort === "score") return equipScore(b) - equipScore(a);
        if (invSort === "slot") return SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot);
        return rarityOrder(b.rarity) - rarityOrder(a.rarity);
      }),
    [inventory, invSort]
  );

  if (!unlocked) {
    return (
      <div className="panel">
        <h3>装备</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>到达第 50 关解锁装备系统。</p>
      </div>
    );
  }

  return (
    <div className="panel equip-panel">
      <div className="panel-title">
        <h3>装备</h3>
        <ResourceChip icon="💠" label="碎片" value={fragments} tone="frag" />
      </div>

      <div className="equip-toolbar">
        <span className="equip-toolbar-label">自动分解 ≤</span>
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
      </div>

      <div className="equip-section">
        <h3>装备中</h3>
        <div className="equip-list">
          {SLOTS.map((slot) => {
            const item = slots[slot];
            if (!item) {
              return (
                <div className="equip-card empty" key={slot}>
                  <span className="equip-card-slot">{SLOT_ICON[slot]} <span>{SLOT_LABEL[slot]}</span></span>
                  <span className="equip-card-empty-tag">空槽位</span>
                </div>
              );
            }
            return <EquipCard key={slot} slot={slot} item={item} engine={engine} />;
          })}
        </div>
      </div>

      <div className="set-section">
        <h3>套装</h3>
        {activeSets(slots).map((s) => (
          <div key={s.id} className={`set-row ${s.active ? "active" : ""}`}>
            <span>{s.active ? "●" : "○"} {s.name}</span>
            <span className="set-desc">{s.desc}</span>
          </div>
        ))}
      </div>

      <div className="craft-section">
        <h3>制作</h3>
        <div className="craft-row">
          {SLOTS.map((sl) => (
            <button key={sl} className={`mini-btn ${craftSlot === sl ? "active" : ""}`} onClick={() => setCraftSlot(sl)}>
              {SLOT_ICON[sl]}
            </button>
          ))}
        </div>
        <div className="craft-row">
          {(Object.keys(RARITY_LABEL) as Rarity[]).map((r) => (
            <button
              key={r}
              className={`mini-btn rarity-tab ${craftRarity === r ? "active" : ""}`}
              data-rarity={r}
              style={{ color: RARITY_COLOR[r] }}
              onClick={() => setCraftRarity(r)}
            >
              {RARITY_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="craft-row">
          <span className="craft-cost">费用 {engine ? formatNumber(engine.craftCostOf(craftSlot, craftRarity)) : 0} 碎片</span>
          <button className="mini-btn craft-go" disabled={!engine?.canCraft(craftSlot, craftRarity)} onClick={() => engine?.craft(craftSlot, craftRarity)}>
            制作
          </button>
        </div>
      </div>

      <div className="inventory-section">
        <div className="inventory-head">
          <h3>背包 ({inventory.length}/{CONFIG.EQUIPMENT.INVENTORY_CAP})</h3>
          <select className="equip-select sort-select" value={invSort} onChange={(e) => setInvSort(e.target.value as InvSort)}>
            {(Object.keys(INV_SORT_LABEL) as InvSort[]).map((k) => (
              <option key={k} value={k}>排序：{INV_SORT_LABEL[k]}</option>
            ))}
          </select>
        </div>
        <div className="inventory">
          {sortedInventory.length === 0 && <span className="inventory-empty">暂无装备</span>}
          {sortedInventory.map((item) => (
            <InvCard
              key={item.uid}
              item={item}
              onClick={() => engine?.equipItem(item.uid)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function EquipCard({ slot, item, engine }: { slot: EquipSlot; item: EquipInstance; engine: GameEngine | null }) {
  const rc = RARITY_COLOR[item.rarity];
  return (
    <div className="equip-card equipped" data-rarity={item.rarity}>
      <div className="equip-card-top">
        <span className="equip-card-slot">{SLOT_ICON[slot]} <span>{SLOT_LABEL[slot]}</span></span>
        <span className="equip-card-badges">
          <span className="badge rarity-badge" style={{ color: rc, borderColor: rc }}>{RARITY_LABEL[item.rarity]}</span>
          <span className="badge level-badge">+{item.level}</span>
          {item.overclock ? <span className="badge oc-badge">×{item.overclock} 超频</span> : null}
          <span className="badge equipped-badge">已装备</span>
        </span>
      </div>

      <div className="equip-card-main">
        <span className="equip-card-main-label">主词条 · {AFFIX_LABEL[item.main.stat]}</span>
        <span className="equip-card-main-value" style={{ color: rc }}>×{item.main.mult.toFixed(1)}</span>
        <span className="equip-card-main-sub">强化 ×{(1 + item.level * CONFIG.EQUIPMENT.ENHANCE_MAIN_MULT).toFixed(2)}</span>
      </div>

      <div className="equip-card-affixes">
        {item.affixes.map((af, i) => (
          <span className="affix-chip" key={i}>
            {AFFIX_LABEL[af.stat]} {formatAffixValue(af.stat, af.value)}
          </span>
        ))}
        {item.legendary && (
          <span className="affix-chip legendary-chip">✦ {item.legendary.label} ×{item.legendary.mult}</span>
        )}
        {item.affixes.length === 0 && !item.legendary && (
          <span className="affix-chip none">暂无副词条</span>
        )}
      </div>

      <div className="equip-card-foot">
        <span className="equip-score">评分 {equipScore(item).toFixed(1)}</span>
        <div className="equip-actions">
          <button className="mini-btn equip-enhance" disabled={!engine?.canEnhance || item.level >= CONFIG.EQUIPMENT.MAX_ENHANCE}
            onClick={() => engine?.enhance(slot)}>
            强化 ({engine ? formatNumber(engine.enhanceCostOf(slot)) : 0})
          </button>
          <button className="mini-btn" onClick={() => engine?.unequip(slot)}>卸下</button>
          {item.level >= CONFIG.EQUIPMENT.MAX_ENHANCE && (
            <button
              className="mini-btn"
              style={{ color: "var(--gold)" }}
              disabled={!engine?.canOverclock(slot)}
              onClick={() => engine?.overclock(slot)}
            >
              超频 ({engine ? formatNumber(engine.overclockCostOf(slot)) : 0})
            </button>
          )}
          {item.affixes.length > 0 && (
            <button
              className="mini-btn"
              disabled={!engine?.canReforge(item.uid)}
              onClick={() => engine?.reforge(item.uid)}
            >
              重铸 ({engine ? formatNumber(engine.reforgeCostOf(item.uid)) : 0})
            </button>
          )}
          <button className="mini-btn" onClick={() => engine?.breakdown(item.uid)}>分解</button>
        </div>
      </div>
    </div>
  );
}

function InvCard({ item, onClick }: { item: EquipInstance; onClick: () => void }) {
  const rc = RARITY_COLOR[item.rarity];
  return (
    <div
      className="inv-card"
      data-rarity={item.rarity}
      onClick={onClick}
      title={`${RARITY_LABEL[item.rarity]} ${SLOT_LABEL[item.slot]} · 点击装备`}
    >
      <span className="inv-card-icon" style={{ color: rc }}>{SLOT_ICON[item.slot]}</span>
      <span className="inv-card-body">
        <span className="inv-card-name" style={{ color: rc }}>{RARITY_LABEL[item.rarity]}</span>
        <span className="inv-card-meta">
          {SLOT_LABEL[item.slot]} · +{item.level}
          {item.overclock ? ` · ×${item.overclock}` : ""}
        </span>
        <span className="inv-card-score">评分 {equipScore(item).toFixed(1)}</span>
      </span>
    </div>
  );
}