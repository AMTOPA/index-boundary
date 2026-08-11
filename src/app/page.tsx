"use client";
import { useRef, useState } from "react";
import { GameProvider, useGame } from "@/components/game/GameProvider";
import { useGameSelector, useDerived } from "@/components/common/hooks";
import { SettingsPanel } from "@/components/common/SettingsPanel";
import { UpgradePanel } from "@/components/upgrade/UpgradePanel";
import { CombatArea } from "@/components/combat/CombatArea";
import { SkillPanel } from "@/components/skills/SkillPanel";
import { QuickSkillBar } from "@/components/skills/SkillBar";
import { EquipPanel } from "@/components/equipment/EquipPanel";
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
import { formatBig, formatNumber } from "@/game/format";
import { toBig } from "@/game/bignum";
import { CONFIG } from "@/game/config";
import type { GameState } from "@/game/types";
import { MainNavigation, type MainTab } from "@/components/navigation/MainNavigation";

// 高频操作统一放到底部主导航；升级嵌入战斗页，技能管理由战斗页快捷入口打开。
type MainView = MainTab | "skills";
type SettingsTab = "settings" | "stats" | "achievements" | "account";

const NEW_PLAYER_GOAL_KEYS = ["auto_attack", "boss", "equipment", "skills", "talents", "prestige"] as const;

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: string; unlockKey?: string }[] = [
  { id: "settings", label: "设置与存档", icon: "⚙️" },
  { id: "stats", label: "统计", icon: "📊" },
  { id: "achievements", label: "成就", icon: "🏆", unlockKey: "achievements" },
  { id: "account", label: "账户与排行", icon: "👤" },
];

export default function Page() {
  return (
    <GameProvider>
      <Shell />
    </GameProvider>
  );
}

function Shell() {
  const [view, setView] = useState<MainView>("combat");
  const unlockMask = useGameSelector((state) => `${state.meta.unlocks.join("|")}::${state.meta.discoveries.join("|")}`);
  const unlocks = Array.from(new Set(unlockMask.split("::").flatMap((part) => part ? part.split("|") : [])));
  const worldTint = useGameSelector((state) => worldForStage(
    state.combat.stage,
    state.leap?.purchases?.newWorld ?? 0,
    state.nexus?.entered ?? false,
    state.echo?.entered ?? false,
  ).color);

  return (
    <>
      <Starfield tint={worldTint} active={view === "combat"} />
      <div className="app">
        <TopBar />

        <div className="page-content" data-page={view}>
          {view === "combat" && (
            <main className="battle-deck" aria-label="战斗指挥舱">
              <div className="command-arena">
                <CombatArea />
              </div>
              <UpgradePanel embedded />
              <section className="command-console panel">
                <div className="command-console-heading">
                  <div>
                    <span className="command-kicker">COMMAND CONSOLE</span>
                    <h2>指挥控制台</h2>
                  </div>
                  <span className="command-online"><i /> 在线</span>
                </div>
                <NextUnlockHint compact />
                <QuickSkillBar embedded onManage={() => setView("skills")} />
              </section>
            </main>
          )}

          {view === "skills" && (
            <main className="single-view skill-management-view">
              <div className="view-return-bar">
                <button type="button" className="btn small" onClick={() => setView("combat")}>← 返回战斗</button>
                <span>技能管理</span>
              </div>
              <SkillPanel />
            </main>
          )}

          {view === "talents" && (
            <main className="single-view talent-management-view">
              <TalentPanel />
            </main>
          )}

          {view === "equipment" && (
            <main className="single-view equipment-management-view">
              <EquipPanel />
            </main>
          )}

          {view === "items" && (
            <main className="single-view items-management-view">
              <ItemsPanel />
            </main>
          )}

          {view === "prestige" && (
            <main className="single-view prestige-view prestige-management-view">
              <PrestigePanel section="prestige" />
            </main>
          )}

          {view === "challenge" && (
            <main className="single-view challenge-view challenge-management-view">
              <PrestigePanel section="challenge" />
            </main>
          )}

          {view === "settings" && <SettingsHub />}
        </div>

        <MainNavigation activeTab={view === "skills" ? "combat" : view} unlocks={unlocks} onChange={setView} />
      </div>
    </>
  );
}

function SettingsNavigation({ activeTab, onChange }: { activeTab: SettingsTab; onChange: (tab: SettingsTab) => void }) {
  const unlocks = useGameSelector((state) => state.meta.unlocks.join("|"));
  const unlockedSet = new Set(unlocks ? unlocks.split("|") : []);

  return (
    <div className="systems-header">
      <div className="systems-heading-copy">
        <span className="systems-section-label">SYSTEM & ARCHIVE</span>
        <strong>设置中心</strong>
      </div>
      <div className="systems-tabs" role="tablist" aria-label="设置中心分类">
        {SETTINGS_TABS.map((item) => {
          const locked = item.unlockKey ? !unlockedSet.has(item.unlockKey) : false;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activeTab === item.id}
              aria-label={locked ? "尚未解锁的系统" : item.label}
              className={`mini-btn ${activeTab === item.id ? "active" : ""} ${locked ? "system-tab-locked" : ""}`.trim()}
              disabled={locked}
              onClick={() => onChange(item.id)}
            >
              <span aria-hidden="true">{locked ? "❓" : item.icon}</span>
              <span>{locked ? "???" : item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NextUnlockHint({ compact = false }: { compact?: boolean }) {
  const stage = useGameSelector((s) => s.combat.stage);
  const unlocks = useGameSelector((s) => s.meta.unlocks);
  const next = CONFIG.UNLOCKS.find(
    (unlock) => NEW_PLAYER_GOAL_KEYS.includes(unlock.key as (typeof NEW_PLAYER_GOAL_KEYS)[number]) && !unlocks.includes(unlock.key),
  );

  if (!next) return null;

  const remaining = Math.max(0, next.stage - stage);
  const progress = Math.min(100, Math.max(0, (stage / next.stage) * 100));

  return (
    <aside className={`next-unlock ${compact ? "next-unlock-compact" : ""}`.trim()} aria-live="polite" aria-label="下一解锁目标">
      <div className="next-unlock-copy">
        <span className="next-unlock-kicker">下一目标</span>
        <strong>{next.label}</strong>
        <span className="next-unlock-distance">
          {remaining > 0 ? `还需 ${remaining} 关` : "即将解锁"}
        </span>
      </div>
      <div className="next-unlock-progress" role="progressbar" aria-valuemin={0} aria-valuemax={next.stage} aria-valuenow={Math.min(stage, next.stage)}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <span className="next-unlock-stage mono">{Math.min(stage, next.stage)} / {next.stage}</span>
    </aside>
  );
}

function SettingsHub() {
  const [tab, setTab] = useState<SettingsTab>("settings");

  return (
    <main className="settings-view systems-view">
      <SettingsNavigation activeTab={tab} onChange={setTab} />
      <div className="systems-content">
        <SettingsContent tab={tab} />
      </div>
    </main>
  );
}

function SettingsContent({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case "settings":
      return (
        <>
          <SettingsPanel />
          <SaveManagement />
        </>
      );
    case "stats": return <StatsPanel />;
    case "achievements": return <AchievementPanel />;
    case "account":
      return (
        <>
          <AuthPanel />
          <LeaderboardPanel />
        </>
      );
  }
}

function SaveManagement() {
  const { engine, reload, pushToast } = useGame();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    if (!engine) return;
    const text = exportSave(engine.state);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `index-boundary-save-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    pushToast("存档已导出");
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const imported = importSave(String(reader.result ?? ""));
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
    <section className="panel" aria-labelledby="save-management-title">
      <h3 id="save-management-title">账户与本地存档</h3>
      <p style={{ fontSize: 13, color: "var(--text-dim)" }}>导出备份或导入已有存档。云存档登录与排行榜位于“账户与排行”。</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="btn primary" onClick={handleExport}>导出存档</button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>导入存档</button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="visually-hidden"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleImportFile(file);
          event.target.value = "";
        }}
      />
    </section>
  );
}

function ResourceBar() {
  const gold = useGameSelector((state) => formatBig(toBig(state.player.gold)));
  const stage = useGameSelector((state) => state.combat.stage);
  const fragments = useGameSelector((state) => formatBig(toBig(state.equipment.fragments)));
  const cores = useGameSelector((state) => formatBig(toBig(state.skills.cores)));
  const energy = useGameSelector((state) => formatNumber(state.prestige.energy));
  const worldCores = useGameSelector((state) => formatNumber(state.leap?.cores ?? 0));
  const lawShards = useGameSelector((state) => formatNumber(state.laws?.shards ?? 0));
  const unlockMask = useGameSelector((state) => {
    const unlocked = state.meta.unlocks;
    return (unlocked.includes("equipment") ? 1 : 0)
      | (unlocked.includes("skills") ? 2 : 0)
      | (unlocked.includes("prestige") ? 4 : 0)
      | (unlocked.includes("leap") ? 8 : 0)
      | (unlocked.includes("lawRewrite") ? 16 : 0);
  });
  const derived = useDerived();

  return (
    <div className="resources" aria-label="当前资源">
      <div className="resource resource-primary"><span className="label">🪙 金币</span><span className="value gold mono">{gold}</span></div>
      <div className="resource resource-primary"><span className="label">🏰 关卡</span><span className="value mono">{stage}</span></div>
      <div className="resource resource-primary"><span className="label">⚡ DPS</span><span className="value mono">{formatBig(derived.dps)}</span></div>
      {(unlockMask & 1) !== 0 && <div className="resource"><span className="label">💠 碎片</span><span className="value frag mono">{fragments}</span></div>}
      {(unlockMask & 2) !== 0 && <div className="resource"><span className="label">🔷 技能核心</span><span className="value core mono">{cores}</span></div>}
      {(unlockMask & 4) !== 0 && <div className="resource"><span className="label">🌌 奇点能量</span><span className="value energy mono">{energy}</span></div>}
      {(unlockMask & 8) !== 0 && <div className="resource"><span className="label">🔮 世界核心</span><span className="value mono resource-super">{worldCores}</span></div>}
      {(unlockMask & 16) !== 0 && <div className="resource"><span className="label">📜 法则碎片</span><span className="value mono resource-gold">{lawShards}</span></div>}
    </div>
  );
}

function TopBar() {
  return (
    <header className="topbar">
      <div className="game-title">
        <span className="cn">指数边界</span>
        <span className="en">Boundless Exponent</span>
      </div>
      <ResourceBar />
    </header>
  );
}
