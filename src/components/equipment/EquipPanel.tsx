"use client";
import { useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { ResourceChip } from "@/components/common/ResourceChip";
import { InventoryContent } from "./InventoryPanel";
import { formatNumber } from "@/game/format";
import {
  RARITY_LABEL,
  RARITY_COLOR,
  SLOT_LABEL,
  SLOT_ICON,
  AFFIX_LABEL,
  formatAffixValue,
  activeSets,
  equipScore,
} from "@/game/data/equipment";
import { CONFIG } from "@/game/config";
import type { EquipSlot, Rarity, EquipInstance } from "@/game/types";
import type { GameEngine } from "@/game/engine";
import styles from "./EquipPanel.module.css";

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
        <p className={styles.lockedHint}>到达第 50 关解锁装备系统。</p>
      </div>
    );
  }

  const tabs: { id: EquipTab; label: string }[] = [
    { id: "equipped", label: `已装备 (${SLOTS.filter((slot) => slots[slot]).length})` },
    ...(wide ? [] : [{ id: "inventory" as EquipTab, label: `背包 (${inventory.length})` }]),
    { id: "craft", label: "制作 / 套装" },
  ];

  return (
    <div className="panel equip-panel">
      <div className="panel-title">
        <h3>装备</h3>
        <ResourceChip icon="💠" label="碎片" value={fragments} tone="frag" />
      </div>

      <div className={`equip-tabs ${styles.tabs}`} role="tablist" aria-label="装备功能">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`mini-btn ${styles.tabButton} ${tab === item.id ? "active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "equipped" && (
        <div className="equip-list" role="tabpanel" aria-label="已装备物品">
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
        <div className="craft-section" role="tabpanel" aria-label="装备制作与套装">
          <h3>套装</h3>
          {activeSets(slots).map((set) => (
            <div key={set.id} className={`set-row ${set.active ? "active" : ""}`}>
              <span>{set.active ? "●" : "○"} {set.name}</span>
              <span className="set-desc">{set.desc}</span>
            </div>
          ))}
          <h3 className={styles.craftHeading}>制作</h3>
          <div className={`craft-row ${styles.choiceRow}`} aria-label="选择制作槽位">
            {SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                className={`mini-btn ${styles.choiceButton} ${craftSlot === slot ? "active" : ""}`}
                aria-pressed={craftSlot === slot}
                aria-label={`制作${SLOT_LABEL[slot]}`}
                onClick={() => setCraftSlot(slot)}
              >
                <span aria-hidden="true">{SLOT_ICON[slot]}</span>
                <span>{SLOT_LABEL[slot]}</span>
              </button>
            ))}
          </div>
          <div className={`craft-row ${styles.choiceRow}`} aria-label="选择制作稀有度">
            {(Object.keys(RARITY_LABEL) as Rarity[]).map((rarity) => (
              <button
                key={rarity}
                type="button"
                className={`mini-btn rarity-tab ${styles.choiceButton} ${craftRarity === rarity ? "active" : ""}`}
                data-rarity={rarity}
                style={{ color: RARITY_COLOR[rarity] }}
                aria-pressed={craftRarity === rarity}
                onClick={() => setCraftRarity(rarity)}
              >
                {RARITY_LABEL[rarity]}
              </button>
            ))}
          </div>
          <div className={`craft-row ${styles.craftSubmit}`}>
            <span className="craft-cost">
              {SLOT_LABEL[craftSlot]} · {RARITY_LABEL[craftRarity]} · 费用 {engine ? formatNumber(engine.craftCostOf(craftSlot, craftRarity)) : 0} 碎片
            </span>
            <button
              type="button"
              className={`mini-btn craft-go ${styles.primaryAction}`}
              disabled={!engine?.canCraft(craftSlot, craftRarity)}
              onClick={() => engine?.craft(craftSlot, craftRarity)}
            >
              制作装备
            </button>
          </div>
        </div>
      )}

      {tab === "inventory" && <InventoryContent engine={engine} embedded />}
    </div>
  );
}

function EquipCard({ slot, item, engine }: { slot: EquipSlot; item: EquipInstance; engine: GameEngine | null }) {
  const rarityColor = RARITY_COLOR[item.rarity];
  const [confirm, setConfirm] = useState(false);

  return (
    <article className={`equip-card equipped ${styles.equipCard}`} data-rarity={item.rarity}>
      <div className="equip-card-top">
        <span className="equip-card-slot">{SLOT_ICON[slot]} <span>{SLOT_LABEL[slot]}</span></span>
        <span className="equip-card-badges">
          <span className="badge rarity-badge" style={{ color: rarityColor, borderColor: rarityColor }}>{RARITY_LABEL[item.rarity]}</span>
          <span className="badge level-badge">+{item.level}</span>
          {item.overclock ? <span className="badge oc-badge">×{item.overclock} 超频</span> : null}
        </span>
      </div>

      <div className="equip-card-main">
        <span className="equip-card-main-label">主词条 · {AFFIX_LABEL[item.main.stat]}</span>
        <span className="equip-card-main-value" style={{ color: rarityColor }}>×{item.main.mult.toFixed(1)}</span>
        <span className="equip-card-main-sub">强化 ×{(1 + item.level * CONFIG.EQUIPMENT.ENHANCE_MAIN_MULT).toFixed(2)}</span>
      </div>

      <div className="equip-card-affixes">
        {item.affixes.map((affix, index) => (
          <span className="affix-chip" key={`${affix.stat}-${index}`}>
            {AFFIX_LABEL[affix.stat]} {formatAffixValue(affix.stat, affix.value)}
          </span>
        ))}
        {item.legendary && (
          <span className="affix-chip legendary-chip">✦ {item.legendary.label} ×{item.legendary.mult}</span>
        )}
        {item.affixes.length === 0 && !item.legendary && <span className="affix-chip none">暂无副词条</span>}
      </div>

      <div className="equip-card-foot">
        <span className="equip-score">评分 {equipScore(item).toFixed(1)}</span>
        {confirm ? (
          <div className={`equip-actions confirm-row ${styles.confirmActions}`} role="alert">
            <span className={styles.dangerText}>确认分解已装备物品？</span>
            <button
              type="button"
              className={`mini-btn ${styles.dangerText}`}
              onClick={() => {
                engine?.breakdown(item.uid);
                setConfirm(false);
              }}
            >
              确认
            </button>
            <button type="button" className="mini-btn" onClick={() => setConfirm(false)}>取消</button>
          </div>
        ) : (
          <div className={`equip-actions ${styles.equipActions}`}>
            <button
              type="button"
              className="mini-btn equip-enhance"
              disabled={!engine?.canEnhance(slot) || item.level >= CONFIG.EQUIPMENT.MAX_ENHANCE}
              onClick={() => engine?.enhance(slot)}
            >
              强化 ({engine ? formatNumber(engine.enhanceCostOf(slot)) : 0})
            </button>
            {item.level >= CONFIG.EQUIPMENT.MAX_ENHANCE && (
              <button
                type="button"
                className={`mini-btn ${styles.goldText}`}
                disabled={!engine?.canOverclock(slot)}
                onClick={() => engine?.overclock(slot)}
              >
                超频 ({engine ? formatNumber(engine.overclockCostOf(slot)) : 0})
              </button>
            )}
            {item.affixes.length > 0 && (
              <button type="button" className="mini-btn" disabled={!engine?.canReforge(item.uid)} onClick={() => engine?.reforge(item.uid)}>
                重铸 ({engine ? formatNumber(engine.reforgeCostOf(item.uid)) : 0})
              </button>
            )}
            <button type="button" className="mini-btn" onClick={() => engine?.unequip(slot)}>卸下</button>
            <button type="button" className={`mini-btn ${styles.dangerText}`} onClick={() => setConfirm(true)}>分解</button>
          </div>
        )}
      </div>
    </article>
  );
}
