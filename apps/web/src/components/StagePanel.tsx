import type { GameConfig } from "@mint-rush/engine";
import { computePayout } from "@mint-rush/engine";
import type { PublicRound } from "../api/types.ts";
import type { Phase } from "../game/useGame.ts";
import { useI18n } from "../i18n/index.tsx";
import { Stage } from "../stage/Stage.tsx";

interface Props {
  config: GameConfig;
  round: PublicRound | null;
  phase: Phase;
  live: number;
  theme: string;
  reducedMotion: boolean;
  onTick: (m: number) => void;
  /** Normal rounds left before the next Golden round (0: the next one is Golden). */
  roundsUntilGolden: number | null;
}

export function StagePanel({ config, round, phase, live, theme, reducedMotion, onTick, roundsUntilGolden }: Props) {
  const { t, mult, money } = useI18n();
  const running = round?.status === "running" && (phase === "running" || phase === "cashing");
  const settled = round && round.status !== "running" && phase === "result" ? round : null;
  const lastSettled = round && round.status !== "running" ? round : null;

  const finalOf = (r: PublicRound) => (r.status === "won" ? r.cashOutAt! : r.crashPoint!);
  const shown = running ? live : lastSettled && phase !== "placing" ? finalOf(lastSettled) : 100;
  const heat = running ? Math.min(1, Math.log(live / 100) / Math.log(20)) : 0;
  const tone =
    running && round?.golden
      ? "gold"
      : running || phase === "placing" || !lastSettled
        ? ""
        : `${lastSettled.status === "won" ? "win" : "loss"} ${settled ? "" : "dim"}`;

  let status = "";
  if (phase === "placing") status = t("stage.starting");
  else if (running) status = round!.autoCashOut ? t("stage.autoArmed", { multiplier: mult(round!.autoCashOut) }) : "";
  else if (lastSettled?.status === "won") status = t("stage.cashedOut", { multiplier: mult(lastSettled.cashOutAt!) });
  else if (lastSettled?.status === "lost") status = t("stage.crashed", { multiplier: mult(lastSettled.crashPoint!) });
  else status = t("stage.idle");

  const potential = running ? computePayout(round!.wager, live, round!.golden, config).payout : 0;
  const boost = Math.round(config.bonus.goldenMultiplierBoost * 100);
  // The stage edges warm up over the last few rounds before a Golden round.
  const warmth = !running && roundsUntilGolden !== null && roundsUntilGolden <= 3 ? (4 - roundsUntilGolden) / 4 : 0;
  const goldenNext = roundsUntilGolden === 0 && phase === "idle";

  return (
    <section
      className={`stage ${round?.golden && (running || settled) ? "is-golden" : ""} ${running ? "is-running" : ""} ${
        settled?.status === "lost" ? "is-crashed" : ""
      }`}
      style={{ "--heat": heat, "--warmth": warmth } as React.CSSProperties}
      aria-label="Game"
    >
      <div className="holo-stripe" aria-hidden="true" />
      <Stage config={config} round={round} phase={phase} theme={theme} reducedMotion={reducedMotion} onTick={onTick} />

      {round?.golden && (running || settled) && (
        <div className="golden-banner">{t("stage.goldenBanner", { boost })}</div>
      )}

      {goldenNext ? (
        <div className="stage-overlay golden-next">
          <div className={`loonie ${reducedMotion ? "still" : ""}`} aria-hidden="true">
            <span>$1</span>
          </div>
          <div className="golden-next-title">{t("stage.goldenNextTitle")}</div>
          <div className="stage-status">{t("stage.goldenNextBody", { boost })}</div>
        </div>
      ) : (
      <div className="stage-overlay">
        <div className={`multiplier mono ${tone}`} data-testid="multiplier">
          {mult(shown)}
        </div>
        {status && <div className="stage-status">{status}</div>}
        {running && <div className="stage-potential mono">{t("stage.potential", { amount: money(potential) })}</div>}
        {settled?.status === "won" && (
          <div className="stage-potential mono win">{t("stage.profit", { amount: money(settled.payout - settled.wager) })}</div>
        )}
        {settled?.status === "won" && settled.bonus > 0 && (
          <div className="bonus-chip mono">{t("stage.bonusChip", { boost, amount: money(settled.bonus) })}</div>
        )}
      </div>
      )}

      {settled && (
        <div key={settled.id} className={`stamp ${settled.status === "won" ? "stamp-win" : "stamp-loss"}`} aria-hidden="true">
          {settled.status === "won" ? t("stage.stampWin") : t("stage.stampLoss")}
        </div>
      )}
    </section>
  );
}
