import type { GameConfig } from "./config.ts";
import type { Hundredths } from "./multiplier.ts";

/** Every Nth round of a player's seed is a "Golden Loonie" round. */
export function isGoldenRound(nonce: number, config: GameConfig): boolean {
  return config.bonus.enabled && nonce > 0 && nonce % config.bonus.goldenRoundEvery === 0;
}

export function roundsUntilGolden(nonce: number, config: GameConfig): number | null {
  if (!config.bonus.enabled) return null;
  const every = config.bonus.goldenRoundEvery;
  const next = Math.ceil(Math.max(nonce, 1) / every) * every;
  return next - nonce;
}

/**
 * Payout in minor units, always rounded down. Golden rounds boost the profit
 * (not the stake) by `goldenMultiplierBoost`.
 */
export function computePayout(
  wager: number,
  cashOutAt: Hundredths,
  golden: boolean,
  config: GameConfig,
): { payout: number; bonus: number } {
  const base = Math.floor((wager * cashOutAt) / 100);
  if (!golden) return { payout: base, bonus: 0 };
  const profit = Math.max(0, base - wager);
  const bonus = Math.floor(profit * config.bonus.goldenMultiplierBoost);
  return { payout: base + bonus, bonus };
}
