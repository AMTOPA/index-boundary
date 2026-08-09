"use client";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { ITEM_DEFS, TOOL_DEFS } from "@/game/data/items";
import type { ItemId, ToolId } from "@/game/types";

export function ItemsPanel() {
  const { engine } = useGame();
  const consumables = useGameSelector((s) => s.items.consumables);
  const tools = useGameSelector((s) => s.items.tools);

  return (
    <div className="panel">
      <h3>消耗品</h3>
      {(Object.keys(ITEM_DEFS) as ItemId[]).map((id) => {
        const def = ITEM_DEFS[id];
        const count = consumables[id] ?? 0;
        return (
          <div className="shop-row" key={id}>
            <div>
              <div>{def.icon} {def.name} <span className="mono" style={{ color: "var(--text-dim)" }}>×{count}</span></div>
              <div className="desc">{def.desc}</div>
            </div>
            <button className="mini-btn" disabled={count <= 0} onClick={() => engine?.castConsumable(id)}>使用</button>
          </div>
        );
      })}
      <h3 style={{ marginTop: 12 }}>永久工具</h3>
      {(Object.keys(TOOL_DEFS) as ToolId[]).map((id) => {
        const def = TOOL_DEFS[id];
        const owned = tools[id] === true;
        return (
          <div className="shop-row" key={id}>
            <div>
              <div>{def.icon} {def.name}</div>
              <div className="desc">{def.desc}</div>
            </div>
            <span style={{ color: owned ? "var(--green)" : "var(--text-dim)", fontSize: 13 }}>{owned ? "已拥有" : "未获得"}</span>
          </div>
        );
      })}
    </div>
  );
}