"use client";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { ITEM_DEFS, TOOL_DEFS } from "@/game/data/items";
import { toBig } from "@/game/bignum";
import { formatNumber } from "@/game/format";
import type { ItemId, ToolId } from "@/game/types";
import styles from "./ItemsPanel.module.css";

export function ItemsPanel() {
  const { engine } = useGame();
  const consumables = useGameSelector((s) => s.items.consumables);
  const tools = useGameSelector((s) => s.items.tools);
  const prestige = useGameSelector((s) => s.prestige);

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
          <span>购买后永久解锁</span>
        </div>
        <div className={`items-grid tools-grid ${styles.grid}`}>
          {(Object.keys(TOOL_DEFS) as ToolId[]).map((id) => {
            const definition = TOOL_DEFS[id];
            const owned = tools[id] === true;
            const requiresFirstPrestige = id === "auto_prestige" && prestige.totalEnergyEarned <= 0;
            const cost = engine ? toBig(engine.toolCost(id)).toNumber() : 0;
            const canBuy = !requiresFirstPrestige && Boolean(engine?.canBuyTool(id));

            return (
              <article className={`item-card tool ${owned ? "owned" : ""} ${styles.card}`} key={id} aria-labelledby={`tool-${id}-name`}>
                <div className="item-card-head">
                  <span className="item-card-icon" aria-hidden="true">{definition.icon}</span>
                  {owned && <span className={`owned-tag ${styles.ownedTag}`}>✓ 已拥有</span>}
                </div>
                <div id={`tool-${id}-name`} className={`item-card-name ${styles.name}`}>{definition.name}</div>
                <div className={`item-card-desc ${styles.description}`}>{definition.desc}</div>
                {owned ? (
                  <span className={`item-card-owned-label ${styles.ownedStatus}`} role="status">已解锁并生效</span>
                ) : requiresFirstPrestige ? (
                  <button
                    type="button"
                    className={`mini-btn item-card-btn ${styles.actionButton}`}
                    disabled
                    title="需先手动完成一次重构才能购买自动重构"
                  >
                    需先手动重构 1 次
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`mini-btn item-card-btn buy ${styles.actionButton}`}
                    disabled={!canBuy}
                    onClick={() => engine?.buyTool(id)}
                    title={canBuy ? `购买${definition.name}` : "当前资源不足"}
                    aria-label={`购买${definition.name}，花费 ${formatNumber(cost)}`}
                  >
                    <span>购买</span>
                    <strong>{formatNumber(cost)}</strong>
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
