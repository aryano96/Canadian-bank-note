import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.ts";
import type { Simulation, Stats } from "../api/types.ts";
import { useI18n } from "../i18n/index.tsx";

const SIM_ROUNDS = 200_000;
const SIM_TARGET = 2;

function BalanceChart({ series }: { series: Stats["balanceSeries"] }) {
  const { t, money } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  if (series.length < 2) return <p className="empty">{t("stats.balanceEmpty")}</p>;

  const W = 560;
  const H = 160;
  const pad = { l: 8, r: 8, t: 12, b: 12 };
  const values = series.map((s) => s.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad.l + (i / (series.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
  const d = series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.balance).toFixed(1)}`).join("");
  const h = hover !== null ? series[hover] : null;

  return (
    <figure className="chart">
      <figcaption>{t("stats.balanceTitle")}</figcaption>
      <div className="chart-box">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${t("stats.balanceTitle")}: ${money(values[0]!)} → ${money(values[values.length - 1]!)}`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const rel = (e.clientX - rect.left) / rect.width;
            setHover(Math.max(0, Math.min(series.length - 1, Math.round(rel * (series.length - 1)))));
          }}
        >
          <line x1={pad.l} x2={W - pad.r} y1={y(values[0]!)} y2={y(values[0]!)} className="chart-ref" />
          <path d={`${d}L${x(series.length - 1)},${H - pad.b}L${x(0)},${H - pad.b}Z`} className="chart-area" />
          <path d={d} className="chart-line" />
          {h && hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="chart-cross" />}
        </svg>
        {h && hover !== null && (
          <>
            <span className="chart-dot" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(h.balance) / H) * 100}%` }} />
            <div className="chart-tip mono" style={{ left: `${(x(hover) / W) * 100}%` }}>
              {money(h.balance)}
            </div>
          </>
        )}
      </div>
    </figure>
  );
}

function Distribution({ sim }: { sim: Simulation }) {
  const { t, percent } = useI18n();
  const max = Math.max(...sim.distribution.map((d) => d.share));
  return (
    <figure className="chart">
      <figcaption>{t("stats.distribution")}</figcaption>
      <ul className="bars">
        {sim.distribution.map((d) => (
          <li key={d.bucket} title={t("stats.share", { share: percent(d.share) })}>
            <span className="bar-label mono">{d.bucket}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${(d.share / max) * 100}%` }} />
            </span>
            <span className="bar-value mono">{percent(d.share)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function StatsPanel({ refreshKey }: { refreshKey: number }) {
  const { t, money, mult, percent, number } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [sim, setSim] = useState<Simulation | null>(null);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    api.stats().then(setStats, () => {});
  }, [refreshKey]);

  const run = useCallback(async () => {
    setSimulating(true);
    try {
      setSim(await api.simulate(SIM_TARGET, SIM_ROUNDS));
    } finally {
      setSimulating(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <div className="stats">
      {stats && (
        <div className="tiles">
          <div className="tile">
            <span className="label">{t("stats.rounds")}</span>
            <span className="value mono">{number(stats.rounds)}</span>
          </div>
          <div className="tile">
            <span className="label">{t("stats.winRate")}</span>
            <span className="value mono">{percent(stats.winRate, 0)}</span>
          </div>
          <div className="tile">
            <span className="label">{t("stats.net")}</span>
            <span className={`value mono ${stats.net >= 0 ? "won" : "lost"}`}>
              {stats.net >= 0 ? "+" : "−"}
              {money(Math.abs(stats.net))}
            </span>
          </div>
          <div className="tile">
            <span className="label">{t("stats.bestMultiplier")}</span>
            <span className="value mono">{stats.bestMultiplier ? mult(stats.bestMultiplier) : "–"}</span>
          </div>
        </div>
      )}
      {stats && <BalanceChart series={stats.balanceSeries} />}

      <section className="sim">
        <h3>{t("stats.simTitle", { rounds: number(SIM_ROUNDS) })}</h3>
        <p className="hint">{t("stats.simIntro", { target: mult(SIM_TARGET * 100) })}</p>
        {sim && (
          <>
            <div className="tiles">
              <div className="tile">
                <span className="label">{t("stats.theoryRtp")}</span>
                <span className="value mono">{percent(sim.theoreticalRtp, 2)}</span>
              </div>
              <div className="tile accent">
                <span className="label">{t("stats.simRtp")}</span>
                <span className="value mono">{percent(sim.rtp, 2)}</span>
              </div>
              <div className="tile">
                <span className="label">{t("stats.instant")}</span>
                <span className="value mono">{percent(sim.instantCrashRate, 2)}</span>
              </div>
              <div className="tile">
                <span className="label">{t("stats.median")}</span>
                <span className="value mono">{mult(sim.medianCrash)}</span>
              </div>
            </div>
            <Distribution sim={sim} />
          </>
        )}
        <button className="chip" onClick={run} disabled={simulating}>
          {simulating ? t("stats.running") : t("stats.run")}
        </button>
      </section>
    </div>
  );
}
