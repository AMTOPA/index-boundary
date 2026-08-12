"use client";
import { useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { formatNumber } from "@/game/format";
import { CONFIG } from "@/game/config";
import type { NexusUpgradeId } from "@/game/types";
import { ConfirmModal } from "@/components/common/ConfirmModal";

const NEXUS_SHOP_ORDER: NexusUpgradeId[] = ["nexusDmg", "nexusGold", "nexusShardGain", "nexusOverflow"];

// 法则彼岸（第 4 维度）：新世界 Lv2 + 足够法则碎片后解锁，货币 = 法则碎片
export function NexusPanel() {
  const { engine } = useGame();
  const [confirmEnter, setConfirmEnter] = useState(false);
  const nexusUnlocked = useGameSelector((s) => s.nexus.unlocked);
  const nexusEntered = useGameSelector((s) => s.nexus.entered);
  const purchases = useGameSelector((s) => s.nexus.purchases);
  useGameSelector((s) => Object.entries(s.nexus.purchases).sort().join("|"));
  const newWorldLv = useGameSelector((s) => s.leap.purchases.newWorld ?? 0);
  const shards = useGameSelector((s) => s.laws.shards);
  const stage = useGameSelector((s) => s.combat.stage);
  const canEnter = engine?.canEnterNexus() ?? false;

  if (!nexusUnlocked) {
    return (
      <div className="panel">
        <h3>法则彼岸（第 4 维度）</h3>
        <div className="prestige-info">
          <div>
            需要 <span className="mono">新世界 Lv{CONFIG.NEXUS.REQUIRED_NEW_WORLD}（三层跃迁全部完成）</span>
            + 当前关卡 ≥ <span className="mono">{formatNumber(CONFIG.NEXUS.ENTRY_STAGE)}</span>
            + 持有法则碎片 ≥ <span className="mono">{formatNumber(CONFIG.NEXUS.ENTRY_SHARDS)}</span>
          </div>
          <div>
            当前：新世界 <span className="mono">Lv{newWorldLv}/{CONFIG.LEAP.SHOP.newWorld.max}</span>
            {" · "}法则碎片 <span className="mono" style={{ color: "var(--gold)" }}>{formatNumber(shards)}</span>{" · 当前关卡 "}<span className="mono">{formatNumber(stage)}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-dim)" }}>
            进入后货币 = 法则碎片；普通敌人与 Boss 共用同一套自动攻击。
          </div>
        </div>
      </div>
    );
  }

  if (!nexusEntered) {
    return (
      <div className="panel">
        <h3>法则彼岸（第 4 维度）</h3>
        <div className="prestige-info">
          <div>法则碎片：<span className="mono" style={{ color: "var(--gold)" }}>{formatNumber(shards)}</span></div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-dim)" }}>
            自动攻击已覆盖 Boss；跨入彼岸后可购买额外的维度增幅。
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={!canEnter} onClick={() => setConfirmEnter(true)}>
            跨入彼岸
          </button>
        </div>
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
              并重置第三层及以下的已购增益（世界核心升级、法则补丁等会清空）；保留未花费的世界核心/法则碎片、成就、统计、工具，以及新进入的彼岸层。
            </p>
          </ConfirmModal>
        )}
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>法则彼岸（第 4 维度）</h3>
      <div className="prestige-info">
        <div>当前维度：<span className="mono">法则彼岸（第 4 维度）</span></div>
        <div>法则碎片：<span className="mono" style={{ color: "var(--gold)" }}>{formatNumber(shards)}</span></div>
        <div>自动攻击协议：<span style={{ color: "var(--green)", fontSize: 12 }}>✓ 普通敌人与 Boss 同步运行</span></div>
      </div>
      <h3 style={{ marginTop: 14 }}>彼岸商店</h3>
      {NEXUS_SHOP_ORDER.map((id) => {
        const def = CONFIG.NEXUS.SHOP[id];
        const cur = purchases[id] ?? 0;
        const maxed = cur >= def.max;
        const cost = engine ? engine.nexusShopCost(id) : 0;
        const canBuy = engine?.canBuyNexus(id) ?? false;
        return (
          <div className="shop-row" key={id}>
            <div>
              <div>{def.label} <span className="mono" style={{ color: "var(--text-dim)" }}>Lv{cur}/{def.max}</span></div>
              <div className="desc">{def.desc}</div>
            </div>
            <button className="mini-btn" disabled={maxed || !canBuy} onClick={() => engine?.buyNexusUpgrade(id)}>
              {maxed ? "已满" : `${formatNumber(cost)} 碎片`}
            </button>
          </div>
        );
      })}
    </div>
  );
}
