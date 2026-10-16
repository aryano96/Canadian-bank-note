/**
 * Browser-only demo: runs the real GameService and MemoryStore inside the page
 * and answers the client's /api/* fetches locally, so the game can be hosted as
 * a static site. The full build keeps the Fastify server as the authority.
 */
import { parseConfig, simulate, toHundredths } from "@mint-rush/engine";
import rawConfig from "../../../config/game.config.json";
import { GameError } from "../../server/src/errors.ts";
import { GameService } from "../../server/src/game.ts";
import { MemoryStore } from "../../server/src/store/memory.ts";

const config = parseConfig(rawConfig);
const game = new GameService(new MemoryStore(), config);
const replays = new Map<string, Promise<unknown>>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fail(err: unknown) {
  if (err instanceof GameError) return json({ error: { code: err.code, message: err.message } }, err.statusCode);
  console.error(err);
  return json({ error: { code: "INTERNAL", message: "Something went wrong" } }, 500);
}

function stream(accountId: string, roundId: string, signal?: AbortSignal | null) {
  const round = game.getRound(accountId, roundId);
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const send = (event: string, data: unknown) => ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("round", { round, serverNow: Date.now() });
      if (round.status !== "running") return ctrl.close();
      const onSettled = (settled: unknown) => {
        send("settled", { round: settled, state: game.state(accountId) });
        cleanup();
        ctrl.close();
      };
      const cleanup = () => game.events.off(`settled:${roundId}`, onSettled);
      game.events.on(`settled:${roundId}`, onSettled);
      signal?.addEventListener("abort", cleanup);
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

async function handle(method: string, url: URL, headers: Headers, body: unknown, signal?: AbortSignal | null) {
  const path = url.pathname;
  if (path === "/api/health") return { ok: true };
  if (path === "/api/config") return config;
  if (path === "/api/simulate") {
    const target = Math.min(1000, Math.max(1.01, Number(url.searchParams.get("target") ?? 2)));
    const rounds = Math.min(500_000, Math.max(1000, Number(url.searchParams.get("rounds") ?? 200_000)));
    return simulate(rounds, toHundredths(target), config);
  }
  if (path === "/api/session" && method === "POST") {
    const { token, account } = await game.createGuest();
    return { token, state: game.state(account.id) };
  }

  const auth = headers.get("Authorization");
  const account = await game.authenticate(auth?.startsWith("Bearer ") ? auth.slice(7) : undefined);
  const id = account.id;

  // Money-moving calls replay their first answer for a repeated Idempotency-Key.
  const key = headers.get("Idempotency-Key");
  const once = (run: () => Promise<unknown>) => {
    if (!key) throw new GameError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header required");
    const k = `${id}:${key}`;
    if (!replays.has(k)) replays.set(k, run());
    return replays.get(k)!;
  };

  const roundMatch = /^\/api\/rounds\/([^/]+)(\/cashout|\/stream)?$/.exec(path);
  if (path === "/api/me") return game.state(id);
  if (path === "/api/bets" && method === "POST") {
    const { wager, autoCashOut, currency } = body as { wager: number; autoCashOut?: number | null; currency?: string };
    return once(async () => {
      const round = await game.placeBet(id, wager, autoCashOut ? toHundredths(autoCashOut) : null, currency);
      return { round, state: game.state(id) };
    });
  }
  if (roundMatch?.[2] === "/cashout" && method === "POST") {
    return once(async () => ({ round: game.cashOut(id, roundMatch[1]!), state: game.state(id) }));
  }
  if (roundMatch?.[2] === "/stream") return stream(id, roundMatch[1]!, signal);
  if (roundMatch) return game.getRound(id, roundMatch[1]!);
  if (path === "/api/history") {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? config.ui.historySize) || 20));
    return game.history(id, limit);
  }
  if (path === "/api/stats") return game.stats(id, url.searchParams.get("currency") ?? undefined);
  if (path === "/api/seed" && method === "PUT") {
    const seed = String((body as { clientSeed?: string }).clientSeed ?? "").trim();
    if (!seed || seed.length > 64) throw new GameError("VALIDATION_FAILED", "clientSeed: 1 to 64 characters");
    return game.setClientSeed(id, seed);
  }
  if (path === "/api/deposit" && method === "POST") {
    const { amount, currency } = body as { amount: number; currency?: string };
    return once(async () => ({ state: game.deposit(id, amount, currency) }));
  }
  if (path === "/api/topup" && method === "POST") return game.topUp(id, (body as { currency?: string } | undefined)?.currency);
  throw new GameError("ROUND_NOT_FOUND", "Not found");
}

const realFetch = window.fetch.bind(window);

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  // The client only ever calls relative /api/ paths. A fixed base keeps this
  // working inside sandboxed frames whose origin is opaque.
  const raw = typeof input === "string" ? input : null;
  if (!raw?.startsWith("/api/")) return realFetch(input, init);
  const url = new URL(raw, "http://mint-rush.local");
  try {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const result = await handle(init?.method ?? "GET", url, new Headers(init?.headers), body, init?.signal);
    return result instanceof Response ? result : json(result);
  } catch (err) {
    return fail(err);
  }
};
