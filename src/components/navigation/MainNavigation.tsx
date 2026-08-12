"use client";

export type MainTab = "items" | "talents" | "equipment" | "combat" | "prestige" | "challenge" | "settings";

interface MainNavigationProps {
  activeTab: MainTab;
  unlocks: readonly string[];
  onChange: (tab: MainTab) => void;
}

const MAIN_TABS: ReadonlyArray<{ id: MainTab; label: string; unlockKey?: string }> = [
  { id: "items", label: "道具" },
  { id: "talents", label: "天赋", unlockKey: "talents" },
  { id: "equipment", label: "装备", unlockKey: "equipment" },
  { id: "combat", label: "战斗" },
  { id: "prestige", label: "重构", unlockKey: "prestige" },
  { id: "challenge", label: "挑战", unlockKey: "prestige" },
  { id: "settings", label: "设置" },
];

export function MainNavigation({ activeTab, unlocks, onChange }: MainNavigationProps) {
  const unlockedSet = new Set(unlocks);

  return (
    <nav className="bottom-nav command-dock" aria-label="游戏主分页">
      {MAIN_TABS.map((item) => {
        const locked = item.unlockKey ? !unlockedSet.has(item.unlockKey) : false;
        const isCombat = item.id === "combat";
        const className = [
          activeTab === item.id ? "active" : "",
          locked ? "nav-locked" : "",
          isCombat ? "nav-combat-core" : "",
        ].filter(Boolean).join(" ");

        return (
          <button
            key={item.id}
            type="button"
            data-nav-id={item.id}
            aria-current={activeTab === item.id ? "page" : undefined}
            aria-label={locked ? "尚未解锁的功能" : item.label}
            className={className}
            disabled={locked}
            onClick={() => onChange(item.id)}
          >
            <span className="nav-icon" aria-hidden="true">
              {locked ? <span className="nav-question">?</span> : <NavIcon id={item.id} />}
            </span>
            <span className="nav-label">{locked ? "???" : item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function NavIcon({ id }: { id: MainTab }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (id) {
    case "items":
      return <svg {...common}><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M12 11v10M8 5l8 4" /></svg>;
    case "talents":
      return <svg {...common}><path d="M12 21V9" /><path d="M12 12 7 7M12 16l6-6M12 9l1-5 4 2-5 3ZM7 7 3 8l1 4 3-5ZM18 10l3 1-1 4-2-5Z" /><circle cx="12" cy="21" r="1.4" fill="currentColor" stroke="none" /></svg>;
    case "equipment":
      return <svg {...common}><path d="m12 3 7 3v5c0 4.6-2.8 8.2-7 10-4.2-1.8-7-5.4-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
    case "combat":
      return <svg {...common}><circle cx="12" cy="12" r="6.8" /><circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19" /></svg>;
    case "prestige":
      return <svg {...common}><path d="M7.2 8.2a6 6 0 1 1-.4 7.6" /><path d="m6.5 4.5.7 4.1 4-1.1" /><path d="M16.8 15.8a6 6 0 1 1 .4-7.6" /><path d="m17.5 19.5-.7-4.1-4 1.1" /></svg>;
    case "challenge":
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.4" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><path d="m17.7 6.3 2.2-2.2M6.3 17.7l-2.2 2.2" /></svg>;
    case "settings":
      return <svg {...common}><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" /><circle cx="12" cy="12" r="4.2" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></svg>;
  }
}
