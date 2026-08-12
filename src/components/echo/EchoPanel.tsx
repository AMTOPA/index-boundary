"use client";
import { useState } from "react";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import { formatNumber } from "@/game/format";
import { CONFIG } from "@/game/config";
import type { EchoUpgradeId } from "@/game/types";
import { ConfirmModal } from "@/components/common/ConfirmModal";

const ECHO_SHOP_ORDER: EchoUpgradeId[] = ["echoDmg", "echoGold", "echoSealGain", "echoOverflow"];

// 超维回响（第 5 维度）：进入彼岸后收集足够「回响印记」解锁，货币 = 回响印记
export function EchoPanel() {
  const { engine } = useGame();
  const [confirmEnter, setConfirmEnter] = useState(false);
  const echoUnlocked = useGameSelector((s) => s.echo.unlocked);
  const entered = useGameSelector((s) => s.echo.entered);
  const seals = useGameSelector((s) => s.echo.seals);
  const totalSealsEarned = useGameSelector((s) => s.echo.totalSealsEarned);
  const purchases = useGameSelector((s) => s.echo.purchases);
  useGameSelector((s) => Object.entries(s.echo.purchases).sort().join("|"));
  const nexusEntered = useGameSelector((s) => s.nexus.entered);
  const stage = useGameSelector((s) => s.combat.stage);
  const canEnter = engine?.canEnterEcho() ?? false;

  // 未解锁：展示解锁条件
  if (!echoUnlocked) {
    return (
      <div className="panel">
        <h3>超维回响（第 5 维度）</h3>
        <div className="prestige-info">
          <div>
            需要 <span className="mono">已进入法则彼岸</span>
            {" + 当前关卡 ≥ "}<span className="mono">{formatNumber(CONFIG.ECHO.ENTRY_STAGE)}</span>
            {" + 累计回响印记 ≥ "}<span className="mono">{formatNumber(CONFIG.ECHO.ENTRY_SEALS)}</span>
            {" + 当前持有 ≥ "}<span className="mono">{formatNumber(CONFIG.ECHO.ENTRY_COST)}</span>
          </div>
          <div>
            当前：彼岸 <span style={{ color: nexusEntered ? "var(--green)" : "var(--text-dim)", fontSize: 12 }}>
              {nexusEntered ? "✓ 已进入" : "未进入"}
            </span>
            {" · 累计回响印记 "}
            <span className="mono" style={{ color: "var(--accent)" }}>{formatNumber(totalSealsEarned)}</span>
            {" · 当前持有 "}<span className="mono">{formatNumber(seals)}</span>
            {" · 当前关卡 "}<span className="mono">{formatNumber(stage)}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-dim)" }}>
            在彼岸世界（第 {formatNumber(CONFIG.ECHO.SEAL_MIN_STAGE)} 关起）击杀 Boss / 精英会掉落回响印记；
            进入后货币 = 回响印记。
          </div>
        </div>
      </div>
    );
  }

  // 已解锁未进入
  if (!entered) {
    return (
      <div className="panel">
        <h3>超维回响（第 5 维度）</h3>
        <div className="prestige-info">
          <div>回响印记：<span className="mono" style={{ color: "var(--accent)" }}>{formatNumber(seals)}</span>（累计 {formatNumber(totalSealsEarned)}）</div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={!canEnter} onClick={() => setConfirmEnter(true)}>
            跨入超维回响
          </button>
        </div>
        {confirmEnter && (
          <ConfirmModal
            title="确认跨入超维回响？"
            onCancel={() => setConfirmEnter(false)}
            onConfirm={() => { engine?.enterEcho(); setConfirmEnter(false); }}
            confirmText="跨入回响"
            danger
          >
            <p style={{ fontSize: 13, lineHeight: 1.7 }}>
              将消耗 <span className="mono" style={{ color: "var(--accent)" }}>{formatNumber(CONFIG.ECHO.ENTRY_COST)}</span> 回响印记，
              并重置第四层及以下的已购增益（世界核心升级、法则补丁、彼岸升级会清空）；保留各层未花费货币、回响印记、成就、统计、工具，以及新进入的回响层。
            </p>
          </ConfirmModal>
        )}
      </div>
    );
  }

  // 已进入：回响商店
  return (
    <div className="panel">
      <h3>超维回响（第 5 维度）</h3>
      <div className="prestige-info">
        <div>当前维度：<span className="mono">超维回响（第 5 维度）</span></div>
        <div>回响印记：<span className="mono" style={{ color: "var(--accent)" }}>{formatNumber(seals)}</span></div>
        <div>自动攻击协议：<span style={{ color: "var(--green)", fontSize: 12 }}>✓ 普通敌人与 Boss 同步运行</span></div>
      </div>
      <h3 style={{ marginTop: 14 }}>回响商店</h3>
      {ECHO_SHOP_ORDER.map((id) => {
        const def = CONFIG.ECHO.SHOP[id];
        const cur = purchases[id] ?? 0;
        const maxed = cur >= def.max;
        const cost = engine ? engine.echoShopCost(id) : 0;
        const canBuy = engine?.canBuyEcho(id) ?? false;
        return (
          <div className="shop-row" key={id}>
            <div>
              <div>{def.label} <span className="mono" style={{ color: "var(--text-dim)" }}>Lv{cur}/{def.max}</span></div>
              <div className="desc">{def.desc}</div>
            </div>
            <button className="mini-btn" disabled={maxed || !canBuy} onClick={() => engine?.buyEchoUpgrade(id)}>
              {maxed ? "已满" : `${formatNumber(cost)} 印记`}
            </button>
          </div>
        );
      })}
    </div>
  );
}
