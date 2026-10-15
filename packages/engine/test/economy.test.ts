import { describe, expect, it } from "vitest";
import { parseConfig, seededRandom, simulate } from "../src/index.ts";
import { loadConfig } from "./helpers.ts";

describe("economy", () => {
  const config = loadConfig((c) => {
    c.bonus.enabled = false;
  });

  it.each([110, 200, 500, 1000])("RTP is ~(1 - edge) when always cashing out at %i", (target) => {
    const result = simulate(400_000, target, config, seededRandom(target));
    expect(result.rtp).toBeGreaterThan(0.99 - 0.03);
    expect(result.rtp).toBeLessThan(0.99 + 0.03);
  });

  it("instant crash rate matches theory", () => {
    const result = simulate(400_000, 200, config, seededRandom(1));
    // P(crash < 1.01) = 1 - 0.99 / 1.01
    expect(result.instantCrashRate).toBeCloseTo(1 - 0.99 / 1.01, 2);
  });

  it("follows a changed house edge", () => {
    const greedy = loadConfig((c) => {
      c.bonus.enabled = false;
      c.rng.houseEdge = 0.05;
    });
    const result = simulate(400_000, 200, greedy, seededRandom(9));
    expect(result.rtp).toBeCloseTo(0.95, 1);
  });
});

describe("golden rounds", () => {
  it("simulation matches the exact RTP including the bonus", () => {
    const config = loadConfig();
    const result = simulate(400_000, 200, config, seededRandom(42));
    expect(result.theoreticalRtp).toBeCloseTo(0.99 * (1 + 0.1 * 0.1 * 0.5), 6);
    expect(Math.abs(result.rtp - result.theoreticalRtp)).toBeLessThan(0.01);
  });
});

describe("config validation", () => {
  it("rejects nonsense with a readable message", () => {
    const bad = loadConfig((c) => {
      c.betting.minBet = 10_000_000;
    });
    expect(() => parseConfig(bad)).toThrow(/minBet must be <= betting.maxBet/);
  });
});
