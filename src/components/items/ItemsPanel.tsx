"use client";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { ITEM_DEFS, TOOL_DEFS } from "@/game/data/items";
import { toBig } from "@/game/bignum";
import { formatBig } from "@/game/format";
import type { AutoPrestigeMetric, ItemId, ThresholdComparator, ToolId } from "@/game/types";
import styles from "./ItemsPanel.module.css";

const METRIC_LABELS: Record<AutoPrestigeMetric, string> = {
  stage: "当前关卡",
  energy: "预计获得能量",
  multRatio: "重构后 / 重构前倍率",
};

const COMPARATOR_LABELS: Record<ThresholdComparator, string> = {
  gte: "≥",
  lte: "≤",
  eq: "≈",
};

export function ItemsPanel() {
  const { engine } = useGame();
  const consumables = useGameSelector((s) => s.items.consumables);
  const tools = useGameSelector((s) => s.items.tools);
  const toolLevels = useGameSelector((s) => s.items.toolLevels);
  const autoPrestigeRule = useGameSelector((s) => s.items.autoPrestigeRule);
  // Nested engine state is mutated in place; this scalar signature guarantees shop conditions refresh.
  useGameSelector((s) => [
    s.player.gold.join(":"),
    s.combat.stage,
    s.statistics.totalPrestiges,
    s.prestige.energy,
    s.talents.allocations.auto_break ?? 0,
    s.meta.unlocks.join("|"),
    s.meta.discoveries.join("|"),
    Object.entries(s.items.tools).sort().join("|"),
    Object.entries(s.items.toolLevels).sort().join("|"),
    Object.entries(s.items.consumables).sort().join("|"),
    `${s.items.autoPrestigeRule.enabled}:${s.items.autoPrestigeRule.metric}:${s.items.autoPrestigeRule.comparator}:${s.items.autoPrestigeRule.value}`,
  ].join(";"));

  const getLevel = (id: ToolId) => {
    const level = toolLevels[id] ?? 0;
    if (level > 0) return level;
    if (!tools[id]) return 0;
    return id === "auto_upgrade" ? 2 : 1;
  };

  return (
    <div className={`panel items-panel ${styles.panel}`}>
      <section className={styles.section} aria-labelledby="consumables-heading">
        <div className={styles.sectionHeading}>
          <h3 id="consumables-heading">消耗品</h3>
          <span>每次使用消耗 1 个</span>
        </div>
        <div className={`items-grid ${styles.grid}`}>
          {(Object.keys(ITEM_DEFS) as ItemId[]).map((id) => {
            const definition = ITEM_DEFS[id];
            const count = consumables[id] ?? 0;
            return (
              <article className={`item-card consumable ${styles.card}`} key={id} aria-labelledby={`item-${id}-name`}>
                <div className="item-card-head">
                  <span className="item-card-icon" aria-hidden="true">{definition.icon}</span>
                  <span className={`item-card-count ${count > 0 ? "has" : ""}`} aria-label={`持有 ${count} 个`}>×{count}</span>
                </div>
                <div id={`item-${id}-name`} className={`item-card-name ${styles.name}`}>{definition.name}</div>
                <div className={`item-card-desc ${styles.description}`}>{definition.desc}</div>
                <button
                  type="button"
                  className={`mini-btn item-card-btn ${styles.actionButton}`}
                  disabled={count <= 0 || !engine}
                  onClick={() => engine?.castConsumable(id)}
                  title={count > 0 ? `使用 1 个${definition.name}` : `没有可用的${definition.name}`}
                  aria-label={`使用${definition.name}，当前持有 ${count} 个`}
                >
                  {count > 0 ? "使用 1 个" : "库存为空"}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="tools-heading">
        <div className={styles.sectionHeading}>
          <h3 id="tools-heading" className="section-title">永久工具</h3>
          <span>分级购买，已获得等级永久保留</span>
        </div>
        <div className={`items-grid tools-grid ${styles.grid}`}>
          {(Object.keys(TOOL_DEFS) as ToolId[]).map((id) => {
            const definition = TOOL_DEFS[id];
            const level = getLevel(id);
            const maxLevel = engine?.toolMaxLevel(id) ?? 1;
            const nextTier = engine?.toolNextTier(id) ?? null;
            const maxed = level >= maxLevel;
            const reasons = engine?.toolPurchaseReasons(id) ?? [];
            const canBuy = Boolean(engine?.canBuyTool(id));

            return (
              <article className={`item-card tool ${level > 0 ? "owned" : ""} ${styles.card}`} key={id} aria-labelledby={`tool-${id}-name`}>
                <div className="item-card-head">
                  <span className="item-card-icon" aria-hidden="true">{definition.icon}</span>
                  <span className={`owned-tag ${styles.levelTag}`}>Lv{level}/{maxLevel}</span>
                </div>
                <div id={`tool-${id}-name`} className={`item-card-name ${styles.name}`}>{definition.name}</div>
                <div className={`item-card-desc ${styles.description}`}>{definition.desc}</div>
                {nextTier && (
                  <div className={styles.tierPreview}>
                    <strong>{nextTier.label}</strong>
                    <span>{nextTier.desc}</span>
                  </div>
                )}
                {maxed ? (
                  <span className={`item-card-owned-label ${styles.ownedStatus}`} role="status">已满级并生效</span>
                ) : (
                  <>
                    {reasons.length > 0 && (
                      <ul className={styles.requirements} aria-label="购买条件">
                        {reasons.map((reason) => <li key={reason}>{reason}</li>)}
                      </ul>
                    )}
                    <button
                      type="button"
                      className={`mini-btn item-card-btn buy ${styles.actionButton}`}
                      disabled={!canBuy}
                      onClick={() => engine?.buyTool(id)}
                      title={canBuy ? `购买${nextTier?.label ?? definition.name}` : reasons.join("；")}
                      aria-label={`购买${nextTier?.label ?? definition.name}，花费 ${formatBig(toBig(nextTier?.gold ?? [0, 0]))}`}
                    >
                      <span>{level > 0 ? "升级" : "购买"}</span>
                      <strong>{formatBig(toBig(nextTier?.gold ?? [0, 0]))}</strong>
                    </button>
                  </>
                )}
              </article>
            );
          })}
        </div>

        {getLevel("auto_prestige") >= 2 && (
          <div className={styles.rulePanel}>
            <div>
              <strong>策略自动重构阈值</strong>
              <p>满足下列条件且达到本次重构硬门槛时自动执行。关卡/能量的“≈”按整数精确匹配，倍率比按 1% 误差判定。</p>
            </div>
            <div className={styles.ruleToggle}>
              <label>
                <input
                  type="checkbox"
                  checked={autoPrestigeRule.enabled}
                  onChange={(e) => engine?.setAutoPrestigeRule({ enabled: e.target.checked })}
                />
                <span>{autoPrestigeRule.enabled ? "已启用策略监控" : "已暂停，配置完成后再启用"}</span>
              </label>
            </div>
            <div className={styles.ruleControls}>
              <label>
                <span>指标</span>
                <select value={autoPrestigeRule.metric} onChange={(e) => engine?.setAutoPrestigeRule({ metric: e.target.value as AutoPrestigeMetric })}>
                  {(Object.keys(METRIC_LABELS) as AutoPrestigeMetric[]).map((metric) => (
                    <option value={metric} key={metric}>{METRIC_LABELS[metric]}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>判定</span>
                <select value={autoPrestigeRule.comparator} onChange={(e) => engine?.setAutoPrestigeRule({ comparator: e.target.value as ThresholdComparator })}>
                  {(Object.keys(COMPARATOR_LABELS) as ThresholdComparator[]).map((comparator) => (
                    <option value={comparator} key={comparator}>{COMPARATOR_LABELS[comparator]}</option>
                  ))}
                </select>
              </label>
              <label className={styles.ruleValue}>
                <span>阈值</span>
                <input
                  type="number"
                  min="0"
                  step={autoPrestigeRule.metric === "multRatio" ? "0.01" : "1"}
                  value={autoPrestigeRule.value}
                  onChange={(e) => engine?.setAutoPrestigeRule({ value: Number(e.target.value) })}
                />
              </label>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
