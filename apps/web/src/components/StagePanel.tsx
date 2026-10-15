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
}

export function StagePanel({ config, round, phase, live, theme, reducedMotion, onTick }: Props) {
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

  return (
    <section
      className={`stage ${round?.golden && (running || settled) ? "is-golden" : ""} ${running ? "is-running" : ""}`}
      style={{ "--heat": heat } as React.CSSProperties}
      aria-label="Game"
    >
      <div className="holo-stripe" aria-hidden="true" />
      <Stage config={config} round={round} phase={phase} theme={theme} reducedMotion={reducedMotion} onTick={onTick} />

      {round?.golden && (running || settled) && (
        <div className="golden-banner">{t("stage.goldenBanner", { boost: Math.round(config.bonus.goldenMultiplierBoost * 100) })}</div>
      )}

      <div className="stage-overlay">
        <div className={`multiplier mono ${tone}`} data-testid="multiplier">
          {mult(shown)}
        </div>
        {status && <div className="stage-status">{status}</div>}
        {running && <div className="stage-potential mono">{t("stage.potential", { amount: money(potential) })}</div>}
        {settled?.status === "won" && (
          <div className="stage-potential mono win">{t("stage.profit", { amount: money(settled.payout - settled.wager) })}</div>
        )}
      </div>

      {settled && (
        <div key={settled.id} className={`stamp ${settled.status === "won" ? "stamp-win" : "stamp-loss"}`} aria-hidden="true">
          {settled.status === "won" ? t("stage.stampWin") : t("stage.stampLoss")}
        </div>
      )}
    </section>
  );
}
