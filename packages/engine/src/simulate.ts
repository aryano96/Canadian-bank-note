import type { GameConfig } from "./config.ts";
import { crashPointFromUniform } from "./fairness.ts";
import type { Hundredths } from "./multiplier.ts";
import { computePayout, isGoldenRound } from "./payout.ts";

export interface SimulationResult {
  rounds: number;
  target: Hundredths;
  wins: number;
  winRate: number;
  rtp: number;
  theoreticalRtp: number;
  instantCrashRate: number;
  medianCrash: Hundredths;
  distribution: { bucket: string; share: number }[];
}

const BUCKETS: [string, number][] = [
  ["1.00x", 101],
  ["1.01-1.99x", 200],
  ["2-4.99x", 500],
  ["5-9.99x", 1000],
  ["10-99.99x", 10000],
  ["100x+", Infinity],
];

/**
 * Exact long-run return for "always cash out at target", including the
 * Golden Loonie profit boost on every Nth round.
 */
export function theoreticalRtp(target: Hundredths, config: GameConfig): number {
  const base = 1 - config.rng.houseEdge;
  if (!config.bonus.enabled) return base;
  const t = target / 100;
  const goldenShare = 1 / config.bonus.goldenRoundEvery;
  return base * (1 + goldenShare * config.bonus.goldenMultiplierBoost * ((t - 1) / t));
}

/**
 * Monte Carlo check of the configured economy: always cash out at `target`.
 * `random` is injectable so tests can be deterministic.
 */
export function simulate(
  rounds: number,
  target: Hundredths,
  config: GameConfig,
  random: () => number = Math.random,
): SimulationResult {
  const wager = 100;
  let returned = 0;
  let wins = 0;
  let instant = 0;
  const counts = new Array(BUCKETS.length).fill(0) as number[];
  const sample: number[] = [];

  for (let i = 1; i <= rounds; i++) {
    const crash = crashPointFromUniform(random(), config);
    if (crash === 100) instant++;
    const idx = BUCKETS.findIndex(([, upper]) => crash < upper);
    counts[idx]!++;
    if (i <= 10_000) sample.push(crash);
    if (target <= crash) {
      wins++;
      returned += computePayout(wager, target, isGoldenRound(i, config), config).payout;
    }
  }

  sample.sort((a, b) => a - b);
  return {
    rounds,
    target,
    wins,
    winRate: wins / rounds,
    rtp: returned / (rounds * wager),
    theoreticalRtp: theoreticalRtp(target, config),
    instantCrashRate: instant / rounds,
    medianCrash: sample[Math.floor(sample.length / 2)] ?? 100,
    distribution: BUCKETS.map(([bucket], i) => ({ bucket, share: counts[i]! / rounds })),
  };
}

/** Small seeded PRNG (mulberry32) for reproducible simulations. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
