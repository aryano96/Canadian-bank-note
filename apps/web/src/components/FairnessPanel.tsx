import { verifyRound, type GameConfig, type VerificationResult } from "@mint-rush/engine";
import { useEffect, useState } from "react";
import type { PlayerState, PublicRound } from "../api/types.ts";
import { useI18n } from "../i18n/index.tsx";

interface Props {
  config: GameConfig;
  player: PlayerState | null;
  selected: PublicRound | null;
  locked: boolean;
  onSaveSeed: (seed: string) => Promise<boolean>;
}

export function FairnessPanel({ config, player, selected, locked, onSaveSeed }: Props) {
  const { t, mult, number } = useI18n();
  const [seed, setSeed] = useState(player?.clientSeed ?? "");
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);

  useEffect(() => setSeed(player?.clientSeed ?? ""), [player?.clientSeed]);

  // Recompute the round entirely in the browser with the same engine code the server runs.
  useEffect(() => {
    setResult(null);
    if (!selected?.serverSeed || selected.crashPoint === undefined) return;
    void verifyRound(
      {
        serverSeed: selected.serverSeed,
        serverSeedHash: selected.serverSeedHash,
        clientSeed: selected.clientSeed,
        nonce: selected.nonce,
        crashPoint: selected.crashPoint,
      },
      config,
    ).then(setResult);
  }, [selected, config]);

  const pass = result && result.hashMatches && result.crashMatches;

  return (
    <div className="fairness">
      <p className="lede">{t("fair.intro")}</p>

      <dl className="kv">
        <dt>{t("fair.nextHash")}</dt>
        <dd className="mono hash">{player?.nextServerSeedHash ?? "…"}</dd>
        <dt>{t("fair.nonce")}</dt>
        <dd className="mono">{player ? number(player.nonce) : "…"}</dd>
      </dl>

      <form
        className="seed-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaved(await onSaveSeed(seed));
        }}
      >
        <label htmlFor="client-seed">{t("fair.clientSeed")}</label>
        <div className="input-row">
          <input
            id="client-seed"
            className="mono"
            value={seed}
            maxLength={64}
            disabled={locked}
            onChange={(e) => {
              setSaved(false);
              setSeed(e.target.value);
            }}
          />
          <button className="mini wide" type="submit" disabled={locked || !seed.trim() || seed === player?.clientSeed}>
            {t("fair.save")}
          </button>
        </div>
        <p className="hint" role="status">
          {saved ? t("fair.saved") : t("fair.clientSeedHint")}
        </p>
      </form>

      <p className="formula mono">{t("fair.formula")}</p>

      <div className={`verify-card ${pass ? "pass" : result ? "fail" : ""}`} aria-live="polite">
        {!selected ? (
          <p className="hint">{t("fair.verifyPick")}</p>
        ) : (
          <>
            <h3>{t("fair.verifyTitle", { nonce: selected.nonce })}</h3>
            <dl className="kv">
              <dt>{t("fair.serverSeed")}</dt>
              <dd className="mono hash">{selected.serverSeed}</dd>
            </dl>
            {!result ? (
              <p className="hint">{t("fair.checking")}</p>
            ) : (
              <ul className="checks">
                <li className={result.hashMatches ? "ok" : "bad"}>
                  <span aria-hidden="true">{result.hashMatches ? "✓" : "✗"}</span> {t("fair.hashCheck")}
                </li>
                <li className={result.crashMatches ? "ok" : "bad"}>
                  <span aria-hidden="true">{result.crashMatches ? "✓" : "✗"}</span>{" "}
                  {t("fair.crashCheck", { computed: mult(result.computedCrashPoint), actual: mult(selected.crashPoint!) })}
                </li>
              </ul>
            )}
            {result && <p className={`verdict ${pass ? "ok" : "bad"}`}>{pass ? t("fair.pass") : t("fair.fail")}</p>}
          </>
        )}
      </div>
    </div>
  );
}
