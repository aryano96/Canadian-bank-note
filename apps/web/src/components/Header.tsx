import type { Currency } from "@mint-rush/engine";
import { useI18n } from "../i18n/index.tsx";
import { CurrencyPicker } from "./CurrencyPicker.tsx";

interface Props {
  currencies: Currency[];
  currency: string;
  balances: Record<string, number> | null;
  onCurrency: (code: string) => void;
  currencyLocked: boolean;
  sound: boolean;
  onSound: (v: boolean) => void;
  theme: string;
  onTheme: (t: string) => void;
  onHelp: () => void;
  balanceFlash: "up" | "down" | null;
}

export function Header({ currencies, currency, balances, onCurrency, currencyLocked, sound, onSound, theme, onTheme, onHelp, balanceFlash }: Props) {
  const { t, locale, setLocale } = useI18n();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <svg className="brand-mark" viewBox="-1 -1 2 2" aria-hidden="true">
            <path d="M0-1L.12-.72.32-.8.25-.36.62-.62.55-.42.85-.36.68-.15.8.02.42.12.48.3.06.24.06.62-.06.62-.06.24-.48.3-.42.12-.8.02-.68-.15-.85-.36-.55-.42-.62-.62-.25-.36-.32-.8-.12-.72Z" />
          </svg>
          <h1 className="brand-name">Mint Rush</h1>
        </div>

        <CurrencyPicker
          currencies={currencies}
          currency={currency}
          balances={balances}
          onChange={onCurrency}
          locked={currencyLocked}
          flash={balanceFlash}
        />

        <nav className="header-actions" aria-label="Settings">
          <button className="ghost-btn" onClick={onHelp}>
            {t("header.help")}
          </button>
          <button className="ghost-btn" onClick={() => onTheme(theme === "paper" ? "night" : "paper")} aria-label={t("header.themeLabel")}>
            {theme === "paper" ? t("header.themeNight") : t("header.themePaper")}
          </button>
          <button className="ghost-btn" onClick={() => onSound(!sound)} aria-pressed={sound}>
            {sound ? t("header.soundOn") : t("header.soundOff")}
          </button>
          <button
            className="ghost-btn strong"
            onClick={() => setLocale(locale === "en" ? "fr" : "en")}
            aria-label={t("header.languageLabel")}
            lang={locale === "en" ? "fr" : "en"}
          >
            {t("header.language")}
          </button>
        </nav>
      </div>
    </header>
  );
}
