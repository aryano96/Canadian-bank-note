import type { PublicRound } from "../api/types.ts";
import { useI18n } from "../i18n/index.tsx";

export function tier(crash: number): "low" | "mid" | "high" | "epic" {
  if (crash < 200) return "low";
  if (crash < 1000) return "mid";
  if (crash < 10000) return "high";
  return "epic";
}

export function HistoryStrip({ history }: { history: PublicRound[] }) {
  const { t, mult } = useI18n();
  const done = history.filter((r) => r.crashPoint !== undefined);
  return (
    <section className="history" aria-label={t("history.title")}>
      <h2 className="sr-only">{t("history.title")}</h2>
      {done.length === 0 ? (
        <p className="hint">{t("history.empty")}</p>
      ) : (
        <ol className="history-list">
          {done.map((r) => (
            <li key={r.id} className={`crash-chip mono tier-${tier(r.crashPoint!)} ${r.golden ? "golden" : ""}`}>
              {mult(r.crashPoint!)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
