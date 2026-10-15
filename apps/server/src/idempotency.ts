import { sha256Hex } from "@mint-rush/engine";
import type { FastifyReply, FastifyRequest } from "fastify";
import { GameError } from "./errors.ts";
import type { IdempotentResponse, Store } from "./store/types.ts";

/**
 * Server idempotence for money-moving requests. A client sends a unique
 * `Idempotency-Key` per intent; retries with the same key (double clicks,
 * flaky networks) get the stored response instead of a second bet.
 */
export class Idempotency {
  private inFlight = new Map<string, Promise<IdempotentResponse>>();

  constructor(private store: Store) {}

  async run(
    accountId: string,
    req: FastifyRequest,
    reply: FastifyReply,
    handler: () => Promise<unknown> | unknown,
  ): Promise<unknown> {
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || key.length < 8 || key.length > 128) {
      throw new GameError("IDEMPOTENCY_KEY_REQUIRED", "Send a unique Idempotency-Key header (8-128 chars)");
    }
    const fingerprint = await sha256Hex(`${req.method} ${req.routeOptions.url} ${JSON.stringify(req.params)} ${JSON.stringify(req.body ?? null)}`);
    const slot = `${accountId}:${key}`;

    let pending = this.inFlight.get(slot);
    const stored = this.store.getIdempotent(accountId, key);
    if (stored) {
      pending = Promise.resolve(stored);
    } else if (!pending) {
      pending = this.execute(accountId, key, fingerprint, handler);
      this.inFlight.set(slot, pending);
      pending.finally(() => this.inFlight.delete(slot)).catch(() => {});
    } else {
      reply.header("Idempotent-Replayed", "true");
    }

    const result = await pending;
    if (result.fingerprint !== fingerprint) {
      throw new GameError("IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different request");
    }
    if (stored) reply.header("Idempotent-Replayed", "true");
    reply.code(result.statusCode);
    return result.body;
  }

  private async execute(
    accountId: string,
    key: string,
    fingerprint: string,
    handler: () => Promise<unknown> | unknown,
  ): Promise<IdempotentResponse> {
    let response: IdempotentResponse;
    try {
      response = { fingerprint, statusCode: 200, body: await handler() };
    } catch (err) {
      // Transient failures must stay retryable, so only remember business outcomes.
      if (!(err instanceof GameError) || err.code === "CONFLICT" || err.statusCode >= 500) throw err;
      response = { fingerprint, statusCode: err.statusCode, body: { error: { code: err.code, message: err.message } } };
    }
    this.store.putIdempotent(accountId, key, response);
    return response;
  }
}
