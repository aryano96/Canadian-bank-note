import type { Currency } from "@mint-rush/engine";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/index.tsx";

interface Props {
  currencies: Currency[];
  currency: string;
  balances: Record<string, number> | null;
  onChange: (code: string) => void;
  locked: boolean;
  flash: "up" | "down" | null;
  onDeposit: () => void;
}

export function CoinIcon({ currency }: { currency: Currency }) {
  return (
    <span className="coin" data-code={currency.code} aria-hidden="true">
      {currency.symbol.replace(/^[A-Z]+/, "")}
    </span>
  );
}

/** The wallet in the top bar: the selected balance, and a menu of every wallet. */
export function CurrencyPicker({ currencies, currency, balances, onChange, locked, flash, onDeposit }: Props) {
  const { t, money, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = currencies.find((c) => c.code === currency) ?? currencies[0]!;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (locked) setOpen(false);
  }, [locked]);

  const names = new Intl.DisplayNames([locale === "fr" ? "fr-CA" : "en-CA"], { type: "currency" });
  const nameOf = (c: Currency) => (c.kind === "fiat" ? names.of(c.code) ?? c.name : c.name);
  const groups = (["fiat", "crypto"] as const)
    .map((kind) => ({ kind, items: currencies.filter((c) => c.kind === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="wallet" ref={root}>
      <button
        className="wallet-select"
        onClick={() => setOpen((o) => !o)}
        disabled={locked}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t("header.balance")}: ${balances ? money(balances[selected.code] ?? 0) : "…"}. ${t("header.currency")}`}
        title={locked ? t("header.currencyLocked") : t("header.currency")}
      >
        <span className={`wallet-amount num ${flash ? `flash-${flash}` : ""}`} data-testid="balance" aria-live="polite">
          {balances ? money(balances[selected.code] ?? 0) : "…"}
        </span>
        <CoinIcon currency={selected} />
        <svg className="caret" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>
      <span className="wallet-coin" aria-hidden="true">
        {selected.code}
      </span>
      <button className="deposit-btn" onClick={onDeposit} data-testid="deposit">
        {t("header.deposit")}
      </button>

      {open && (
        <div className="wallet-menu" role="listbox" aria-label={t("header.currency")}>
          {groups.map((g) => (
            <div key={g.kind} role="group" aria-label={t(`header.${g.kind}`)}>
              <div className="wallet-menu-label">{t(`header.${g.kind}`)}</div>
              {g.items.map((c) => (
                <button
                  key={c.code}
                  role="option"
                  aria-selected={c.code === selected.code}
                  className={`wallet-option ${c.code === selected.code ? "active" : ""}`}
                  onClick={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                >
                  <CoinIcon currency={c} />
                  <span className="wallet-option-name">
                    <strong>{c.code}</strong>
                    <small>{nameOf(c)}</small>
                  </span>
                  <span className="num">{balances ? money(balances[c.code] ?? 0, c.code) : "…"}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
