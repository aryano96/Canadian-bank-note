import type { GameConfig } from "./config.ts";

/**
 * Multipliers are stored as integer hundredths (1.00x === 100) so that
 * comparisons and payouts are exact. The curve is exponential:
 *   m(t) = e^(rate * t)
 */
export type Hundredths = number;

export const ONE_X: Hundredths = 100;

export function multiplierAt(elapsedMs: number, config: GameConfig): Hundredths {
  if (elapsedMs <= 0) return ONE_X;
  const raw = Math.exp((config.timing.growthRatePerSecond * elapsedMs) / 1000);
  return Math.max(ONE_X, Math.floor(raw * 100 + 1e-9));
}

/** Milliseconds after round start at which the curve first reaches `multiplier`. */
export function elapsedFor(multiplier: Hundredths, config: GameConfig): number {
  if (multiplier <= ONE_X) return 0;
  return (Math.log(multiplier / 100) / config.timing.growthRatePerSecond) * 1000;
}

export function toHundredths(multiplier: number): Hundredths {
  return Math.round(multiplier * 100);
}

export function fromHundredths(h: Hundredths): number {
  return h / 100;
}

export function formatMultiplier(h: Hundredths): string {
  return `${(h / 100).toFixed(2)}x`;
}
