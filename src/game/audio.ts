// Lightweight WebAudio sound effects. Audio is created only after an explicit user gesture.
let ctx: AudioContext | null = null;
let enabled = false;
const lastPlayedAt: Partial<Record<SfxName, number>> = {};

const SFX_COOLDOWN_MS: Partial<Record<SfxName, number>> = {
  click: 25,
  kill: 40,
  crit: 45,
  superCrit: 70,
  crush: 90,
  drop: 80,
  upgrade: 45,
};

export function setAudioEnabled(value: boolean): void {
  enabled = value;
}

/**
 * Unlock WebAudio from a pointer/keyboard handler. Calling this during page load is
 * intentionally a no-op until sound is enabled and a caller supplies a user gesture.
 */
export async function initAudio(): Promise<boolean> {
  if (!enabled || typeof window === "undefined") return false;

  if (!ctx) {
    const AudioContextCtor = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return false;
    ctx = new AudioContextCtor();
  }

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === "running";
}

function tone(freq: number, dur: number, type: OscillatorType, gain = 0.12, delay = 0, slideTo?: number): void {
  if (!ctx || !enabled || ctx.state !== "running") return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.1, delay = 0): void {
  if (!ctx || !enabled || ctx.state !== "running") return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(g).connect(ctx.destination);
  src.start(t0);
}

export type SfxName =
  | "click" | "kill" | "crit" | "superCrit" | "crush" | "boss" | "bossKill"
  | "upgrade" | "unlock" | "prestige" | "milestone" | "error" | "drop";

export function playSfx(name: SfxName): void {
  if (!ctx || !enabled || ctx.state !== "running") return;

  const now = performance.now();
  const cooldown = SFX_COOLDOWN_MS[name] ?? 0;
  if (cooldown > 0 && now - (lastPlayedAt[name] ?? -Infinity) < cooldown) return;
  lastPlayedAt[name] = now;

  switch (name) {
    case "click": tone(880, 0.04, "square", 0.03); break;
    case "kill": tone(440, 0.06, "triangle", 0.05); break;
    case "crit": tone(1200, 0.09, "square", 0.07, 0, 1600); break;
    case "superCrit": tone(1500, 0.12, "square", 0.09, 0, 2200); tone(900, 0.1, "triangle", 0.05, 0.02); break;
    case "crush": noise(0.12, 0.12); tone(200, 0.15, "sawtooth", 0.08, 0, 80); break;
    case "boss": tone(330, 0.18, "sawtooth", 0.08); tone(220, 0.22, "sawtooth", 0.08, 0.16); break;
    case "bossKill": tone(523, 0.12, "square", 0.08); tone(659, 0.12, "square", 0.08, 0.12); tone(784, 0.18, "square", 0.08, 0.24); break;
    case "upgrade": tone(660, 0.08, "sine", 0.07, 0, 990); break;
    case "unlock": tone(523, 0.1, "triangle", 0.08); tone(784, 0.14, "triangle", 0.08, 0.1); break;
    case "prestige": tone(400, 0.6, "sawtooth", 0.1, 0, 60); noise(0.5, 0.06); break;
    case "milestone": tone(523, 0.12, "square", 0.09); tone(659, 0.12, "square", 0.09, 0.12); tone(1046, 0.3, "square", 0.09, 0.24); break;
    case "error": tone(180, 0.12, "square", 0.05); break;
    case "drop": tone(980, 0.08, "sine", 0.06, 0, 1300); break;
  }
}
