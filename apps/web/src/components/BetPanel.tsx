import { computePayout, toMajor, toMinor, type GameConfig } from "@mint-rush/engine";
import { useEffect, useState } from "react";
import type { PlayerState, PublicRound } from "../api/types.ts";
import type { Phase } from "../game/useGame.ts";
import { useI18n } from "../i18n/index.tsx";
import { usePref } from "../lib/prefs.ts";

interface Props {
  config: GameConfig;
  player: PlayerState | null;
  phase: Phase;
  round: PublicRound | null;
  live: number;
  onBet: (wager: number, auto: number | null) => void;
  onCashOut: () => void;
  onTopUp: () => void;
  registerPrimary: (fn: () => void) => void;
}

export function BetPanel({ config, player, phase, round, live, onBet, onCashOut, onTopUp, registerPrimary }: Props) {
  const { t, money, mult } = useI18n();
  const { betting, currency } = config;
  const [wagerText, setWagerText] = usePref(
    "wager",
    toMajor(betting.presets[1] ?? betting.minBet, config).toFixed(currency.minorUnits),
  );
  const [autoOn, setAutoOn] = usePref("autoOn", false);
  const [autoText, setAutoText] = usePref("auto", "2.00");
  const [touched, setTouched] = useState(false);

  const wager = toMinor(Number(wagerText.replace(",", ".")) || 0, config);
  const auto = Number(autoText.replace(",", "."));
  const balance = player?.balance ?? 0;
  const maxWager = Math.min(betting.maxBet, balance);

  const wagerError =
    wager < betting.minBet ? "error.BET_TOO_SMALL" : wager > betting.maxBet ? "error.BET_TOO_LARGE" : wager > balance ? "error.INSUFFICIENT_FUNDS" : null;
  const autoError = autoOn && !(auto >= betting.minAutoCashOut && auto <= config.rng.maxMultiplier);

  const running = phase === "running" && round?.status === "running";
  const canBet = (phase === "idle" || phase === "result") && !wagerError && !autoError && player !== null;
  const broke = player !== null && balance < betting.minBet && !running;

  const setWager = (minor: number) => {
    setTouched(true);
    const clamped = Math.max(betting.minBet, Math.min(minor, betting.maxBet));
    setWagerText(toMajor(clamped, config).toFixed(currency.minorUnits));
  };

  const primary = () => {
    if (running) onCashOut();
    else if (canBet) onBet(wager, autoOn ? auto : null);
  };
  useEffect(() => {
    registerPrimary(primary);
  });

  let label: string;
  if (phase === "placing") label = t("bet.placing");
  else if (phase === "cashing") label = t("bet.cashingOut");
  else if (running) label = t("bet.cashOut", { amount: money(computePayout(round!.wager, live, round!.golden, config).payout) });
  else label = t("bet.place");

  const goldenHint =
    player?.nextRoundGolden ? t("bet.goldenNext") : player?.roundsUntilGolden ? t("bet.goldenIn", { count: player.roundsUntilGolden }) : null;

  return (
    <section className="panel bet-panel" aria-label={t("bet.wager")}>
      <div className="field">
        <label htmlFor="wager">{t("bet.wager")}</label>
        <div className={`input-row ${touched && wagerError ? "invalid" : ""}`}>
          <span className="input-prefix">{currency.symbol}</span>
          <input
            id="wager"
            className="mono"
            inputMode="decimal"
            value={wagerText}
            disabled={running}
            onChange={(e) => {
              setTouched(true);
              setWagerText(e.target.value.replace(/[^0-9.,]/g, ""));
            }}
            aria-invalid={Boolean(touched && wagerError)}
            aria-describedby="wager-hint"
          />
          <button className="mini" disabled={running} onClick={() => setWager(Math.floor(wager / 2))} aria-label={t("bet.halfLabel")}>
            {t("bet.half")}
          </button>
          <button className="mini" disabled={running} onClick={() => setWager(wager * 2)} aria-label={t("bet.doubleLabel")}>
            {t("bet.double")}
          </button>
          <button className="mini" disabled={running} onClick={() => setWager(maxWager)} aria-label={t("bet.maxLabel")}>
            {t("bet.max")}
          </button>
        </div>
        <div className="presets">
          {betting.presets.map((p) => (
            <button key={p} className={`preset ${p === wager ? "active" : ""}`} disabled={running} onClick={() => setWager(p)}>
              {money(p)}
            </button>
          ))}
        </div>
        <p id="wager-hint" className={`hint ${touched && wagerError ? "hint-error" : ""}`}>
          {touched && wagerError ? t(wagerError) : t("bet.limits", { min: money(betting.minBet), max: money(betting.maxBet) })}
        </p>
      </div>

      <div className="field">
        <div className="toggle-row">
          <label htmlFor="auto-toggle">{t("bet.auto")}</label>
          <button
            id="auto-toggle"
            role="switch"
            aria-checked={autoOn}
            className={`switch ${autoOn ? "on" : ""}`}
            disabled={running}
            onClick={() => setAutoOn(!autoOn)}
          >
            <span />
          </button>
        </div>
        <div className={`input-row ${autoOn ? "" : "muted"} ${autoError ? "invalid" : ""}`}>
          <input
            id="auto"
            className="mono"
            inputMode="decimal"
            value={autoText}
            disabled={!autoOn || running}
            onChange={(e) => setAutoText(e.target.value.replace(/[^0-9.,]/g, ""))}
            aria-label={t("bet.auto")}
            aria-describedby="auto-hint"
          />
          <span className="input-suffix">x</span>
          {[1.5, 2, 5, 10].map((v) => (
            <button key={v} className="mini" disabled={!autoOn || running} onClick={() => setAutoText(v.toFixed(2))}>
              {mult(v * 100)}
            </button>
          ))}
        </div>
        <p id="auto-hint" className={`hint ${autoError ? "hint-error" : ""}`}>
          {autoError ? t("error.INVALID_AUTO_CASH_OUT", { min: mult(betting.minAutoCashOut * 100) }) : t("bet.autoHint")}
        </p>
      </div>

      <button
        className={`primary-action ${running ? "cash" : ""} ${round?.golden && running ? "golden" : ""}`}
        onClick={primary}
        disabled={!running && !canBet}
        data-testid="primary-action"
      >
        {label}
      </button>
      <p className="hint center">{t("bet.shortcut")}</p>

      {goldenHint && <p className={`golden-hint ${player?.nextRoundGolden ? "next" : ""}`}>{goldenHint}</p>}

      {broke && (
        <button className="topup" onClick={onTopUp}>
          {t("bet.topUp", { amount: money(config.account.topUpAmount) })}
        </button>
      )}
    </section>
  );
}
