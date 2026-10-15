import type { GameConfig } from "./config.ts";

export function formatMoney(minor: number, config: GameConfig, locale = "en-CA"): string {
  const { minorUnits, symbol } = config.currency;
  const value = minor / 10 ** minorUnits;
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: minorUnits,
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
