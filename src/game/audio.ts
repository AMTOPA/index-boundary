// WebAudio 合成音效（零音频资产）
let ctx: AudioContext | null = null;
let enabled = true;

export function setAudioEnabled(v: boolean): void {
  enabled = v;
}

export function initAudio(): void {
  if (!ctx && typeof window !== "undefined") {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, gain = 0.12, delay = 0, slideTo?: number): void {
  if (!ctx || !enabled) return;
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
  if (!ctx || !enabled) return;
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
  if (!ctx || !enabled) return;
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