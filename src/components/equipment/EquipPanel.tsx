"use client";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { NumberDisplay } from "@/components/common/NumberDisplay";
import { toBig } from "@/game/bignum";
import { formatNumber } from "@/game/format";
import {
  RARITY_LABEL, RARITY_COLOR, SLOT_LABEL, SLOT_ICON, AFFIX_LABEL,
  rarityOrder, activeSets,
} from "@/game/data/equipment";
import { CONFIG } from "@/game/config";
import type { EquipSlot, Rarity } from "@/game/types";

const SLOTS: EquipSlot[] = ["weapon", "core", "engine", "charm"];

export function EquipPanel() {
  const { engine } = useGame();
  const unlocked = useGameSelector((s) => s.meta.unlocks.includes("equipment"));
  const slots = useGameSelector((s) => s.equipment.slots);
  const inventory = useGameSelector((s) => s.equipment.inventory);
  const fragments = useGameSelector((s) => s.equipment.fragments);
  const autoBreakdown = useGameSelector((s) => s.equipment.autoBreakdown);

  if (!unlocked) {
    return (
      <div className="panel">
        <h3>装备</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>到达第 50 关解锁装备系统。</p>
      </div>
    );
  }

  const fragBig = toBig(fragments);
  return (
    <div className="panel">
      <div className="panel-title">
        <h3>装备</h3>
        <span className="hint">碎片 <span className="mono" style={{ color: "#7fd1c0" }}>{formatNumber(fragBig.toNumber())}</span></span>
      </div>
      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>自动分解 ≤</span>
        <select
          value={autoBreakdown ?? ""}
          onChange={(e) => engine?.setAutoBreakdown(e.target.value ? (e.target.value as Rarity) : null)}
          style={{ background: "#101828", color: "var(--text)", border: "1px solid var(--panel-border)", borderRadius: 6, padding: "4px 8px" }}
        >
          <option value="">关闭</option>
          {(Object.keys(RARITY_LABEL) as Rarity[]).map((r) => (
            <option key={r} value={r}>{RARITY_LABEL[r]}</option>
          ))}
        </select>
      </div>
      {SLOTS.map((slot) => {
        const item = slots[slot];
        if (!item) {
          return (
            <div className="equip-slot empty" key={slot}>
              <div className="equip-head"><span>{SLOT_ICON[slot]} {SLOT_LABEL[slot]}</span><span className="equip-rarity">空</span></div>
            </div>
          );
        }
        const rc = RARITY_COLOR[item.rarity];
        return (
          <div className="equip-slot" key={slot}>
            <div className="equip-head">
              <span>{SLOT_ICON[slot]} {SLOT_LABEL[slot]} <span className="mono" style={{ color: "var(--text-dim)" }}>+{item.level}</span></span>
              <span className="equip-rarity" style={{ color: rc }}>{RARITY_LABEL[item.rarity]}</span>
            </div>
            <div className="equip-main" style={{ color: rc }}>
              主词条：{AFFIX_LABEL[item.main.stat]} ×{item.main.mult.toFixed(1)}（强化 ×{(1 + item.level * CONFIG.EQUIPMENT.ENHANCE_MAIN_MULT).toFixed(2)}）
            </div>
            {item.affixes.map((af, i) => (
              <div className="equip-affix" key={i}>
                {AFFIX_LABEL[af.stat]} {af.stat === "comboCap" || af.stat === "comboWindow" ? `+${af.value}` : `+${Math.round(af.value * 100)}%`}
              </div>
            ))}
            {item.legendary && <div className="equip-affix" style={{ color: "var(--gold)" }}>✦ {item.legendary.label} ×{item.legendary.mult}</div>}
            <div className="equip-actions">
              <button className="mini-btn equip-enhance" disabled={!engine?.canEnhance || item.level >= CONFIG.EQUIPMENT.MAX_ENHANCE}
                onClick={() => engine?.enhance(slot)}>
                强化 ({engine ? formatNumber(engine.enhanceCostOf(slot)) : 0} 碎片)
              </button>
              <button className="mini-btn" onClick={() => engine?.unequip(slot)}>卸下</button>
              <button className="mini-btn" onClick={() => engine?.breakdown(item.uid)}>分解</button>
            </div>
          </div>
        );
      })}
      <div className="set-section">
        <h3>套装</h3>
        {activeSets(slots).map((s) => (
          <div key={s.id} className={`set-row ${s.active ? "active" : ""}`}>
            <span>{s.active ? "●" : "○"} {s.name}</span>
            <span className="set-desc">{s.desc}</span>
          </div>
        ))}
      </div>
      <h3 style={{ marginTop: 10 }}>背包 ({inventory.length}/{CONFIG.EQUIPMENT.INVENTORY_CAP})</h3>
      <div className="inventory">
        {inventory.length === 0 && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>暂无装备</span>}
        {[...inventory].sort((a, b) => rarityOrder(b.rarity) - rarityOrder(a.rarity)).map((item) => (
          <div
            key={item.uid}
            className="inv-item"
            style={{ borderColor: RARITY_COLOR[item.rarity] }}
            onClick={() => engine?.equipItem(item.uid)}
            title={`${RARITY_LABEL[item.rarity]} ${SLOT_LABEL[item.slot]} · 点击装备`}
          >
            {SLOT_ICON[item.slot]} {RARITY_LABEL[item.rarity]}
          </div>
        ))}
      </div>
    </div>
  );
}