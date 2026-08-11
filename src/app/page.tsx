"use client";
import { useEffect, useRef, useState } from "react";
import { GameProvider, useGame } from "@/components/game/GameProvider";
import { useGameSelector, useDerived } from "@/components/common/hooks";
import { NumberDisplay } from "@/components/common/NumberDisplay";
import { ResourceChip } from "@/components/common/ResourceChip";
import { SettingsPanel } from "@/components/common/SettingsPanel";
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
import { CONFIG } from "@/game/config";
import type { GameState } from "@/game/types";

// 双舱布局：战斗舱（主页：战斗 + 升级 + 技能）/ 系统舱（另一页：装备/背包/天赋/重构/统计/成就/道具/账户）
type View = "combat" | "systems";
type SystemsTab = "equip" | "inventory" | "talents" | "prestige" | "stats" | "achievements" | "items" | "account";
type CombatSub = "combat" | "upgrades" | "skills";

const NEW_PLAYER_GOAL_KEYS = ["auto_attack", "boss", "equipment", "skills", "talents", "prestige"] as const;

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
            <NextUnlockHint />
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
              <span className="systems-section-label">系统舱</span>
              <div className="systems-tabs" role="tablist" aria-label="系统功能">
                {SYS_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    className={`mini-btn ${tab === t.id ? "active" : ""}`}
                    onClick={() => setTab(t.id)}
                  >
                    <span aria-hidden="true">{t.icon}</span> {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="systems-content">
              <Panel tab={tab} wide={wide} />
            </div>
          </div>
        )}
        <nav className="bottom-nav" aria-label="主导航">
          <button type="button" aria-current={view === "combat" ? "page" : undefined} className={view === "combat" ? "active" : ""} onClick={() => setView("combat")}>
            <span aria-hidden="true">⚔️</span><span className="nav-label">战斗</span>
          </button>
          <button type="button" aria-current={view === "systems" ? "page" : undefined} className={view === "systems" ? "active" : ""} onClick={() => setView("systems")}>
            <span aria-hidden="true">🗂️</span><span className="nav-label">系统</span>
          </button>
        </nav>
      </div>
    </>
  );
}

function NextUnlockHint() {
  const stage = useGameSelector((s) => s.combat.stage);
  const unlocks = useGameSelector((s) => s.meta.unlocks);
  const next = CONFIG.UNLOCKS.find(
    (unlock) => NEW_PLAYER_GOAL_KEYS.includes(unlock.key as (typeof NEW_PLAYER_GOAL_KEYS)[number]) && !unlocks.includes(unlock.key),
  );

  if (!next) return null;

  const remaining = Math.max(0, next.stage - stage);
  const progress = Math.min(100, Math.max(0, (stage / next.stage) * 100));

  return (
    <aside className="next-unlock" aria-live="polite" aria-label="下一解锁目标">
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

function TopBar({ view, onToggleView }: { view: View; onToggleView: () => void }) {
  const { engine, reload, pushToast } = useGame();
  const state = useGameSelector((s) => s);
  const derived = useDerived();
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

  const unlocks = state.meta.unlocks;
  const equipmentUnlocked = unlocks.includes("equipment");
  const skillsUnlocked = unlocks.includes("skills");
  const prestigeUnlocked = unlocks.includes("prestige");
  const leapUnlocked = unlocks.includes("leap");
  const lawsUnlocked = unlocks.includes("lawRewrite");

  return (
    <header className="topbar">
      <div className="game-title">
        <span className="cn">指数边界</span>
        <span className="en">Boundless Exponent</span>
      </div>
      <div className="resources" aria-label="当前资源">
        <div className="resource resource-primary">
          <span className="label">🪙 金币</span>
          <NumberDisplay className="value gold" value={state.player.gold} />
        </div>
        <div className="resource resource-primary">
          <span className="label">🏰 关卡</span>
          <span className="value mono">{state.combat.stage}</span>
        </div>
        <div className="resource resource-primary">
          <span className="label">⚡ DPS</span>
          <NumberDisplay className="value" value={derived.dps} />
        </div>
        {equipmentUnlocked && <ResourceChip icon="💠" label="碎片" value={state.equipment.fragments} tone="frag" />}
        {skillsUnlocked && (
          <div className="resource">
            <span className="label">🔷 技能核心</span>
            <NumberDisplay className="value core" value={state.skills.cores} />
          </div>
        )}
        {prestigeUnlocked && (
          <div className="resource">
            <span className="label">🌌 奇点能量</span>
            <span className="value energy mono">{formatNumber(state.prestige.energy)}</span>
          </div>
        )}
        {leapUnlocked && (
          <div className="resource">
            <span className="label">🔮 世界核心</span>
            <span className="value mono resource-super">{formatNumber(state.leap?.cores ?? 0)}</span>
          </div>
        )}
        {lawsUnlocked && (
          <div className="resource">
            <span className="label">📜 法则碎片</span>
            <span className="value mono resource-gold">{formatNumber(state.laws?.shards ?? 0)}</span>
          </div>
        )}
      </div>
      <div className="top-actions">
        <button type="button" className="btn small systems-open" onClick={onToggleView}>
          {view === "combat" ? "🗂️ 系统 ▸" : "◂ 返回战斗"}
        </button>
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