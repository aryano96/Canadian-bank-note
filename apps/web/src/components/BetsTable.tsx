import type { PublicRound } from "../api/types.ts";
import { useI18n } from "../i18n/index.tsx";

interface Props {
  history: PublicRound[];
  onVerify: (r: PublicRound) => void;
}

export function BetsTable({ history, onVerify }: Props) {
  const { t, money, mult, number } = useI18n();
  if (history.length === 0) return <p className="empty">{t("bets.empty")}</p>;
  return (
    <div className="table-wrap">
      <table className="bets-table">
        <thead>
          <tr>
            <th scope="col">{t("bets.round")}</th>
            <th scope="col" className="num">{t("bets.wager")}</th>
            <th scope="col" className="num">{t("bets.cashOut")}</th>
            <th scope="col" className="num">{t("bets.crash")}</th>
            <th scope="col" className="num">{t("bets.result")}</th>
            <th scope="col"><span className="sr-only">{t("bets.verify")}</span></th>
          </tr>
        </thead>
        <tbody>
          {history.map((r) => {
            const profit = r.payout - r.wager;
            return (
              <tr key={r.id}>
                <td className="mono">
                  #{number(r.nonce)} {r.golden && <span className="tag gold">{t("bets.golden")}</span>}
                </td>
                <td className="num mono">{money(r.wager)}</td>
                <td className="num mono">{r.cashOutAt ? mult(r.cashOutAt) : "–"}</td>
                <td className="num mono">{r.crashPoint !== undefined ? mult(r.crashPoint) : "…"}</td>
                <td className={`num mono ${r.status}`}>
                  {r.status === "running" ? (
                    <span className="tag live">{t("bets.running")}</span>
                  ) : (
                    <>
                      <span className="sr-only">{r.status === "won" ? t("bets.won") : t("bets.lost")} </span>
                      <span aria-hidden="true">{r.status === "won" ? "▲ " : "▼ "}</span>
                      {money(Math.abs(profit))}
                    </>
                  )}
                </td>
                <td>
                  {r.serverSeed && (
                    <button className="link" onClick={() => onVerify(r)}>
                      {t("bets.verify")}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
