"use client";
import { initAudio } from "@/game/audio";
import { useGame } from "@/components/game/GameProvider";
import { useGameSelector } from "@/components/common/hooks";
import styles from "./SettingsPanel.module.css";

interface SettingsPanelProps {
  className?: string;
}

export function SettingsPanel({ className }: SettingsPanelProps) {
  const { updateSettings } = useGame();
  const sound = useGameSelector((state) => state.meta.settings.sound);
  const reduceMotion = useGameSelector((state) => state.meta.settings.reduceMotion);
  const animationFps = useGameSelector((state) => state.meta.settings.animationFps ?? 60);

  const setSound = (next: boolean) => {
    updateSettings({ sound: next });
    if (next) void initAudio();
  };

  return (
    <section className={[styles.panel, className].filter(Boolean).join(" ")} aria-labelledby="game-settings-title">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>ACCESSIBILITY &amp; AUDIO</p>
          <h2 id="game-settings-title" className={styles.title}>游戏设置</h2>
        </div>
        <span className={styles.saved}>自动保存</span>
      </div>

      <label className={styles.settingRow}>
        <span className={styles.copy}>
          <span className={styles.label}>声音</span>
          <span className={styles.description}>启用升级、暴击、Boss 与系统解锁音效</span>
        </span>
        <input
          className={styles.nativeToggle}
          type="checkbox"
          checked={sound}
          onChange={(event) => setSound(event.currentTarget.checked)}
        />
        <span className={styles.switch} aria-hidden="true"><span /></span>
      </label>

      <div className={`${styles.settingRow} ${styles.segmentedRow}`}>
        <span className={styles.copy}>
          <span className={styles.label}>视觉帧率</span>
          <span className={styles.description}>仅调整画布与粒子动画流畅度，不改变逻辑 TPS、战斗速度或收益</span>
        </span>
        <div className={styles.fpsControl} role="radiogroup" aria-label="视觉帧率">
          {([30, 60, 120] as const).map((fps) => (
            <button
              key={fps}
              className={styles.fpsOption}
              type="button"
              role="radio"
              aria-checked={animationFps === fps}
              data-active={animationFps === fps}
              onClick={() => updateSettings({ animationFps: fps })}
            >
              {fps}
            </button>
          ))}
        </div>
      </div>

      <label className={styles.settingRow}>
        <span className={styles.copy}>
          <span className={styles.label}>减弱动效</span>
          <span className={styles.description}>减少闪烁、过渡和循环动画，降低视觉干扰与耗电</span>
        </span>
        <input
          className={styles.nativeToggle}
          type="checkbox"
          checked={reduceMotion}
          onChange={(event) => updateSettings({ reduceMotion: event.currentTarget.checked })}
        />
        <span className={styles.switch} aria-hidden="true"><span /></span>
      </label>
    </section>
  );
}
