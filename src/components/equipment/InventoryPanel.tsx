"use client";
import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { ResourceChip } from "@/components/common/ResourceChip";
import { RARITY_LABEL, RARITY_COLOR, SLOT_LABEL, SLOT_ICON, rarityOrder, equipScore } from "@/game/data/equipment";
import { CONFIG } from "@/game/config";
import type { EquipInstance, EquipSlot, Rarity } from "@/game/types";
import type { GameEngine } from "@/game/engine";
import styles from "./InventoryPanel.module.css";

type InvSort = "upgrade" | "rarity" | "score" | "scoreAsc" | "slot";

const INV_SORT_LABEL: Record<InvSort, string> = {
  upgrade: "提升优先",
  rarity: "稀有度：高到低",
  score: "评分：高到低",
  scoreAsc: "评分：低到高",
  slot: "装备槽位",
};

const SLOTS = CONFIG.EQUIPMENT.SLOTS as readonly EquipSlot[];

export function InventoryPanel() {
  const { engine } = useGame();
  const inventory = useGameSelector((s) => s.equipment.inventory);
  const fragments = useGameSelector((s) => s.equipment.fragments);

  return (
    <div className="panel inventory-panel">
      <div className="panel-title">
        <h3>
          背包 <span className="mono">{inventory.length}/{CONFIG.EQUIPMENT.INVENTORY_CAP}</span>
        </h3>
        <ResourceChip icon="💠" label="碎片" value={fragments} tone="frag" />
      </div>
      <InventoryContent engine={engine} />
    </div>
  );
}

export function InventoryContent({ engine, embedded = false }: { engine: GameEngine | null; embedded?: boolean }) {
  const inventory = useGameSelector((s) => s.equipment.inventory);
  const slots = useGameSelector((s) => s.equipment.slots);
  const autoBreakdown = useGameSelector((s) => s.equipment.autoBreakdown);
  const hasAutoBreakdownTool = useGameSelector((s) => s.items.tools.auto_breakdown === true);
  const [invSort, setInvSort] = useState<InvSort>("upgrade");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [protectedIds, setProtectedIds] = useState<Set<string>>(() => new Set());
  const [confirmBreakdownUid, setConfirmBreakdownUid] = useState<string | null>(null);
  const [batchConfirm, setBatchConfirm] = useState(false);
  const [pendingAutoBreakdown, setPendingAutoBreakdown] = useState<Rarity | "">(autoBreakdown ?? "");
  const [autoRuleConfirm, setAutoRuleConfirm] = useState(false);

  useEffect(() => {
    setPendingAutoBreakdown(autoBreakdown ?? "");
  }, [autoBreakdown]);

  useEffect(() => {
    const validIds = new Set(inventory.map((item) => item.uid));
    const prune = (previous: Set<string>) => {
      const next = new Set([...previous].filter((uid) => validIds.has(uid)));
      return next.size === previous.size ? previous : next;
    };
    setSelectedIds(prune);
    setProtectedIds(prune);
    setConfirmBreakdownUid((uid) => (uid && validIds.has(uid) ? uid : null));
  }, [inventory]);

  const sorted = useMemo(() => {
    const scoreDiff = (item: EquipInstance) => {
      const equipped = slots[item.slot];
      return equipScore(item) - (equipped ? equipScore(equipped) : 0);
    };

    return [...inventory].sort((a, b) => {
      if (invSort === "upgrade") return scoreDiff(b) - scoreDiff(a) || equipScore(b) - equipScore(a);
      if (invSort === "score") return equipScore(b) - equipScore(a);
      if (invSort === "scoreAsc") return equipScore(a) - equipScore(b);
      if (invSort === "slot") return SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || equipScore(b) - equipScore(a);
      return rarityOrder(b.rarity) - rarityOrder(a.rarity) || equipScore(b) - equipScore(a);
    });
  }, [inventory, invSort, slots]);

  const selectedBreakdownIds = useMemo(
    () => sorted.filter((item) => selectedIds.has(item.uid) && !protectedIds.has(item.uid)).map((item) => item.uid),
    [protectedIds, selectedIds, sorted],
  );

  const weakerIds = useMemo(
    () => sorted
      .filter((item) => {
        const equipped = slots[item.slot];
        return equipped && equipScore(item) < equipScore(equipped) && !protectedIds.has(item.uid);
      })
      .map((item) => item.uid),
    [protectedIds, slots, sorted],
  );

  const setSelection = (uid: string, selected: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (selected) next.add(uid);
      else next.delete(uid);
      return next;
    });
    setBatchConfirm(false);
  };

  const toggleProtection = (uid: string) => {
    setProtectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
    setSelectedIds((previous) => {
      if (!previous.has(uid)) return previous;
      const next = new Set(previous);
      next.delete(uid);
      return next;
    });
    setConfirmBreakdownUid(null);
    setBatchConfirm(false);
  };

  const selectAllUnprotected = () => {
    setSelectedIds(new Set(sorted.filter((item) => !protectedIds.has(item.uid)).map((item) => item.uid)));
    setBatchConfirm(false);
  };

  const selectWeakerItems = () => {
    setSelectedIds(new Set(weakerIds));
    setBatchConfirm(false);
  };

  const applyAutoBreakdown = () => {
    engine?.setAutoBreakdown(pendingAutoBreakdown || null);
    setAutoRuleConfirm(false);
  };

  const runBatchBreakdown = () => {
    for (const uid of selectedBreakdownIds) engine?.breakdown(uid);
    setSelectedIds(new Set());
    setBatchConfirm(false);
  };

  const autoRuleChanged = pendingAutoBreakdown !== (autoBreakdown ?? "");
  const autoRuleLabel = pendingAutoBreakdown ? RARITY_LABEL[pendingAutoBreakdown] : "关闭";

  return (
    <section className={`${styles.content} ${embedded ? styles.embedded : ""}`} aria-label="装备背包操作">
      <div className={styles.controlPanel}>
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel} htmlFor={embedded ? "embedded-inventory-sort" : "inventory-sort"}>排序</label>
          <select
            id={embedded ? "embedded-inventory-sort" : "inventory-sort"}
            className={`equip-select sort-select ${styles.select}`}
            value={invSort}
            onChange={(event) => setInvSort(event.target.value as InvSort)}
          >
            {(Object.keys(INV_SORT_LABEL) as InvSort[]).map((key) => (
              <option key={key} value={key}>{INV_SORT_LABEL[key]}</option>
            ))}
          </select>
        </div>

        <div className={styles.controlGroup}>
          <label className={styles.controlLabel} htmlFor={embedded ? "embedded-auto-breakdown" : "auto-breakdown"}>自动分解低于</label>
          <select
            id={embedded ? "embedded-auto-breakdown" : "auto-breakdown"}
            className={`equip-select ${styles.select}`}
            value={pendingAutoBreakdown}
            disabled={!hasAutoBreakdownTool}
            onChange={(event) => {
              setPendingAutoBreakdown(event.target.value as Rarity | "");
              setAutoRuleConfirm(false);
            }}
            title={hasAutoBreakdownTool ? "规则会严格分解低于所选稀有度的装备" : "购买自动分解工具后可用"}
          >
            <option value="">关闭</option>
            {(Object.keys(RARITY_LABEL) as Rarity[]).map((rarity) => (
              <option key={rarity} value={rarity}>{RARITY_LABEL[rarity]}</option>
            ))}
          </select>
          {autoRuleChanged && !autoRuleConfirm && (
            <button
              type="button"
              className={`mini-btn ${styles.actionButton}`}
              onClick={() => pendingAutoBreakdown ? setAutoRuleConfirm(true) : applyAutoBreakdown()}
            >
              应用规则
            </button>
          )}
        </div>
      </div>

      {!hasAutoBreakdownTool && <p className={styles.hint}>购买“自动分解”永久工具后可设置稀有度规则。</p>}
      {autoRuleConfirm && (
        <div className={styles.warning} role="alert">
          <span>应用“低于 {autoRuleLabel}”会立即清理符合条件的背包装备，确定继续？</span>
          <div className={styles.inlineActions}>
            <button type="button" className={`mini-btn ${styles.dangerButton}`} onClick={applyAutoBreakdown}>确认应用</button>
            <button type="button" className="mini-btn" onClick={() => setAutoRuleConfirm(false)}>取消</button>
          </div>
        </div>
      )}

      <div className={styles.batchToolbar} aria-label="批量选择与分解">
        <span className={styles.selectionCount}>已选 {selectedBreakdownIds.length} 件</span>
        <button type="button" className={`mini-btn ${styles.actionButton}`} disabled={weakerIds.length === 0} onClick={selectWeakerItems}>
          选择劣于已装备
        </button>
        <button type="button" className={`mini-btn ${styles.actionButton}`} disabled={sorted.length === protectedIds.size} onClick={selectAllUnprotected}>
          全选未保护
        </button>
        <button type="button" className={`mini-btn ${styles.actionButton}`} disabled={selectedIds.size === 0} onClick={() => { setSelectedIds(new Set()); setBatchConfirm(false); }}>
          清空选择
        </button>
        {!batchConfirm ? (
          <button
            type="button"
            className={`mini-btn ${styles.dangerButton}`}
            disabled={selectedBreakdownIds.length === 0}
            onClick={() => setBatchConfirm(true)}
          >
            批量分解 ({selectedBreakdownIds.length})
          </button>
        ) : (
          <div className={styles.inlineActions} role="alert">
            <span className={styles.confirmText}>确认分解 {selectedBreakdownIds.length} 件？</span>
            <button type="button" className={`mini-btn ${styles.dangerButton}`} onClick={runBatchBreakdown}>确认</button>
            <button type="button" className="mini-btn" onClick={() => setBatchConfirm(false)}>取消</button>
          </div>
        )}
      </div>

      <p className={styles.hint}>“临时保护”只在当前面板打开期间有效，不会写入存档；受保护装备不会被批量分解。</p>

      <div className={`inventory ${styles.inventoryGrid}`}>
        {sorted.length === 0 && <span className="inventory-empty">暂无装备</span>}
        {sorted.map((item) => (
          <InventoryCard
            key={item.uid}
            item={item}
            equipped={slots[item.slot]}
            engine={engine}
            selected={selectedIds.has(item.uid)}
            protectedOnPage={protectedIds.has(item.uid)}
            confirmingBreakdown={confirmBreakdownUid === item.uid}
            onSelectionChange={(selected) => setSelection(item.uid, selected)}
            onToggleProtection={() => toggleProtection(item.uid)}
            onRequestBreakdown={() => setConfirmBreakdownUid(item.uid)}
            onCancelBreakdown={() => setConfirmBreakdownUid(null)}
          />
        ))}
      </div>
    </section>
  );
}

function InventoryCard({
  item,
  equipped,
  engine,
  selected,
  protectedOnPage,
  confirmingBreakdown,
  onSelectionChange,
  onToggleProtection,
  onRequestBreakdown,
  onCancelBreakdown,
}: {
  item: EquipInstance;
  equipped?: EquipInstance;
  engine: GameEngine | null;
  selected: boolean;
  protectedOnPage: boolean;
  confirmingBreakdown: boolean;
  onSelectionChange: (selected: boolean) => void;
  onToggleProtection: () => void;
  onRequestBreakdown: () => void;
  onCancelBreakdown: () => void;
}) {
  const rarityColor = RARITY_COLOR[item.rarity];
  const itemScore = equipScore(item);
  const equippedScore = equipped ? equipScore(equipped) : null;
  const scoreDiff = equippedScore === null ? itemScore : itemScore - equippedScore;
  const comparison = equippedScore === null
    ? { label: "空槽，可直接提升", tone: styles.positive }
    : scoreDiff > 0.05
      ? { label: `提升 +${scoreDiff.toFixed(1)}`, tone: styles.positive }
      : scoreDiff < -0.05
        ? { label: `下降 ${scoreDiff.toFixed(1)}`, tone: styles.negative }
        : { label: "与当前装备持平", tone: styles.neutral };

  const confirmBreakdown = () => {
    engine?.breakdown(item.uid);
    onCancelBreakdown();
  };

  return (
    <article className={`inv-card ${styles.card} ${protectedOnPage ? styles.protected : ""}`} data-rarity={item.rarity}>
      <div className={styles.cardHeader}>
        <span className="inv-card-icon" style={{ color: rarityColor }} aria-hidden="true">{SLOT_ICON[item.slot]}</span>
        <div className={styles.identity}>
          <strong className="inv-card-name" style={{ color: rarityColor }}>{RARITY_LABEL[item.rarity]} · {SLOT_LABEL[item.slot]}</strong>
          <span className="inv-card-meta">强化 +{item.level}{item.overclock ? ` · 超频 ×${item.overclock}` : ""}</span>
        </div>
        <span className={styles.score}>评分 {itemScore.toFixed(1)}</span>
      </div>

      <div className={`${styles.comparison} ${comparison.tone}`}>{comparison.label}</div>
      {equippedScore !== null && <div className={styles.currentScore}>当前 {SLOT_LABEL[item.slot]}：{equippedScore.toFixed(1)}</div>}

      <button
        type="button"
        className={`mini-btn ${styles.equipButton}`}
        disabled={!engine}
        onClick={() => engine?.equipItem(item.uid)}
        aria-label={`装备${RARITY_LABEL[item.rarity]}${SLOT_LABEL[item.slot]}，评分 ${itemScore.toFixed(1)}，${comparison.label}`}
      >
        装备此物品
      </button>

      <div className={styles.cardActions}>
        <label className={`${styles.checkLabel} ${protectedOnPage ? styles.disabledControl : ""}`}>
          <input
            type="checkbox"
            checked={selected}
            disabled={protectedOnPage}
            onChange={(event) => onSelectionChange(event.target.checked)}
          />
          <span>批量选择</span>
        </label>
        <button
          type="button"
          className={`mini-btn ${styles.protectButton}`}
          aria-pressed={protectedOnPage}
          onClick={onToggleProtection}
          title="仅在当前面板打开期间阻止分解"
        >
          {protectedOnPage ? "取消保护" : "临时保护"}
        </button>
      </div>

      {confirmingBreakdown ? (
        <div className={styles.confirmRow} role="alert">
          <span>确认分解这件装备？</span>
          <button type="button" className={`mini-btn ${styles.dangerButton}`} onClick={confirmBreakdown}>确认</button>
          <button type="button" className="mini-btn" onClick={onCancelBreakdown}>取消</button>
        </div>
      ) : (
        <button
          type="button"
          className={`mini-btn ${styles.breakdownButton}`}
          disabled={protectedOnPage || !engine}
          onClick={onRequestBreakdown}
        >
          {protectedOnPage ? "已保护，无法分解" : "分解"}
        </button>
      )}
    </article>
  );
}
