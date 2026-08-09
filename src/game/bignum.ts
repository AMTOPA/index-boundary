// 自研大数（遵守全局规则：运行时零第三方依赖）
// 表示法：值 = m × 10^e，m ∈ [1,10) 或 0，e 为整数。仅支持非负数。
// 序列化：BigTuple = [m, e]

export type BigTuple = [number, number];

const ALIGN_LIMIT = 14; // 指数差超过该值时，加法直接取大者（相对误差 < 1e-14）
const MAX_SAFE_EXP = 1e15; // e 的防御上限（实际游戏远小于此）

export class Big {
  readonly m: number;
  readonly e: number;

  constructor(m: number, e: number) {
    if (!Number.isFinite(m) || !Number.isFinite(e)) throw new Error("Big: invalid input");
    if (m === 0) { this.m = 0; this.e = 0; return; }
    if (m < 0) throw new Error("Big: negative unsupported");
    let mm = m;
    let ee = Math.round(e);
    if (Math.abs(ee) > MAX_SAFE_EXP) throw new Error("Big: exponent overflow");
    while (mm >= 10) { mm /= 10; ee++; }
    while (mm > 0 && mm < 1) { mm *= 10; ee--; }
    this.m = mm;
    this.e = ee;
  }

  static ZERO = new Big(0, 0);
  static ONE = new Big(1, 0);

  static fromNumber(n: number): Big {
    if (!Number.isFinite(n) || n <= 0) return Big.ZERO;
    if (n < 0) throw new Error("Big: negative unsupported");
    return new Big(n, 0);
  }

  static fromTuple(t: BigTuple): Big {
    return new Big(t[0], t[1]);
  }

  static max(a: Big, b: Big): Big { return a.gte(b) ? a : b; }
  static min(a: Big, b: Big): Big { return a.lte(b) ? a : b; }

  toTuple(): BigTuple { return [this.m, this.e]; }
  isZero(): boolean { return this.m === 0; }

  log10(): number {
    if (this.m === 0) return -Infinity;
    return this.e + Math.log10(this.m);
  }

  toNumber(): number {
    if (this.m === 0) return 0;
    if (this.e > 308) return Infinity;
    if (this.e < -308) return 0;
    return this.m * Math.pow(10, this.e);
  }

  add(other: Big): Big {
    if (this.isZero()) return other;
    if (other.isZero()) return this;
    const diff = this.e - other.e;
    if (diff > ALIGN_LIMIT) return this;
    if (diff < -ALIGN_LIMIT) return other;
    const a = this.m * Math.pow(10, diff);
    const b = other.m;
    return new Big(a + b, other.e);
  }

  sub(other: Big): Big {
    if (other.isZero()) return this;
    if (this.isZero()) return Big.ZERO;
    const diff = this.e - other.e;
    if (diff > ALIGN_LIMIT) return this;
    if (diff < -ALIGN_LIMIT) return Big.ZERO; // 结果为负 → 截断为 0
    const a = this.m * Math.pow(10, diff);
    const b = other.m;
    const r = a - b;
    return r <= 0 ? Big.ZERO : new Big(r, other.e);
  }

  mul(other: Big): Big {
    if (this.isZero() || other.isZero()) return Big.ZERO;
    return new Big(this.m * other.m, this.e + other.e);
  }

  div(other: Big): Big {
    if (other.isZero()) throw new Error("Big: division by zero");
    if (this.isZero()) return Big.ZERO;
    return new Big(this.m / other.m, this.e - other.e);
  }

  // 实数次幂：v^x = 10^(x·log10(v))，x 可为小数（如 0.92）
  pow(x: number): Big {
    if (!Number.isFinite(x)) throw new Error("Big: invalid pow exponent");
    if (x === 0) return Big.ONE;
    if (this.isZero()) return Big.ZERO;
    const L = x * this.log10();
    if (!Number.isFinite(L) || Math.abs(L) > MAX_SAFE_EXP) return Big.ZERO;
    const e = Math.floor(L);
    const frac = L - e;
    const m = Math.pow(10, frac);
    return new Big(m, e);
  }

  floor(): Big {
    if (this.isZero()) return Big.ZERO;
    if (this.e < 0) return Big.ZERO;
    if (this.e >= 16) return this;
    return Big.fromNumber(Math.floor(this.toNumber()));
  }

  compare(other: Big): number {
    if (this.isZero() && other.isZero()) return 0;
    if (this.isZero()) return -1;
    if (other.isZero()) return 1;
    const d = this.e - other.e;
    if (d !== 0) return d > 0 ? 1 : -1;
    const dm = this.m - other.m;
    return dm === 0 ? 0 : dm > 0 ? 1 : -1;
  }

  eq(other: Big): boolean { return this.compare(other) === 0; }
  neq(other: Big): boolean { return this.compare(other) !== 0; }
  lt(other: Big): boolean { return this.compare(other) < 0; }
  lte(other: Big): boolean { return this.compare(other) <= 0; }
  gt(other: Big): boolean { return this.compare(other) > 0; }
  gte(other: Big): boolean { return this.compare(other) >= 0; }

  toString(): string {
    if (this.isZero()) return "0";
    return `${this.m.toPrecision(12)}e${this.e}`;
  }

  toJSON(): BigTuple { return this.toTuple(); }
  static fromJSON(v: unknown): Big {
    if (v instanceof Big) return v;
    if (Array.isArray(v) && v.length === 2) return Big.fromTuple([Number(v[0]), Number(v[1])]);
    if (typeof v === "number") return Big.fromNumber(v);
    return Big.ZERO;
  }
}

// 便捷函数：把“可空/可数值”统一转成 Big
export function toBig(v: Big | BigTuple | number | null | undefined): Big {
  if (v instanceof Big) return v;
  if (Array.isArray(v)) return Big.fromTuple([Number(v[0]), Number(v[1])]);
  if (typeof v === "number") return Big.fromNumber(v);
  return Big.ZERO;
}