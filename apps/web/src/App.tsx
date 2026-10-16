import { crowdFor, withCurrency, type GameConfig } from "@mint-rush/engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api/client.ts";
import type { PublicRound } from "./api/types.ts";
import { BetPanel } from "./components/BetPanel.tsx";
import { BetsTable } from "./components/BetsTable.tsx";
import { DepositDialog } from "./components/DepositDialog.tsx";
import { FairnessPanel } from "./components/FairnessPanel.tsx";
import { Header } from "./components/Header.tsx";
import { HelpDialog } from "./components/HelpDialog.tsx";
import { HistoryStrip } from "./components/HistoryStrip.tsx";
import { LiveBets } from "./components/LiveBets.tsx";
import { StagePanel } from "./components/StagePanel.tsx";
import { StatsPanel } from "./components/StatsPanel.tsx";
import { Toast } from "./components/Toast.tsx";
import { useGame, type GameEvent } from "./game/useGame.ts";
import { useLiveMultiplier } from "./game/useLiveMultiplier.ts";
import { I18nProvider, useI18n } from "./i18n/index.tsx";
import { prefersReducedMotion, usePref } from "./lib/prefs.ts";
import { sound } from "./lib/sound.ts";

const THEMES = ["night", "paper"];
const MILESTONES = [200, 500, 1000, 2500, 5000, 10000];
type Tab = "bets" | "fairness" | "stats";

interface GameProps {
  /** The config as served. */
  base: GameConfig;
  /** The same config with the selected wallet's rules active. */
  config: GameConfig;
  onCurrency: (code: string) => void;
}

function Game({ base, config, onCurrency }: GameProps) {
  const code = config.currency.code;
  const { t, mult, money } = useI18n();
  const [savedTheme, setTheme] = usePref("theme", config.ui.theme);
  const theme = THEMES.includes(savedTheme) ? savedTheme : "night";
  const [soundOn, setSoundOn] = usePref("sound", true);
  const [helpSeen, setHelpSeen] = usePref("helpSeen", false);
  const [helpOpen, setHelpOpen] = useState(!helpSeen);
  const [depositOpen, setDepositOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("bets");
  const [verifying, setVerifying] = useState<PublicRound | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const [reducedMotion] = useState(prefersReducedMotion);
  const milestone = useRef(0);
  const primaryRef = useRef<() => void>(() => {});

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    sound.enabled = soundOn;
    if (!soundOn) sound.stopHum();
  }, [soundOn]);

  const pulse = (dir: "up" | "down") => {
    setFlash(dir);
    window.setTimeout(() => setFlash(null), 900);
  };

  const onEvent = useCallback(
    (e: GameEvent) => {
      if (e.type === "started") {
        milestone.current = 0;
        sound.start();
        pulse("down");
      } else if (e.type === "won") {
        if (e.round.golden) sound.goldenWin();
        else sound.win();
        pulse("up");
        setAnnouncement(t("a11y.won", { multiplier: mult(e.round.cashOutAt!), amount: money(e.round.payout) }));
      } else if (e.type === "playedOut") {
        sound.crashAfar();
        setAnnouncement(t("a11y.playedOut", { multiplier: mult(e.round.crashPoint!) }));
      } else {
        sound.lose();
        setAnnouncement(t("a11y.lost", { multiplier: mult(e.round.crashPoint!) }));
      }
    },
    [t, mult, money],
  );

  const game = useGame(base, onEvent);
  const running = game.round?.status === "running" && (game.phase === "running" || game.phase === "cashing");
  const watching = game.phase === "watching";
  const busy = running || watching || game.phase === "placing";
  const player = useMemo(() => game.player && { ...game.player, balance: game.player.balances[code] ?? 0 }, [game.player, code]);

  // A round resumed after a reload plays in its own currency.
  const roundCurrency = running ? game.round?.currency : undefined;
  useEffect(() => {
    if (roundCurrency && roundCurrency !== code) onCurrency(roundCurrency);
  }, [roundCurrency, code, onCurrency]);
  const live = useLiveMultiplier(game.round, running || watching, config);

  // The table shows the current round, or between rounds the players waiting for the next one.
  // Both come from the committed seed hash, so the next round's table is the one you then join.
  const between = game.phase === "idle" || game.phase === "placing" || game.phase === "loading";
  const tableRound = between ? null : game.round;
  const tableConfig = useMemo(() => (tableRound ? withCurrency(base, tableRound.currency) : config), [base, config, tableRound]);
  const tableSeed = tableRound?.serverSeedHash ?? game.player?.nextServerSeedHash;
  const crowd = useMemo(() => (tableSeed ? crowdFor(tableSeed, tableConfig) : []), [tableSeed, tableConfig]);
  const showTable = config.table.simulatedPlayers.enabled;

  const onTick = useCallback(
    (m: number) => {
      sound.progress(m);
      const next = MILESTONES.find((x) => x > milestone.current && m >= x);
      if (next) {
        milestone.current = next;
        setAnnouncement(t("a11y.milestone", { multiplier: mult(next) }));
      }
    },
    [t, mult],
  );

  // Space bar = the primary action, unless the user is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, button, select, dialog, [role=switch]")) return;
      e.preventDefault();
      primaryRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeHelp = () => {
    setHelpOpen(false);
    setHelpSeen(true);
  };

  const settledCount = game.history.filter((r) => r.status !== "running").length;

  return (
    <div className="app">
      <a className="skip-link" href="#play">
        {t("bet.place")}
      </a>
      <Header
        currencies={config.currencies}
        currency={code}
        balances={game.player?.balances ?? null}
        onCurrency={onCurrency}
        currencyLocked={busy}
        sound={soundOn}
        onSound={setSoundOn}
        theme={theme}
        onTheme={setTheme}
        onHelp={() => setHelpOpen(true)}
        onDeposit={() => setDepositOpen(true)}
        balanceFlash={flash}
      />

      <main className="layout" id="play">
        <div className="game-shell">
          <aside className="controls">
            <BetPanel
              key={code}
              config={config}
              player={player}
              phase={game.phase}
              round={game.round}
              live={live}
              onBet={(wager, auto) => game.placeBet(wager, auto, code)}
              onCashOut={game.cashOut}
              onTopUp={() => game.topUp(code)}
              registerPrimary={(fn) => {
                primaryRef.current = fn;
              }}
            />
          </aside>
          <div className="game-area">
            <HistoryStrip history={game.history} />
            <StagePanel
              config={config}
              round={game.round}
              phase={game.phase}
              live={live}
              theme={theme}
              reducedMotion={reducedMotion}
              onTick={onTick}
              roundsUntilGolden={game.player?.roundsUntilGolden ?? null}
              playedOut={game.playedOut}
              crowd={tableRound ? crowd : []}
            />
          </div>
          {showTable && <LiveBets config={tableConfig} crowd={crowd} round={tableRound} phase={game.phase} live={live} />}
        </div>

        <section className="panel tabs-panel">
          <div className="tabs" role="tablist">
            {(["bets", "fairness", "stats"] as const).map((id) => (
              <button
                key={id}
                role="tab"
                id={`tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                className={`tab ${tab === id ? "active" : ""}`}
                onClick={() => setTab(id)}
              >
                {t(`tabs.${id}`)}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="tab-body">
            {tab === "bets" && (
              <BetsTable
                history={game.history}
                onVerify={(r) => {
                  setVerifying(r);
                  setTab("fairness");
                }}
              />
            )}
            {tab === "fairness" && (
              <FairnessPanel
                config={config}
                player={game.player}
                selected={verifying ?? game.history.find((r) => r.serverSeed) ?? null}
                locked={running || game.phase === "placing"}
                onSaveSeed={game.setClientSeed}
              />
            )}
            {tab === "stats" && <StatsPanel refreshKey={settledCount} currency={code} />}
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>{t("app.demoNotice")}</span>
        <span>ThunderHacks 2026 · Canadian Bank Note challenge</span>
      </footer>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <Toast
        error={game.error}
        onDone={game.clearError}
        vars={{ min: mult(config.betting.minAutoCashOut * 100) }}
      />
      <HelpDialog open={helpOpen} onClose={closeHelp} config={config} />
      <DepositDialog
        open={depositOpen}
        config={config}
        onClose={() => setDepositOpen(false)}
        onDeposit={async (amount) => {
          const ok = await game.deposit(amount, code);
          if (ok) {
            pulse("up");
            sound.win();
            setAnnouncement(t("deposit.done", { amount: money(amount) }));
          }
          return ok;
        }}
      />
    </div>
  );
}

export function App() {
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      while (!stop) {
        try {
          setConfig(await api.config());
          setFailed(false);
          return;
        } catch {
          setFailed(true);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    };
    void load();
    return () => {
      stop = true;
    };
  }, []);

  if (!config) {
    return (
      <div className="boot" role="status">
        <div className="boot-mark" aria-hidden="true" />
        <p>{failed ? "Connecting to the press… / Connexion à la presse…" : "Mint Rush"}</p>
      </div>
    );
  }
  return <CurrencyScope config={config} />;
}

/** Holds the selected wallet so formatting, limits and bets all follow it. */
function CurrencyScope({ config }: { config: GameConfig }) {
  const [saved, setCurrency] = usePref("currency", config.currencies[0]!.code);
  const active = useMemo(() => withCurrency(config, saved), [config, saved]);
  return (
    <I18nProvider config={active}>
      <Game base={config} config={active} onCurrency={setCurrency} />
    </I18nProvider>
  );
}
