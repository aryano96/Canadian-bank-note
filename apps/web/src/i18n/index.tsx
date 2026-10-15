import { formatMoney, type GameConfig } from "@mint-rush/engine";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { en, type MessageKey } from "./en.ts";
import { fr } from "./fr.ts";

/**
 * Tiny typed i18n: adding a language means adding one file that satisfies
 * Record<MessageKey, string> and listing it here and in game.config.json.
 */
const catalogs: Record<string, Record<MessageKey, string>> = { en, fr };
const intlLocale: Record<string, string> = { en: "en-CA", fr: "fr-CA" };

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

interface I18n {
  locale: string;
  setLocale: (l: string) => void;
  t: Translate;
  money: (minor: number) => string;
  mult: (hundredths: number) => string;
  percent: (ratio: number, digits?: number) => string;
  number: (n: number) => string;
}

const Ctx = createContext<I18n | null>(null);
const STORAGE_KEY = "mint-rush.locale";

function initialLocale(config: GameConfig): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && config.ui.locales.includes(saved)) return saved;
  } catch {}
  const browser = navigator.language.slice(0, 2);
  return config.ui.locales.includes(browser) ? browser : config.ui.defaultLocale;
}

export function I18nProvider({ config, children }: { config: GameConfig; children: ReactNode }) {
  const [locale, setLocaleState] = useState(() => initialLocale(config));

  const setLocale = useCallback((l: string) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {}
  }, []);

  const value = useMemo<I18n>(() => {
    const catalog = catalogs[locale] ?? en;
    const tag = intlLocale[locale] ?? locale;
    const numberFmt = new Intl.NumberFormat(tag);
    const multFmt = new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.documentElement.lang = locale;
    return {
      locale,
      setLocale,
      t: (key, vars) =>
        (catalog[key] ?? en[key]).replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`)),
      money: (minor) => formatMoney(minor, config, tag),
      mult: (h) => `${multFmt.format(h / 100)}×`,
      percent: (ratio, digits = 1) =>
        new Intl.NumberFormat(tag, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(ratio),
      number: (n) => numberFmt.format(n),
    };
  }, [locale, config, setLocale]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n outside I18nProvider");
  return ctx;
}
