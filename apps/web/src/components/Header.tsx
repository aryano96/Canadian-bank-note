import { useI18n } from "../i18n/index.tsx";

interface Props {
  balance: number | null;
  sound: boolean;
  onSound: (v: boolean) => void;
  theme: string;
  onTheme: (t: string) => void;
  onHelp: () => void;
  balanceFlash: "up" | "down" | null;
}

export function Header({ balance, sound, onSound, theme, onTheme, onHelp, balanceFlash }: Props) {
  const { t, money, locale, setLocale } = useI18n();
  return (
    <header className="header">
      <div className="brand">
        <svg className="brand-mark" viewBox="-1 -1 2 2" aria-hidden="true">
          <path d="M0-1L.12-.72.32-.8.25-.36.62-.62.55-.42.85-.36.68-.15.8.02.42.12.48.3.06.24.06.62-.06.62-.06.24-.48.3-.42.12-.8.02-.68-.15-.85-.36-.55-.42-.62-.62-.25-.36-.32-.8-.12-.72Z" />
        </svg>
        <div>
          <h1 className="brand-name">Mint Rush</h1>
          <p className="brand-tag">{t("app.tagline")}</p>
        </div>
      </div>

      <div className="header-balance" aria-live="polite">
        <span className="label">{t("header.balance")}</span>
        <span className={`balance-value mono ${balanceFlash ? `flash-${balanceFlash}` : ""}`} data-testid="balance">
          {balance === null ? "…" : money(balance)}
        </span>
      </div>

      <nav className="header-actions" aria-label="Settings">
        <button className="chip" onClick={onHelp}>
          {t("header.help")}
        </button>
        <button
          className="chip"
          onClick={() => onTheme(theme === "polymer" ? "paper" : "polymer")}
          aria-label={t("header.themeLabel")}
        >
          {theme === "polymer" ? t("header.themePaper") : t("header.themePolymer")}
        </button>
        <button className="chip" onClick={() => onSound(!sound)} aria-pressed={sound}>
          {sound ? t("header.soundOn") : t("header.soundOff")}
        </button>
        <button
          className="chip chip-strong"
          onClick={() => setLocale(locale === "en" ? "fr" : "en")}
          aria-label={t("header.languageLabel")}
          lang={locale === "en" ? "fr" : "en"}
        >
          {t("header.language")}
        </button>
      </nav>
    </header>
  );
}
