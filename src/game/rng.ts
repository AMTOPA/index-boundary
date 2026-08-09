// 种子化随机数（mulberry32），玩法逻辑禁止直接用 Math.random（生态约定）
export class Rng {
  private a: number;

  constructor(seed: number) {
    this.a = seed >>> 0;
  }

  static fromState(a: number): Rng {
    const r = new Rng(0);
    r.a = a >>> 0;
    return r;
  }

  getState(): number {
    return this.a;
  }

  // 生成 [0,1) 浮点数
  next(): number {
    this.a |= 0;
    this.a = (this.a + 0x6d2b79f5) | 0;
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("Rng.pick: empty array");
    return arr[Math.floor(this.next() * arr.length)];
  }

  weighted<T>(items: readonly [T, number][]): T {
    let total = 0;
    for (const [, w] of items) total += w;
    if (total <= 0) throw new Error("Rng.weighted: non-positive total weight");
    let roll = this.next() * total;
    for (const [item, w] of items) {
      roll -= w;
      if (roll <= 0) return item;
    }
    return items[items.length - 1][0];
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}