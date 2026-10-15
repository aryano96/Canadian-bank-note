import { existsSync } from "node:fs";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { simulate, toHundredths, type GameConfig } from "@mint-rush/engine";
import Fastify, { type FastifyRequest } from "fastify";
import { z } from "zod";
import { GameError } from "./errors.ts";
import { GameService, type Clock } from "./game.ts";
import { Idempotency } from "./idempotency.ts";
import type { Store } from "./store/types.ts";

export interface AppOptions {
  config: GameConfig;
  store: Store;
  clock?: Clock;
  staticDir?: string;
  logger?: boolean;
  rateLimitPerMinute?: number;
}

const betBody = z.object({
  wager: z.number().int().positive(),
  autoCashOut: z.number().min(1).nullable().optional(),
});
const seedBody = z.object({ clientSeed: z.string().trim().min(1).max(64) });
const simulateQuery = z.object({
  target: z.coerce.number().min(1.01).max(1000).default(2),
  rounds: z.coerce.number().int().min(1000).max(500_000).default(200_000),
});

function bearer(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : undefined;
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: opts.logger ?? false });
  const game = new GameService(opts.store, opts.config, opts.clock);
  const idempotency = new Idempotency(opts.store);
  game.recover();
  app.addHook("onClose", async () => {
    game.shutdown();
    opts.store.close();
  });


  await app.register(rateLimit, {
    max: opts.rateLimitPerMinute ?? 600,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({ statusCode: 429, error: { code: "RATE_LIMITED", message: "Slow down a little" } }),
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof GameError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: { code: "VALIDATION_FAILED", message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) return reply.code(429).send({ error: { code: "RATE_LIMITED", message: "Slow down a little" } });
    if (status && status < 500) return reply.code(status).send({ error: { code: "VALIDATION_FAILED", message: (err as Error).message } });
    req.log.error(err);
    return reply.code(500).send({ error: { code: "INTERNAL", message: "Something went wrong" } });
  });

  const auth = (req: FastifyRequest) => game.authenticate(bearer(req));

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/config", async () => opts.config);

  app.post("/api/session", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async () => {
    const { token, account } = await game.createGuest();
    return { token, state: game.state(account.id) };
  });

  app.get("/api/me", async (req) => game.state((await auth(req)).id));

  app.post("/api/bets", async (req, reply) => {
    const account = await auth(req);
    return idempotency.run(account.id, req, reply, async () => {
      const body = betBody.parse(req.body);
      const auto = body.autoCashOut ? toHundredths(body.autoCashOut) : null;
      const round = await game.placeBet(account.id, body.wager, auto);
      return { round, state: game.state(account.id) };
    });
  });

  app.post<{ Params: { id: string } }>("/api/rounds/:id/cashout", async (req, reply) => {
    const account = await auth(req);
    return idempotency.run(account.id, req, reply, () => {
      const round = game.cashOut(account.id, req.params.id);
      return { round, state: game.state(account.id) };
    });
  });

  app.get<{ Params: { id: string } }>("/api/rounds/:id", async (req) => {
    const account = await auth(req);
    return game.getRound(account.id, req.params.id);
  });

  /**
   * Server-sent events for one round: the client animates locally and this
   * stream tells it the authoritative moment the round ends.
   */
  app.get<{ Params: { id: string } }>("/api/rounds/:id/stream", async (req, reply) => {
    const account = await auth(req);
    const round = game.getRound(account.id, req.params.id);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send("round", { round, serverNow: Date.now() });
    if (round.status !== "running") return res.end();

    const onSettled = (settled: unknown) => {
      send("settled", { round: settled, state: game.state(account.id) });
      cleanup();
      res.end();
    };
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);
    const cleanup = () => {
      clearInterval(heartbeat);
      game.events.off(`settled:${round.id}`, onSettled);
    };
    game.events.on(`settled:${round.id}`, onSettled);
    req.raw.on("close", cleanup);
  });

  app.get<{ Querystring: { limit?: string } }>("/api/history", async (req) => {
    const account = await auth(req);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? opts.config.ui.historySize) || 20));
    return game.history(account.id, limit);
  });

  app.get("/api/stats", async (req) => game.stats((await auth(req)).id));

  app.put("/api/seed", async (req) => {
    const account = await auth(req);
    return game.setClientSeed(account.id, seedBody.parse(req.body).clientSeed);
  });

  app.post("/api/topup", async (req) => game.topUp((await auth(req)).id));

  app.get("/api/simulate", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
    const q = simulateQuery.parse(req.query);
    return simulate(q.rounds, toHundredths(q.target), opts.config);
  });

  if (opts.staticDir && existsSync(opts.staticDir)) {
    await app.register(fastifyStatic, { root: opts.staticDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.code(404).send({ error: { code: "ROUND_NOT_FOUND", message: "Not found" } });
      }
      return reply.sendFile("index.html");
    });
  }

  return { app, game };
}
