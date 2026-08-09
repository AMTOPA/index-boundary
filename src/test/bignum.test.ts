import { describe, it, expect } from "vitest";
import { Big, toBig } from "../game/bignum";

describe("Big", () => {
  it("add aligns exponents", () => {
    const a = new Big(1, 12); // 1e12
    const b = new Big(5, 14); // 5e14
    const r = a.add(b).toNumber();
    expect(r).toBeGreaterThan(5e14);
    expect(r).toBeLessThan(5.1e14);
  });

  it("mul and div", () => {
    const a = Big.fromNumber(1.5);
    const b = Big.fromNumber(2);
    expect(a.mul(b).toNumber()).toBeCloseTo(3, 10);
    expect(Big.fromNumber(9).div(Big.fromNumber(4)).toNumber()).toBeCloseTo(2.25, 10);
  });

  it("pow", () => {
    expect(Big.fromNumber(2).pow(10).toNumber()).toBeCloseTo(1024, 8);
    const sqrt1000 = new Big(1, 3).pow(0.5).toNumber();
    expect(sqrt1000).toBeGreaterThan(31.6);
    expect(sqrt1000).toBeLessThan(31.7);
  });

  it("log10", () => {
    expect(new Big(1, 3).log10()).toBeCloseTo(3, 10);
    expect(Big.fromNumber(100).log10()).toBeCloseTo(2, 10);
    expect(Big.ZERO.log10()).toBe(Number.NEGATIVE_INFINITY);
  });

  it("floor", () => {
    expect(Big.fromNumber(12.7).floor().toNumber()).toBe(12);
    expect(Big.fromNumber(12).floor().toNumber()).toBe(12);
  });

  it("compare / lt / gte", () => {
    expect(new Big(1, 12).compare(new Big(5, 14))).toBe(-1);
    expect(new Big(5, 14).compare(new Big(1, 12))).toBe(1);
    expect(new Big(5, 14).gte(new Big(5, 14))).toBe(true);
    expect(new Big(1, 12).lt(new Big(5, 14))).toBe(true);
  });

  it("JSON roundtrip", () => {
    const a = new Big(3.14, 25);
    const back = Big.fromJSON(JSON.parse(JSON.stringify(a)));
    expect(back.e).toBe(a.e);
    expect(back.m).toBeCloseTo(a.m, 10);
    expect(toBig(null).isZero()).toBe(true);
    expect(toBig([1, 5]).toNumber()).toBe(1e5);
  });

  it("handles huge exponents without overflow", () => {
    const a = new Big(1, 300); // 1e300
    const b = a.mul(a); // 1e600
    expect(b.e).toBe(600);
    expect(b.log10()).toBeCloseTo(600, 8);
  });
});