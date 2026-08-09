"use client";
import { useEffect, useRef, useState } from "react";
import { GameProvider, useGame } from "@/components/game/GameProvider";
import { useGameSelector, useDerived } from "@/components/common/hooks";
import { NumberDisplay } from "@/components/common/NumberDisplay";
import { UpgradePanel } from "@/components/upgrade/UpgradePanel";
import { CombatArea } from "@/components/combat/CombatArea";
import { EquipPanel } from "@/components/equipment/EquipPanel";
import { TalentPanel } from "@/components/talents/TalentPanel";
import { PrestigePanel } from "@/components/prestige/PrestigePanel";
import { StatsPanel } from "@/components/stats/StatsPanel";
import { AchievementPanel } from "@/components/achievements/AchievementPanel";
import { ItemsPanel } from "@/components/items/ItemsPanel";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { LeaderboardPanel } from "@/components/leaderboard/LeaderboardPanel";
import { exportSave, importSave } from "@/game/save";
import { getCloud, subscribeCloud } from "@/game/cloud";
import { formatNumber } from "@/game/format";
import type { GameState } from "@/game/types";

type PanelTab = "equip" | "talents" | "prestige" | "stats" | "achievements" | "items" | "account";
type MobileView = "combat" | "upgrades" | "panel";

const TABS: { id: PanelTab; label: string; icon: string }[] = [
  { id: "equip", label: "装备", icon: "⚔️" },
  { id: "talents", label: "天赋", icon: "🌿" },
  { id: "prestige", label: "重构", icon: "🌀" },
  { id: "stats", label: "统计", icon: "📊" },
  { id: "achievements", label: "成就", icon: "🏆" },
  { id: "items", label: "道具", icon: "🎒" },
  { id: "account", label: "账户", icon: "👤" },
];

export default function Page() {
  return (
    <GameProvider>
      <Shell />
    </GameProvider>
  );
}

function Shell() {
  const [tab, setTab] = useState<PanelTab>("equip");
  const [mobileView, setMobileView] = useState<MobileView>("combat");
  const selectTab = (t: PanelTab) => { setTab(t); setMobileView("panel"); };
  return (
    <div className="app">
      <TopBar />
      <div className="main-grid">
        <aside className="side-left">
          <UpgradePanel />
        </aside>
        <main className={`main-col ${mobileView === "combat" ? "" : "hidden-mobile"}`}>
          <CombatArea />
        </main>
        <aside className={`side-right ${mobileView === "combat" ? "" : "visible"}`}>
          <div className="desktop-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`btn small ${tab === t.id ? "active" : ""}`} onClick={() => selectTab(t.id)}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          {mobileView === "upgrades" ? <UpgradePanel /> : <Panel tab={tab} />}
        </aside>
      </div>
      <nav className="bottom-nav">
        <button className={mobileView === "combat" ? "active" : ""} onClick={() => setMobileView("combat")}>
          <span>⚔️</span><span className="nav-label">战斗</span>
        </button>
        <button className={mobileView === "upgrades" ? "active" : ""} onClick={() => setMobileView("upgrades")}>
          <span>⬆️</span><span className="nav-label">升级</span>
        </button>
        {TABS.map((t) => (
          <button key={t.id} className={mobileView === "panel" && tab === t.id ? "active" : ""} onClick={() => selectTab(t.id)}>
            <span>{t.icon}</span><span className="nav-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Panel({ tab }: { tab: PanelTab }) {
  switch (tab) {
    case "equip": return <EquipPanel />;
    case "talents": return <TalentPanel />;
    case "prestige": return <PrestigePanel />;
    case "stats": return <StatsPanel />;
    case "achievements": return <AchievementPanel />;
    case "items": return <ItemsPanel />;
    case "account":
      return (
        <>
          <AuthPanel />
          <LeaderboardPanel />
        </>
      );
  }
}

function TopBar() {
  const { engine, reload, pushToast } = useGame();
  const state = useGameSelector((s) => s);
  const derived = useDerived();
  const [username, setUsername] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => subscribeCloud((c) => setUsername(c.user?.username ?? null)), []);

  function handleExport() {
    if (!engine) return;
    const text = exportSave(engine.state);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `index-boundary-save-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast("存档已导出");
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const imported = importSave(text);
      if (!imported) {
        pushToast("导入失败：存档无效", "danger");
        return;
      }
      reload(imported as GameState);
      pushToast("存档已导入");
    };
    reader.readAsText(file);
  }

  return (
    <header className="topbar">
      <div className="resources">
        <div className="resource">
          <span className="label">金币</span>
          <NumberDisplay className="value gold" value={state.player.gold} />
        </div>
        <div className="resource">
          <span className="label">碎片</span>
          <NumberDisplay className="value frag" value={state.equipment.fragments} />
        </div>
        <div className="resource">
          <span className="label">技能核心</span>
          <NumberDisplay className="value core" value={state.skills.cores} />
        </div>
        <div className="resource">
          <span className="label">奇点能量</span>
          <span className="value energy mono">{formatNumber(state.prestige.energy)}</span>
        </div>
        <div className="resource">
          <span className="label">关卡</span>
          <span className="value mono">{state.combat.stage}</span>
        </div>
        <div className="resource">
          <span className="label">DPS</span>
          <NumberDisplay className="value" value={derived.dps} />
        </div>
      </div>
      <div className="top-actions">
        <span className="account-chip">{username ? `👤 ${username}` : "未登录"}</span>
        <button className="btn small" onClick={handleExport}>导出存档</button>
        <button className="btn small" onClick={() => fileRef.current?.click()}>导入存档</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </header>
  );
}