"use client";
import { useEffect, useRef, useState } from "react";
import { GameProvider, useGame } from "@/components/game/GameProvider";
import { useGameSelector, useDerived } from "@/components/common/hooks";
import { NumberDisplay } from "@/components/common/NumberDisplay";
import { ResourceChip } from "@/components/common/ResourceChip";
import { UpgradePanel } from "@/components/upgrade/UpgradePanel";
import { CombatArea } from "@/components/combat/CombatArea";
import { SkillPanel } from "@/components/skills/SkillPanel";
import { EquipPanel } from "@/components/equipment/EquipPanel";
import { InventoryPanel } from "@/components/equipment/InventoryPanel";
import { TalentPanel } from "@/components/talents/TalentPanel";
import { PrestigePanel } from "@/components/prestige/PrestigePanel";
import { StatsPanel } from "@/components/stats/StatsPanel";
import { AchievementPanel } from "@/components/achievements/AchievementPanel";
import { ItemsPanel } from "@/components/items/ItemsPanel";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { LeaderboardPanel } from "@/components/leaderboard/LeaderboardPanel";
import { exportSave, importSave } from "@/game/save";
import { Starfield } from "@/components/combat/Starfield";
import { worldForStage } from "@/game/data/worlds";
import { subscribeCloud } from "@/game/cloud";
import { formatNumber } from "@/game/format";
import type { GameState } from "@/game/types";

// 双舱布局：战斗舱（主页：战斗 + 升级 + 技能）/ 系统舱（另一页：装备/背包/天赋/重构/统计/成就/道具/账户）
type View = "combat" | "systems";
type SystemsTab = "equip" | "inventory" | "talents" | "prestige" | "stats" | "achievements" | "items" | "account";
type CombatSub = "combat" | "upgrades" | "skills";

const SYS_TABS: { id: SystemsTab; label: string; icon: string }[] = [
  { id: "equip", label: "装备", icon: "⚔️" },
  { id: "inventory", label: "背包", icon: "🎒" },
  { id: "talents", label: "天赋", icon: "🌿" },
  { id: "prestige", label: "重构", icon: "🌀" },
  { id: "stats", label: "统计", icon: "📊" },
  { id: "achievements", label: "成就", icon: "🏆" },
  { id: "items", label: "道具", icon: "📦" },
  { id: "account", label: "账户", icon: "👤" },
];

export default function Page() {
  return (
    <GameProvider>
      <Shell />
    </GameProvider>
  );
}

function useWideLayout(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const fn = () => setWide(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return wide;
}

function Shell() {
  const [view, setView] = useState<View>("combat");
  const [tab, setTab] = useState<SystemsTab>("equip");
  const [sub, setSub] = useState<CombatSub>("combat");
  const wide = useWideLayout();
  const toggleView = () => setView((v) => (v === "combat" ? "systems" : "combat"));
  const gridSub = sub === "upgrades" ? "sub-upgrades" : sub === "skills" ? "sub-skills" : "sub-combat";
  const worldTint = useGameSelector((s) => worldForStage(s.combat.stage, s.leap?.purchases?.newWorld ?? 0, s.nexus?.entered ?? false, s.echo?.entered ?? false).color);
  return (
    <>
      <Starfield tint={worldTint} />
      <div className="app">
        <TopBar view={view} onToggleView={toggleView} />
        {view === "combat" ? (
          <>
            <div className="combat-sub-nav">
              {([
                ["combat", "⚔️ 战斗"],
                ["upgrades", "⬆️ 升级"],
                ["skills", "🔷 技能"],
              ] as [CombatSub, string][]).map(([id, label]) => (
                <button key={id} className={`mini-btn ${sub === id ? "active" : ""}`} onClick={() => setSub(id)}>
                  {label}
                </button>
              ))}
            </div>
            <div className={`main-grid ${gridSub}`}>
              <aside className="side-left">
                <UpgradePanel />
              </aside>
              <main className="main-col">
                <CombatArea />
              </main>
              <aside className="side-right">
                <SkillPanel />
              </aside>
            </div>
          </>
        ) : (
          <div className="systems-view">
            <div className="systems-header">
              <button className="btn small" onClick={toggleView}>◂ 返回战斗</button>
              <div className="systems-tabs">
                {SYS_TABS.map((t) => (
                  <button key={t.id} className={`mini-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="systems-content">
              <Panel tab={tab} wide={wide} />
            </div>
          </div>
        )}
        <nav className="bottom-nav">
          <button className={view === "combat" ? "active" : ""} onClick={() => setView("combat")}>
            <span>⚔️</span><span className="nav-label">战斗</span>
          </button>
          <button className={view === "systems" ? "active" : ""} onClick={() => setView("systems")}>
            <span>🗂️</span><span className="nav-label">系统</span>
          </button>
        </nav>
      </div>
    </>
  );
}

function Panel({ tab, wide }: { tab: SystemsTab; wide?: boolean }) {
  switch (tab) {
    case "equip": return <EquipPanel wide={wide} />;
    case "inventory": return <InventoryPanel />;
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

function TopBar({ view, onToggleView }: { view: View; onToggleView: () => void }) {
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
      <div className="game-title">
        <span className="cn">指数边界</span>
        <span className="en">Boundless Exponent</span>
      </div>
      <div className="resources">
        <div className="resource">
          <span className="label">🪙 金币</span>
          <NumberDisplay className="value gold" value={state.player.gold} />
        </div>
        <ResourceChip icon="💠" label="碎片" value={state.equipment.fragments} tone="frag" />
        <div className="resource">
          <span className="label">🔷 技能核心</span>
          <NumberDisplay className="value core" value={state.skills.cores} />
        </div>
        <div className="resource">
          <span className="label">🌌 奇点能量</span>
          <span className="value energy mono">{formatNumber(state.prestige.energy)}</span>
        </div>
        <div className="resource">
          <span className="label">🔮 世界核心</span>
          <span className="value mono" style={{ color: "var(--super)" }}>{formatNumber(state.leap?.cores ?? 0)}</span>
        </div>
        <div className="resource">
          <span className="label">📜 法则碎片</span>
          <span className="value mono" style={{ color: "var(--gold)" }}>{formatNumber(state.laws?.shards ?? 0)}</span>
        </div>
        <div className="resource">
          <span className="label">🏰 关卡</span>
          <span className="value mono">{state.combat.stage}</span>
        </div>
        <div className="resource">
          <span className="label">⚡ DPS</span>
          <NumberDisplay className="value" value={derived.dps} />
        </div>
      </div>
      <div className="top-actions">
        <span className="account-chip">{username ? `👤 ${username}` : "未登录"}</span>
        <button className="btn small systems-open" onClick={onToggleView}>
          {view === "combat" ? "🗂️ 系统 ▸" : "◂ 返回战斗"}
        </button>
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