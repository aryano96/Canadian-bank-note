import { describe, expect, it } from "vitest";
import { cashOut, elapsedFor, evaluate, multiplierAt, type RoundState } from "../src/index.ts";
import { loadConfig } from "./helpers.ts";

const config = loadConfig();

const round = (over: Partial<RoundState> = {}): RoundState => ({
  wager: 1000,
  crashPoint: 250,
  startedAt: 1_000_000,
  autoCashOut: null,
  golden: false,
  ...over,
});

describe("multiplier curve", () => {
  it("starts at 1.00x and round-trips with elapsedFor", () => {
    expect(multiplierAt(0, config)).toBe(100);
    for (const m of [101, 150, 200, 1000, 50000]) {
      expect(multiplierAt(elapsedFor(m, config) + 0.01, config)).toBe(m);
      expect(multiplierAt(elapsedFor(m, config) - 0.01, config)).toBe(m - 1);
    }
  });

  it("climbs faster the longer it runs", () => {
    const step = (from: number, to: number) => elapsedFor(to, config) - elapsedFor(from, config);
    // Each doubling takes less time than the one before.
    expect(step(200, 400)).toBeLessThan(step(100, 200));
    expect(step(400, 800)).toBeLessThan(step(200, 400));
    // With no acceleration every doubling takes the same time.
    const flat = { ...config, timing: { ...config.timing, accelerationPerSecond2: 0 } };
    expect(elapsedFor(400, flat) - elapsedFor(200, flat)).toBeCloseTo(elapsedFor(200, flat), 6);
  });
});

describe("settlement", () => {
  it("is running before the crash and lost after", () => {
    const r = round();
    const crashAt = r.startedAt + elapsedFor(r.crashPoint, config);
    expect(evaluate(r, crashAt - 1, config).status).toBe("running");
    expect(evaluate(r, crashAt, config)).toMatchObject({ status: "lost", payout: 0 });
  });

  it("pays wager x current multiplier on a manual cash-out", () => {
    const r = round();
    const at = r.startedAt + elapsedFor(200, config) + 1;
    expect(cashOut(r, at, config)).toMatchObject({ status: "won", cashOutAt: 200, payout: 2000 });
  });

  it("returns the stake when cashing out instantly", () => {
    const r = round();
    expect(cashOut(r, r.startedAt, config)).toMatchObject({ status: "won", payout: 1000 });
  });

  it("refuses a cash-out after the crash", () => {
    const r = round();
    expect(cashOut(r, r.startedAt + 60_000, config).status).toBe("lost");
  });

  it("instant-crash rounds can never be won", () => {
    const r = round({ crashPoint: 100 });
    expect(cashOut(r, r.startedAt, config).status).toBe("lost");
  });

  it("fires auto cash-out at the target, even when settled late", () => {
    const r = round({ autoCashOut: 180 });
    expect(evaluate(r, r.startedAt + 60_000, config)).toMatchObject({ status: "won", cashOutAt: 180, payout: 1800 });
    // A manual request after the auto point still gets the auto result.
    expect(cashOut(r, r.startedAt + elapsedFor(240, config), config)).toMatchObject({ cashOutAt: 180 });
  });

  it("auto cash-out exactly at the crash point is a win", () => {
    const r = round({ autoCashOut: 250 });
    expect(evaluate(r, r.startedAt + 60_000, config)).toMatchObject({ status: "won", cashOutAt: 250 });
  });

  it("auto cash-out above the crash point loses", () => {
    const r = round({ autoCashOut: 300 });
    expect(evaluate(r, r.startedAt + 60_000, config).status).toBe("lost");
  });

  it("boosts profit on golden rounds", () => {
    const r = round({ golden: true, autoCashOut: 200 });
    // profit 1000, +10% = 100 bonus
    expect(evaluate(r, r.startedAt + 60_000, config)).toMatchObject({ payout: 2100, bonus: 100 });
  });
});
