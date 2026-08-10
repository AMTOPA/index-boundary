"use client";
import { useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { formatNumber } from "@/game/format";
import { CONFIG } from "@/game/config";
import type { NexusUpgradeId } from "@/game/types";
import { ConfirmModal } from "@/components/common/ConfirmModal";

const NEXUS_SHOP_ORDER: NexusUpgradeId[] = ["nexusDmg", "nexusGold", "nexusShardGain", "nexusOverflow", "nexusBossAuto"];

// 法则彼岸（第 4 维度）：新世界 Lv2 + 足够法则碎片后解锁，货币 = 法则碎片
export function NexusPanel() {
  const { engine } = useGame();
  const state = useGameSelector((s) => s);
  const [confirmEnter, setConfirmEnter] = useState(false);

  const nexus = state.nexus;
  const newWorldLv = state.leap.purchases.newWorld ?? 0;
  const shards = state.laws.shards;
  const canEnter = engine?.canEnterNexus() ?? false;
  const bossAutoBought = nexus.bossAutoAttack;
  const bossAutoCost = engine ? engine.nexusShopCost("nexusBossAuto") : 0;
  const bossAutoCanBuy = engine?.canBuyNexus("nexusBossAuto") ?? false;
  const bossAutoPrereq = `前置条件：新世界 Lv${CONFIG.NEXUS.REQUIRED_NEW_WORLD}（三层跃迁全部完成）+ 持有法则碎片 ≥ ${formatNumber(CONFIG.NEXUS.ENTRY_SHARDS)}；进入彼岸后自动免费获得。`;

  // Boss 自动攻击提前购买区（未解锁彼岸时也显示前置条件）
  const bossAutoBlock = (
    <div style={{ marginTop: 12 }}>
      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Boss 自动攻击（提前购买）</h3>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 6, lineHeight: 1.6 }}>{bossAutoPrereq}</p>
      {bossAutoBought ? (
        <span style={{ color: "var(--green)", fontSize: 12 }}>已拥有</span>
      ) : (
        <button className="mini-btn" disabled={!bossAutoCanBuy} onClick={() => engine?.buyNexusUpgrade("nexusBossAuto")}>
          {formatNumber(bossAutoCost)} 碎片 解锁 Boss 自动攻击
        </button>
      )}
    </div>
  );

  // 未解锁：展示解锁条件与 Boss 自动攻击提前购买区
  if (!nexus.unlocked) {
    return (
      <div className="panel">
        <h3>法则彼岸（第 4 维度）</h3>
        <div className="prestige-info">
          <div>
            需要 <span className="mono">新世界 Lv{CONFIG.NEXUS.REQUIRED_NEW_WORLD}（三层跃迁全部完成）</span>
            + 持有法则碎片 ≥ <span className="mono">{formatNumber(CONFIG.NEXUS.ENTRY_SHARDS)}</span>
          </div>
          <div>
            当前：新世界 <span className="mono">Lv{newWorldLv}/{CONFIG.LEAP.SHOP.newWorld.max}</span>
            {" · "}法则碎片 <span className="mono" style={{ color: "var(--gold)" }}>{formatNumber(shards)}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-dim)" }}>
            进入后货币 = 法则碎片，并自动获得 Boss 自动攻击。
          </div>
        </div>
        {bossAutoBlock}
      </div>
    );
  }

  // 已解锁未进入：跨入彼岸 + 提前购买 Boss 自动攻击
  if (!nexus.entered) {
    return (
      <div className="panel">
        <h3>法则彼岸（第 4 维度）</h3>
        <div className="prestige-info">
          <div>法则碎片：<span className="mono" style={{ color: "var(--gold)" }}>{formatNumber(shards)}</span></div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={!canEnter} onClick={() => setConfirmEnter(true)}>
            跨入彼岸
          </button>
        </div>
        {bossAutoBlock}
        {confirmEnter && (
          <ConfirmModal
            title="确认跨入彼岸？"
            onCancel={() => setConfirmEnter(false)}
            onConfirm={() => { engine?.enterNexus(); setConfirmEnter(false); }}
            confirmText="跨入彼岸"
            danger
          >
            <p style={{ fontSize: 13, lineHeight: 1.7 }}>
              将消耗 <span className="mono" style={{ color: "var(--gold)" }}>{formatNumber(CONFIG.NEXUS.ENTRY_COST)}</span> 法则碎片，
              并重置第三层以下的一切（保留：世界核心、法则补丁、碎片、成就、统计、工具）。
            </p>
          </ConfirmModal>
        )}
      </div>
    );
  }

  // 已进入：显示当前维度与彼岸商店
  return (
    <div className="panel">
      <h3>法则彼岸（第 4 维度）</h3>
      <div className="prestige-info">
        <div>当前维度：<span className="mono">法则彼岸（第 4 维度）</span></div>
        <div>法则碎片：<span className="mono" style={{ color: "var(--gold)" }}>{formatNumber(shards)}</span></div>
        <div>
          Boss 自动攻击：<span style={{ color: "var(--green)", fontSize: 12 }}>✓ 已激活</span>
        </div>
      </div>
      <h3 style={{ marginTop: 14 }}>彼岸商店</h3>
      {NEXUS_SHOP_ORDER.map((id) => {
        const def = CONFIG.NEXUS.SHOP[id];
        const cur = nexus.purchases[id] ?? 0;
        const maxed = cur >= def.max;
        const cost = engine ? engine.nexusShopCost(id) : 0;
        const canBuy = engine?.canBuyNexus(id) ?? false;
        const autoOwned = id === "nexusBossAuto" && nexus.bossAutoAttack;
        return (
          <div className="shop-row" key={id}>
            <div>
              <div>{def.label} <span className="mono" style={{ color: "var(--text-dim)" }}>Lv{cur}/{def.max}</span></div>
              <div className="desc">{def.desc}</div>
            </div>
            {autoOwned ? (
              <span style={{ color: "var(--green)", fontSize: 12 }}>已自动获得</span>
            ) : (
              <button className="mini-btn" disabled={maxed || !canBuy} onClick={() => engine?.buyNexusUpgrade(id)}>
                {maxed ? "已满" : `${formatNumber(cost)} 碎片`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
