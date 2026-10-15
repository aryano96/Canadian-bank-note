import type { GameConfig } from "./config.ts";

/**
 * Multipliers are stored as integer hundredths (1.00x === 100) so that
 * comparisons and payouts are exact. The curve is exponential and speeds
 * up as it climbs (t in seconds):
 *   m(t) = e^(rate * t + acceleration * t^2)
 */
export type Hundredths = number;

export const ONE_X: Hundredths = 100;

/** The unrounded curve value (1.0 at the start), for drawing. */
export function curveAt(elapsedMs: number, config: GameConfig): number {
  if (elapsedMs <= 0) return 1;
  const s = elapsedMs / 1000;
  const { growthRatePerSecond: rate, accelerationPerSecond2: accel } = config.timing;
  return Math.exp(rate * s + accel * s * s);
}

export function multiplierAt(elapsedMs: number, config: GameConfig): Hundredths {
  if (elapsedMs <= 0) return ONE_X;
  return Math.max(ONE_X, Math.floor(curveAt(elapsedMs, config) * 100 + 1e-9));
}

/** Milliseconds after round start at which the curve first reaches `multiplier`. */
export function elapsedFor(multiplier: Hundredths, config: GameConfig): number {
  if (multiplier <= ONE_X) return 0;
  const { growthRatePerSecond: rate, accelerationPerSecond2: accel } = config.timing;
  const target = Math.log(multiplier / 100);
  // Solve accel·s² + rate·s − target = 0 for the positive root.
  const s = accel > 0 ? (2 * target) / (rate + Math.sqrt(rate * rate + 4 * accel * target)) : target / rate;
  return s * 1000;
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
