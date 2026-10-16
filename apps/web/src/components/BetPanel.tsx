import { computePayout, toMajor, toMinor, type GameConfig } from "@mint-rush/engine";
import { useEffect, useRef, useState } from "react";
import type { PlayerView, PublicRound } from "../api/types.ts";
import type { Phase } from "../game/useGame.ts";
import { useI18n } from "../i18n/index.tsx";
import { usePref } from "../lib/prefs.ts";
import { LoonieMeter } from "./LoonieMeter.tsx";

interface Props {
  config: GameConfig;
  player: PlayerView | null;
  phase: Phase;
  round: PublicRound | null;
  live: number;
  onBet: (wager: number, auto: number | null) => void;
  onCashOut: () => void;
  onTopUp: () => void;
  registerPrimary: (fn: () => void) => void;
}

type Mode = "manual" | "auto";
type Adjust = "reset" | "increase";

/** Delay between autobet rounds, so each result is readable before the next starts. */
const AUTOBET_GAP_MS = 900;

const parse = (text: string) => Number(text.replace(",", ".")) || 0;

export function BetPanel({ config, player, phase, round, live, onBet, onCashOut, onTopUp, registerPrimary }: Props) {
  const { t, money, moneyShort, mult } = useI18n();
  const { betting, currency } = config;
  const [mode, setMode] = usePref("betMode", "manual") as unknown as [Mode, (m: Mode) => void];
  // Amounts are remembered per currency; the panel remounts when the currency changes.
  const [wagerText, setWagerText] = usePref(
    `wager.${currency.code}`,
    toMajor(betting.presets[1] ?? betting.minBet, config).toFixed(currency.minorUnits),
  );
  const [targetOn, setTargetOn] = usePref("autoOn", false);
  const [targetText, setTargetText] = usePref("auto", "2.00");
  const [touched, setTouched] = useState(false);

  // Autobet settings.
  const [countText, setCountText] = usePref("autoCount", "10");
  const [onWin, setOnWin] = usePref("autoOnWin", "reset") as unknown as [Adjust, (a: Adjust) => void];
  const [onWinPct, setOnWinPct] = usePref("autoOnWinPct", "0");
  const [onLoss, setOnLoss] = usePref("autoOnLoss", "reset") as unknown as [Adjust, (a: Adjust) => void];
  const [onLossPct, setOnLossPct] = usePref("autoOnLossPct", "0");
  const [stopProfitText, setStopProfitText] = usePref(`autoStopProfit.${currency.code}`, "0");
  const [stopLossText, setStopLossText] = usePref(`autoStopLoss.${currency.code}`, "0");
  const [autobet, setAutobet] = useState<{ remaining: number | null; startBalance: number; baseWager: number } | null>(null);

  const wager = toMinor(parse(wagerText), config);
  const target = parse(targetText);
  const balance = player?.balance ?? 0;
  const maxWager = Math.min(betting.maxBet, balance);
  const useTarget = mode === "auto" || targetOn;

  const wagerError =
    wager < betting.minBet
      ? "error.BET_TOO_SMALL"
      : wager > betting.maxBet
        ? "error.BET_TOO_LARGE"
        : wager > balance
          ? "error.INSUFFICIENT_FUNDS"
          : null;
  const targetError = useTarget && !(target >= betting.minAutoCashOut && target <= config.rng.maxMultiplier);

  const running = phase === "running" && round?.status === "running";
  const idle = phase === "idle" || phase === "result";
  const canBet = idle && !wagerError && !targetError && player !== null;
  const broke = player !== null && balance < betting.minBet && !running;
  const locked = running || autobet !== null || phase === "placing";

  const profitOnWin = useTarget && !targetError ? computePayout(wager, Math.round(target * 100), false, config).payout - wager : 0;

  const setWager = (minor: number) => {
    setTouched(true);
    const clamped = Math.max(betting.minBet, Math.min(minor, betting.maxBet));
    setWagerText(toMajor(clamped, config).toFixed(currency.minorUnits));
  };

  // ---- autobet loop -------------------------------------------------------
  const betRef = useRef(onBet);
  betRef.current = onBet;
  const autoRounds = useRef(new Set<string>());
  const handled = useRef(new Set<string>());

  const stopAutobet = () => setAutobet(null);

  const startAutobet = () => {
    if (!canBet) return;
    const count = Math.max(0, Math.floor(parse(countText)));
    setAutobet({ remaining: count === 0 ? null : count, startBalance: balance, baseWager: wager });
    betRef.current(wager, target);
  };

  // Remember which rounds autobet started.
  useEffect(() => {
    if (autobet && round?.status === "running") autoRounds.current.add(round.id);
  }, [autobet, round?.id, round?.status]);

  // When an autobet round settles: adjust the wager, check stop rules, queue the next bet.
  useEffect(() => {
    // A cashed-out round plays on to its crash point; the next autobet waits for it.
    if (!autobet || !round || round.status === "running" || !player || phase === "watching") return;
    if (!autoRounds.current.has(round.id) || handled.current.has(round.id)) return;
    handled.current.add(round.id);

    const won = round.status === "won";
    const rule = won ? onWin : onLoss;
    const pct = parse(won ? onWinPct : onLossPct);
    let next = rule === "reset" ? autobet.baseWager : Math.floor(round.wager * (1 + pct / 100));
    next = Math.max(betting.minBet, Math.min(next, betting.maxBet));

    const remaining = autobet.remaining === null ? null : autobet.remaining - 1;
    const profit = player.balance - autobet.startBalance;
    const stopProfit = toMinor(parse(stopProfitText), config);
    const stopLoss = toMinor(parse(stopLossText), config);
    const done =
      remaining === 0 ||
      (stopProfit > 0 && profit >= stopProfit) ||
      (stopLoss > 0 && -profit >= stopLoss) ||
      next > player.balance;

    setWager(next);
    if (done) return setAutobet(null);
    setAutobet({ ...autobet, remaining });
    const timer = window.setTimeout(() => betRef.current(next, target), AUTOBET_GAP_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id, round?.status, autobet === null, phase === "watching"]);

  // ---- primary action -------------------------------------------------------
  const primary = () => {
    if (mode === "auto") return autobet ? stopAutobet() : startAutobet();
    if (running) return onCashOut();
    if (canBet) onBet(wager, targetOn ? target : null);
  };
  useEffect(() => {
    registerPrimary(primary);
  });

  let label: string;
  if (phase === "placing") label = t("bet.placing");
  else if (phase === "cashing") label = t("bet.cashingOut");
  else if (phase === "watching" && mode === "manual") label = t("bet.waitNext");
  else if (running && mode === "manual") label = t("bet.cashOut", { amount: money(computePayout(round!.wager, live, round!.golden, config).payout) });
  else if (mode === "auto") label = autobet ? t("auto.stop") : t("auto.start");
  else label = player?.nextRoundGolden ? t("bet.placeGolden") : t("bet.place");

  const primaryClass =
    phase === "watching" && mode === "manual"
      ? "waiting"
      : running && mode === "manual"
      ? round?.golden
        ? "golden"
        : "cash"
      : mode === "auto" && autobet
        ? "stop"
        : !running && player?.nextRoundGolden
          ? "golden-next"
          : "";
  const primaryDisabled = mode === "auto" ? !autobet && !canBet : !running && !canBet;

  return (
    <section className="bet-panel" aria-label={t("bet.wager")}>
      <div className="mode-tabs" role="tablist" aria-label={t("bet.wager")}>
        {(["manual", "auto"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? "active" : ""}
            disabled={locked}
            onClick={() => setMode(m)}
          >
            {m === "manual" ? t("bet.modeManual") : t("bet.modeAuto")}
          </button>
        ))}
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor="wager">{t("bet.amount")}</label>
          <span className="field-aside num">{money(wager)}</span>
        </div>
        <div className={`input-group ${touched && wagerError ? "invalid" : ""}`}>
          <div className="input-wrap">
            <input
              id="wager"
              className="num"
              inputMode="decimal"
              value={wagerText}
              disabled={locked}
              onChange={(e) => {
                setTouched(true);
                setWagerText(e.target.value.replace(/[^0-9.,]/g, ""));
              }}
              aria-invalid={Boolean(touched && wagerError)}
              aria-describedby="wager-hint"
            />
            <span className="input-adorn">{currency.symbol}</span>
          </div>
          <button className="group-btn" disabled={locked} onClick={() => setWager(Math.floor(wager / 2))} aria-label={t("bet.halfLabel")}>
            {t("bet.half")}
          </button>
          <button className="group-btn" disabled={locked} onClick={() => setWager(wager * 2)} aria-label={t("bet.doubleLabel")}>
            {t("bet.double")}
          </button>
          <button className="group-btn" disabled={locked} onClick={() => setWager(maxWager)} aria-label={t("bet.maxLabel")}>
            {t("bet.max")}
          </button>
        </div>
        <div className="presets">
          {betting.presets.map((p) => (
            <button key={p} className={`preset ${p === wager ? "active" : ""}`} disabled={locked} onClick={() => setWager(p)}>
              {moneyShort(p)}
            </button>
          ))}
        </div>
        {touched && wagerError && (
          <p id="wager-hint" className="hint hint-error">
            {t(wagerError)}
          </p>
        )}
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor="target">{t("bet.cashoutAt")}</label>
          {mode === "manual" && (
            <button
              role="switch"
              aria-checked={targetOn}
              aria-label={t("bet.auto")}
              className={`switch ${targetOn ? "on" : ""}`}
              disabled={locked}
              onClick={() => setTargetOn(!targetOn)}
            >
              <span />
            </button>
          )}
        </div>
        <div className={`input-group ${useTarget ? "" : "muted"} ${targetError ? "invalid" : ""}`}>
          <div className="input-wrap">
            <input
              id="target"
              className="num"
              inputMode="decimal"
              value={targetText}
              disabled={!useTarget || locked}
              onChange={(e) => setTargetText(e.target.value.replace(/[^0-9.,]/g, ""))}
              aria-describedby="target-hint"
            />
            <span className="input-adorn">×</span>
          </div>
          <button
            className="group-btn"
            disabled={!useTarget || locked}
            onClick={() => setTargetText(Math.max(betting.minAutoCashOut, target - 0.5).toFixed(2))}
            aria-label="−0.5"
          >
            ‹
          </button>
          <button
            className="group-btn"
            disabled={!useTarget || locked}
            onClick={() => setTargetText(Math.min(config.rng.maxMultiplier, (target || 1) + 0.5).toFixed(2))}
            aria-label="+0.5"
          >
            ›
          </button>
        </div>
        {targetError && (
          <p id="target-hint" className="hint hint-error">
            {t("error.INVALID_AUTO_CASH_OUT", { min: mult(betting.minAutoCashOut * 100) })}
          </p>
        )}
      </div>

      {mode === "auto" && (
        <>
          <div className="field">
            <label htmlFor="auto-count">{t("auto.count")}</label>
            <div className="input-group">
              <div className="input-wrap">
                <input
                  id="auto-count"
                  className="num"
                  inputMode="numeric"
                  value={autobet ? (autobet.remaining === null ? "∞" : String(autobet.remaining)) : countText}
                  disabled={locked}
                  onChange={(e) => setCountText(e.target.value.replace(/[^0-9]/g, ""))}
                  aria-describedby="auto-count-hint"
                />
                <span className="input-adorn">{parse(countText) === 0 && !autobet ? "∞" : "#"}</span>
              </div>
            </div>
            <p id="auto-count-hint" className="hint">
              {t("auto.countHint")}
            </p>
          </div>

          {(
            [
              ["auto.onWin", onWin, setOnWin, onWinPct, setOnWinPct, "on-win"],
              ["auto.onLoss", onLoss, setOnLoss, onLossPct, setOnLossPct, "on-loss"],
            ] as const
          ).map(([labelKey, rule, setRule, pct, setPct, id]) => (
            <div className="field" key={id}>
              <label htmlFor={id}>{t(labelKey)}</label>
              <div className="input-group">
                <div className="seg" role="radiogroup" aria-label={t(labelKey)}>
                  <button role="radio" aria-checked={rule === "reset"} className={rule === "reset" ? "active" : ""} disabled={locked} onClick={() => setRule("reset")}>
                    {t("auto.reset")}
                  </button>
                  <button
                    role="radio"
                    aria-checked={rule === "increase"}
                    className={rule === "increase" ? "active" : ""}
                    disabled={locked}
                    onClick={() => setRule("increase")}
                  >
                    {t("auto.increase")}
                  </button>
                </div>
                <div className={`input-wrap pct ${rule === "increase" ? "" : "muted"}`}>
                  <input
                    id={id}
                    className="num"
                    inputMode="decimal"
                    value={pct}
                    disabled={rule !== "increase" || locked}
                    onChange={(e) => setPct(e.target.value.replace(/[^0-9.,]/g, ""))}
                  />
                  <span className="input-adorn">%</span>
                </div>
              </div>
            </div>
          ))}

          <div className="field-row">
            {(
              [
                ["auto.stopProfit", stopProfitText, setStopProfitText, "stop-profit"],
                ["auto.stopLoss", stopLossText, setStopLossText, "stop-loss"],
              ] as const
            ).map(([labelKey, value, setValue, id]) => (
              <div className="field" key={id}>
                <label htmlFor={id}>{t(labelKey)}</label>
                <div className="input-group">
                  <div className="input-wrap">
                    <input
                      id={id}
                      className="num"
                      inputMode="decimal"
                      value={value}
                      disabled={locked}
                      onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ""))}
                    />
                    <span className="input-adorn">{currency.symbol}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="field">
        <div className="field-head">
          <label htmlFor="profit">{t("bet.profitOnWin")}</label>
          <span className="field-aside num">{money(profitOnWin)}</span>
        </div>
        <div className="input-group readonly">
          <div className="input-wrap">
            <input id="profit" className="num" readOnly value={toMajor(profitOnWin, config).toFixed(currency.minorUnits)} tabIndex={-1} />
            <span className="input-adorn">{currency.symbol}</span>
          </div>
        </div>
      </div>

      <button
        className={`primary-action ${primaryClass}`}
        onClick={primary}
        disabled={primaryDisabled}
        data-testid="primary-action"
      >
        {label}
      </button>

      {autobet && (
        <p className="hint center autobet-status" role="status">
          {autobet.remaining === null ? t("auto.infinite") : t("auto.remaining", { count: autobet.remaining })}
        </p>
      )}
      {player && player.roundsUntilGolden !== null && (
        <LoonieMeter
          every={config.bonus.goldenRoundEvery}
          until={player.roundsUntilGolden}
          live={!!round?.golden && round.status === "running"}
        />
      )}
      {broke && (
        <button className="topup" onClick={onTopUp}>
          {t("bet.topUp", { amount: money(config.account.topUpAmount) })}
        </button>
      )}
      <p className="hint center shortcut">{t("bet.shortcut")}</p>
    </section>
  );
}
