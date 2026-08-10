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

type EquipTab = "equipped" | "craft" | "inventory";

export function EquipPanel({ wide = false }: { wide?: boolean }) {
  const { engine } = useGame();
  const unlocked = useGameSelector((s) => s.meta.unlocks.includes("equipment"));
  const slots = useGameSelector((s) => s.equipment.slots);
  const inventory = useGameSelector((s) => s.equipment.inventory);
  const fragments = useGameSelector((s) => s.equipment.fragments);
  const [tab, setTab] = useState<EquipTab>("equipped");
  const [craftSlot, setCraftSlot] = useState<EquipSlot>("weapon");
  const [craftRarity, setCraftRarity] = useState<Rarity>("fine");

  if (!unlocked) {
    return (
      <div className="panel">
        <h3>装备</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>到达第 50 关解锁装备系统。</p>
      </div>
    );
  }

  const tabs: { id: EquipTab; label: string }[] = [
    { id: "equipped", label: `已装备 (${SLOTS.filter((s) => slots[s]).length})` },
    ...(wide ? [] : [{ id: "inventory" as EquipTab, label: `背包 (${inventory.length})` }]),
    { id: "craft", label: "制作 / 套装" },
  ];

  return (
    <div className="panel equip-panel">
      <div className="panel-title">
        <h3>装备</h3>
        <ResourceChip icon="💠" label="碎片" value={fragments} tone="frag" />
      </div>

      <div className="equip-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`mini-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "equipped" && (
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
      )}

      {tab === "craft" && (
        <div className="craft-section">
          <h3>套装</h3>
          {activeSets(slots).map((s) => (
            <div key={s.id} className={`set-row ${s.active ? "active" : ""}`}>
              <span>{s.active ? "●" : "○"} {s.name}</span>
              <span className="set-desc">{s.desc}</span>
            </div>
          ))}
          <h3 style={{ marginTop: 10 }}>制作</h3>
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
      )}

      {tab === "inventory" && <InventorySection engine={engine} />}
    </div>
  );
}

function InventorySection({ engine }: { engine: GameEngine | null }) {
  const inventory = useGameSelector((s) => s.equipment.inventory);
  const autoBreakdown = useGameSelector((s) => s.equipment.autoBreakdown);
  const [invSort, setInvSort] = useState<"rarity" | "score" | "slot">("rarity");
  const sorted = useMemo(() => {
    return [...inventory].sort((a, b) => {
      if (invSort === "score") return equipScore(b) - equipScore(a);
      if (invSort === "slot") return SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot);
      return rarityOrder(b.rarity) - rarityOrder(a.rarity);
    });
  }, [inventory, invSort]);
  return (
    <div className="inventory-section">
      <div className="equip-toolbar" style={{ marginBottom: 6 }}>
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
      </div>
      <div className="inventory-head">
        <h3>背包 ({inventory.length}/{CONFIG.EQUIPMENT.INVENTORY_CAP})</h3>
        <select className="equip-select sort-select" value={invSort} onChange={(e) => setInvSort(e.target.value as "rarity" | "score" | "slot")}>
          <option value="rarity">稀有度</option>
          <option value="score">评分</option>
          <option value="slot">槽位</option>
        </select>
      </div>
      <div className="inventory">
        {sorted.length === 0 && <span className="inventory-empty">暂无装备</span>}
        {sorted.map((item) => (
          <CompactInvCard key={item.uid} item={item} engine={engine} />
        ))}
      </div>
    </div>
  );
}

function CompactInvCard({ item, engine }: { item: EquipInstance; engine: GameEngine | null }) {
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

function EquipCard({ slot, item, engine }: { slot: EquipSlot; item: EquipInstance; engine: GameEngine | null }) {
  const rc = RARITY_COLOR[item.rarity];
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="equip-card equipped" data-rarity={item.rarity}>
      <div className="equip-card-top">
        <span className="equip-card-slot">{SLOT_ICON[slot]} <span>{SLOT_LABEL[slot]}</span></span>
        <span className="equip-card-badges">
          <span className="badge rarity-badge" style={{ color: rc, borderColor: rc }}>{RARITY_LABEL[item.rarity]}</span>
          <span className="badge level-badge">+{item.level}</span>
          {item.overclock ? <span className="badge oc-badge">×{item.overclock} 超频</span> : null}
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
        {confirm ? (
          <div className="equip-actions confirm-row">
            <span style={{ fontSize: 11, color: "var(--danger)" }}>确认分解？</span>
            <button className="mini-btn" style={{ color: "var(--danger)" }} onClick={() => { engine?.breakdown(item.uid); setConfirm(false); }}>确认</button>
            <button className="mini-btn" onClick={() => setConfirm(false)}>取消</button>
          </div>
        ) : (
          <div className="equip-actions">
            <button className="mini-btn equip-enhance" disabled={!engine?.canEnhance(slot) || item.level >= CONFIG.EQUIPMENT.MAX_ENHANCE}
              onClick={() => engine?.enhance(slot)}>
              强化 ({engine ? formatNumber(engine.enhanceCostOf(slot)) : 0})
            </button>
            {item.level >= CONFIG.EQUIPMENT.MAX_ENHANCE && (
              <button className="mini-btn" style={{ color: "var(--gold)" }} disabled={!engine?.canOverclock(slot)} onClick={() => engine?.overclock(slot)}>
                超频 ({engine ? formatNumber(engine.overclockCostOf(slot)) : 0})
              </button>
            )}
            {item.affixes.length > 0 && (
              <button className="mini-btn" disabled={!engine?.canReforge(item.uid)} onClick={() => engine?.reforge(item.uid)}>
                重铸 ({engine ? formatNumber(engine.reforgeCostOf(item.uid)) : 0})
              </button>
            )}
            <button className="mini-btn" onClick={() => engine?.unequip(slot)}>卸下</button>
            <button className="mini-btn" style={{ color: "var(--danger)" }} onClick={() => setConfirm(true)}>分解</button>
          </div>
        )}
      </div>
    </div>
  );
}