"use client";
import { useEffect, useRef, useState } from "react";
import { GameProvider, useGame } from "@/components/game/GameProvider";
import { useGameSelector, useDerived } from "@/components/common/hooks";
import { SettingsPanel } from "@/components/common/SettingsPanel";
import { UpgradePanel } from "@/components/upgrade/UpgradePanel";
import { CombatArea } from "@/components/combat/CombatArea";
import { SkillPanel } from "@/components/skills/SkillPanel";
import { QuickSkillBar } from "@/components/skills/SkillBar";
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
import { formatBig, formatNumber } from "@/game/format";
import { toBig } from "@/game/bignum";
import { CONFIG } from "@/game/config";
import type { GameState } from "@/game/types";

// 主分页统一放到底部：一次只挂载当前页面，避免不可见 Canvas 和长列表继续运行。
type MainTab = "combat" | "upgrades" | "skills" | "systems";
type SystemsTab = "equip" | "inventory" | "talents" | "prestige" | "stats" | "achievements" | "items" | "account";

const NEW_PLAYER_GOAL_KEYS = ["auto_attack", "boss", "equipment", "skills", "talents", "prestige"] as const;

const MAIN_TABS: { id: MainTab; label: string; icon: string; unlockKey?: string }[] = [
  { id: "combat", label: "战斗", icon: "⚔️" },
  { id: "upgrades", label: "升级", icon: "⬆️" },
  { id: "skills", label: "技能", icon: "🔷", unlockKey: "skills" },
  { id: "systems", label: "系统", icon: "🧭" },
];

const SYS_TABS: { id: SystemsTab; label: string; icon: string; unlockKey?: string }[] = [
  { id: "stats", label: "统计", icon: "📊" },
  { id: "equip", label: "装备", icon: "🛡️", unlockKey: "equipment" },
  { id: "inventory", label: "背包", icon: "🎒", unlockKey: "equipment" },
  { id: "talents", label: "天赋", icon: "🌿", unlockKey: "talents" },
  { id: "prestige", label: "重构", icon: "🌀", unlockKey: "prestige" },
  { id: "achievements", label: "成就", icon: "🏆", unlockKey: "achievements" },
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
  const [view, setView] = useState<MainTab>("combat");
  const [tab, setTab] = useState<SystemsTab>("stats");
  const wide = useWideLayout();
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
        <TopBar view={view} />

        <div className="page-content" data-page={view}>
          {view === "combat" && (
            <main className="command-deck" aria-label="战斗指挥舱">
              <div className="command-arena">
                <CombatArea />
              </div>
              <aside className="command-console panel">
                <div className="command-console-heading">
                  <div>
                    <span className="command-kicker">COMMAND CONSOLE</span>
                    <h2>指挥控制台</h2>
                  </div>
                  <span className="command-online"><i /> 在线</span>
                </div>
                <NextUnlockHint compact />
                <QuickSkillBar embedded onManage={() => setView("skills")} />
              </aside>
            </main>
          )}

          {view === "upgrades" && (
            <main className="single-view single-view-narrow">
              <UpgradePanel />
            </main>
          )}

          {view === "skills" && (
            <main className="single-view skill-management-view">
              <SkillPanel />
            </main>
          )}

          {view === "systems" && (
            <main className="systems-view">
              <SystemNavigation activeTab={tab} onChange={setTab} />
              <div className="systems-content">
                <Panel tab={tab} wide={wide} />
              </div>
            </main>
          )}
        </div>

        <MainNavigation activeTab={view} onChange={setView} />
      </div>
    </>
  );
}

function MainNavigation({ activeTab, onChange }: { activeTab: MainTab; onChange: (tab: MainTab) => void }) {
  const unlocks = useGameSelector((state) => state.meta.unlocks.join("|"));
  const unlockedSet = new Set(unlocks ? unlocks.split("|") : []);

  return (
    <nav className="bottom-nav" aria-label="游戏主分页">
      {MAIN_TABS.map((item) => {
        const locked = item.unlockKey ? !unlockedSet.has(item.unlockKey) : false;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={activeTab === item.id ? "page" : undefined}
            aria-label={locked ? "尚未解锁的功能" : item.label}
            className={`${activeTab === item.id ? "active" : ""} ${locked ? "nav-locked" : ""}`.trim()}
            disabled={locked}
            onClick={() => onChange(item.id)}
          >
            <span className="nav-icon" aria-hidden="true">{locked ? "🔒" : item.icon}</span>
            <span className="nav-label">{locked ? "???" : item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function SystemNavigation({ activeTab, onChange }: { activeTab: SystemsTab; onChange: (tab: SystemsTab) => void }) {
  const unlocks = useGameSelector((state) => state.meta.unlocks.join("|"));
  const unlockedSet = new Set(unlocks ? unlocks.split("|") : []);

  return (
    <div className="systems-header">
      <div className="systems-heading-copy">
        <span className="systems-section-label">SYSTEM MATRIX</span>
        <strong>系统矩阵</strong>
      </div>
      <div className="systems-tabs" role="tablist" aria-label="系统功能">
        {SYS_TABS.map((item) => {
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
              <span aria-hidden="true">{locked ? "🔒" : item.icon}</span>
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

function TopBar({ view }: { view: MainTab }) {
  const { engine, reload, pushToast } = useGame();
  const [username, setUsername] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => subscribeCloud((c) => setUsername(c.user?.username ?? null)), []);
  useEffect(() => { moreRef.current?.removeAttribute("open"); }, [view]);

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
      <ResourceBar />
      <div className="top-actions">
        <details ref={moreRef} className="top-more">
          <summary className="btn small" aria-label="打开账户与存档菜单">⋯ 更多</summary>
          <div className="top-more-menu">
            <span className="account-chip">{username ? `👤 ${username}` : "未登录"}</span>
            <SettingsPanel className="top-settings-panel" />
            <button type="button" className="btn small" onClick={handleExport}>导出存档</button>
            <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>导入存档</button>
          </div>
        </details>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          tabIndex={-1}
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