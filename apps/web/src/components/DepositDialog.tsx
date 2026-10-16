import { toMajor, toMinor, type GameConfig } from "@mint-rush/engine";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/index.tsx";

interface Props {
  open: boolean;
  config: GameConfig;
  onClose: () => void;
  /** Resolves true once the server has credited the wallet. */
  onDeposit: (amount: number) => Promise<boolean>;
}

const parse = (text: string) => Number(text.replace(",", ".")) || 0;

/** Adds demo credits to the selected wallet. Amounts and the limit come from the config. */
export function DepositDialog({ open, config, onClose, onDeposit }: Props) {
  const { t, money, moneyShort } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const { depositPresets, maxDeposit } = config.account;
  const fixed = (minor: number) => toMajor(minor, config).toFixed(config.currency.minorUnits);
  const [text, setText] = useState(() => fixed(depositPresets[1] ?? depositPresets[0]!));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setText(fixed(depositPresets[1] ?? depositPresets[0]!));
      d.showModal();
    }
    if (!open && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, config.currency.code]);

  const amount = toMinor(parse(text), config);
  const valid = amount >= 1 && amount <= maxDeposit;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onDeposit(amount);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <dialog ref={ref} className="help deposit" onClose={onClose} aria-labelledby="deposit-title">
      <h2 id="deposit-title">{t("deposit.title")}</h2>
      <p className="hint">{t("deposit.body", { currency: config.currency.code })}</p>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="deposit-amount">{t("deposit.amount")}</label>
        <div className={`input-group ${valid ? "" : "invalid"}`}>
          <div className="input-wrap">
            <input
              id="deposit-amount"
              className="num"
              inputMode="decimal"
              value={text}
              autoFocus
              onChange={(e) => setText(e.target.value.replace(/[^0-9.,]/g, ""))}
              aria-describedby="deposit-limit"
            />
            <span className="input-adorn">{config.currency.symbol}</span>
          </div>
        </div>
        <div className="presets">
          {depositPresets.map((p) => (
            <button type="button" key={p} className={`preset ${p === amount ? "active" : ""}`} onClick={() => setText(fixed(p))}>
              {moneyShort(p)}
            </button>
          ))}
        </div>
        <p id="deposit-limit" className={`hint ${valid ? "" : "hint-error"}`}>
          {t("deposit.limit", { amount: money(maxDeposit) })}
        </p>
        <div className="dialog-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            {t("deposit.cancel")}
          </button>
          <button type="submit" className="primary-action small" disabled={!valid || busy} data-testid="deposit-confirm">
            {t("deposit.confirm", { amount: money(valid ? amount : 0) })}
          </button>
        </div>
      </form>
    </dialog>
  );
}
