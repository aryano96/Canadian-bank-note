import type { GameConfig } from "./config.ts";

/** `short` drops a crypto amount's trailing zeros (₿0.0001 rather than ₿0.00010000). */
export function formatMoney(minor: number, config: GameConfig, locale = "en-CA", short = false): string {
  const { minorUnits, symbol, kind } = config.currency;
  const value = minor / 10 ** minorUnits;
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: short && kind === "crypto" ? 0 : minorUnits,
    maximumFractionDigits: minorUnits,
  }).format(value);
  // French Canadian convention puts the symbol after the amount.
  return locale.startsWith("fr") ? `${number} ${symbol}` : `${symbol}${number}`;
}

export function toMinor(major: number, config: GameConfig): number {
  return Math.round(major * 10 ** config.currency.minorUnits);
}

export function toMajor(minor: number, config: GameConfig): number {
  return minor / 10 ** config.currency.minorUnits;
}
