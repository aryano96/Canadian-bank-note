import { useI18n } from "../i18n/index.tsx";

interface Props {
  every: number;
  /** Normal rounds left before the Golden round; 0 means the next round is Golden. */
  until: number;
  /** A Golden round is being played right now. */
  live: boolean;
}

/** One pip per round of the cycle; the last pip is the Golden Loonie itself. */
export function LoonieMeter({ every, until, live }: Props) {
  const { t } = useI18n();
  const filled = live ? every : every - 1 - until;
  const next = live || until === 0;
  const near = until <= 3;
  return (
    <div className={`loonie-meter ${near ? "near" : ""} ${next ? "next" : ""}`}>
      <ol className="loonie-pips" aria-hidden="true">
        {Array.from({ length: every }, (_, i) => (
          <li key={i} className={i === every - 1 ? "pip golden" : i < filled ? "pip filled" : "pip"} />
        ))}
      </ol>
      <p className="golden-hint" role="status">
        {live ? t("bet.goldenLive") : next ? t("bet.goldenNext") : until === 1 ? t("bet.goldenInOne") : t("bet.goldenIn", { count: until })}
      </p>
    </div>
  );
}
