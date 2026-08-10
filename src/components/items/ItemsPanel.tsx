"use client";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { ITEM_DEFS, TOOL_DEFS } from "@/game/data/items";
import { toBig } from "@/game/bignum";
import { formatNumber } from "@/game/format";
import type { ItemId, ToolId } from "@/game/types";

export function ItemsPanel() {
  const { engine } = useGame();
  const consumables = useGameSelector((s) => s.items.consumables);
  const tools = useGameSelector((s) => s.items.tools);
  const prestige = useGameSelector((s) => s.prestige);

  return (
    <div className="panel items-panel">
      <h3>消耗品</h3>
      <div className="items-grid">
        {(Object.keys(ITEM_DEFS) as ItemId[]).map((id) => {
          const def = ITEM_DEFS[id];
          const count = consumables[id] ?? 0;
          return (
            <div className="item-card consumable" key={id}>
              <div className="item-card-head">
                <span className="item-card-icon">{def.icon}</span>
                <span className={`item-card-count ${count > 0 ? "has" : ""}`}>×{count}</span>
              </div>
              <div className="item-card-name">{def.name}</div>
              <div className="item-card-desc">{def.desc}</div>
              <button className="mini-btn item-card-btn" disabled={count <= 0} onClick={() => engine?.castConsumable(id)}>
                使用
              </button>
            </div>
          );
        })}
      </div>

      <h3 className="section-title">永久工具</h3>
      <div className="items-grid tools-grid">
        {(Object.keys(TOOL_DEFS) as ToolId[]).map((id) => {
          const def = TOOL_DEFS[id];
          const owned = tools[id] === true;
          return (
            <div className={`item-card tool ${owned ? "owned" : ""}`} key={id}>
              <div className="item-card-head">
                <span className="item-card-icon">{def.icon}</span>
                {owned && <span className="owned-tag">✓ 已拥有</span>}
              </div>
              <div className="item-card-name">{def.name}</div>
              <div className="item-card-desc">{def.desc}</div>
              {owned ? (
                <span className="item-card-owned-label">已解锁</span>
              ) : id === "auto_prestige" && prestige.totalEnergyEarned <= 0 ? (
                <button className="mini-btn item-card-btn" disabled title="需先手动完成一次重构才能购买自动重构">
                  需先重构 1 次
                </button>
              ) : (
                <button
                  className="mini-btn item-card-btn buy"
                  disabled={!engine?.canBuyTool(id)}
                  onClick={() => engine?.buyTool(id)}
                >
                  购买 {formatNumber(engine ? toBig(engine.toolCost(id)).toNumber() : 0)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}