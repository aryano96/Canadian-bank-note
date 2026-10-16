import { computePayout, type CrowdPlayer, type GameConfig } from "@mint-rush/engine";
import type { PublicRound } from "../api/types.ts";
import type { Phase } from "../game/useGame.ts";
import { useI18n } from "../i18n/index.tsx";

interface Props {
  /** The round's config: its own currency, so amounts read in what was bet. */
  config: GameConfig;
  crowd: CrowdPlayer[];
  /** The round the table shows, or null for the next one (nobody has bet yet). */
  round: PublicRound | null;
  phase: Phase;
  /** Live multiplier while the round climbs. */
  live: number;
}

type RowState = "ready" | "playing" | "won" | "lost";

interface Row {
  key: string;
  name: string;
  color: string;
  you: boolean;
  wager: number;
  state: RowState;
  at: number | null;
  profit: number;
}

/**
 * The table beside the stage: the player and the simulated players on the same
 * round. Cash-outs light up green as the multiplier passes them; anyone still in
 * at the crash turns red.
 */
export function LiveBets({ config, crowd, round, phase, live }: Props) {
  const { t, mult, money } = useI18n();
  const climbing = round !== null && (phase === "running" || phase === "cashing" || phase === "watching");
  const crash = round && !climbing && round.status !== "running" ? round.crashPoint ?? null : null;
  const reached = climbing ? live : crash;
  const golden = round?.golden ?? false;
  const code = round?.currency ?? config.currency.code;

  const settle = (wager: number, target: number | null): Pick<Row, "state" | "at" | "profit"> => {
    if (!round) return { state: "ready", at: null, profit: 0 };
    if (target !== null && reached !== null && target <= reached) {
      return { state: "won", at: target, profit: computePayout(wager, target, golden, config).payout - wager };
    }
    if (crash !== null) return { state: "lost", at: null, profit: -wager };
    return { state: "playing", at: null, profit: 0 };
  };

  const rows: Row[] = crowd.map((p) => ({ key: p.name, name: p.name, color: p.color, you: false, wager: p.wager, ...settle(p.wager, p.target) }));
  if (round) {
    const mine: Row = { key: "you", name: t("crowd.you"), color: "var(--blue)", you: true, wager: round.wager, state: "playing", at: null, profit: 0 };
    if (round.status === "won") Object.assign(mine, { state: "won", at: round.cashOutAt, profit: round.payout - round.wager });
    else if (round.status === "lost") Object.assign(mine, { state: "lost", profit: -round.wager });
    rows.unshift(mine);
  }

  const cashed = rows.filter((r) => r.state === "won").length;
  const wagered = rows.reduce((s, r) => s + r.wager, 0);

  return (
    <aside className="live-bets" aria-label={t("crowd.title")}>
      <div className="live-bets-head">
        <strong>{round ? t("crowd.title") : t("crowd.nextRound")}</strong>
        <span className="live-bets-count">{t("crowd.players", { count: rows.length })}</span>
        <span className="sim-tag" title={t("crowd.simulatedHint")}>
          {t("crowd.simulated")}
        </span>
      </div>
      <div className="live-bets-totals">
        <span>{t("crowd.cashedCount", { count: cashed })}</span>
        <span className="num">{t("crowd.wagered", { amount: money(wagered, code) })}</span>
      </div>
      <ul className="live-bets-list" data-testid="live-bets">
        {rows.map((r) => (
          <li key={r.key} className={`bet-row is-${r.state} ${r.you ? "is-you" : ""}`}>
            <span className="avatar" style={{ background: r.color }} aria-hidden="true">
              {r.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="bet-who">
              <span className="bet-name">{r.name}</span>
              <span className="num bet-wager">{money(r.wager, code)}</span>
            </span>
            <span className="num bet-at">
              {r.state === "won" ? mult(r.at!) : r.state === "lost" ? t("crowd.crashed") : r.state === "playing" ? t("crowd.playing") : t("crowd.ready")}
            </span>
            <span className="num bet-profit">
              {r.state === "won" ? `+${money(r.profit, code)}` : r.state === "lost" ? `−${money(-r.profit, code)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
