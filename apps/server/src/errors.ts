/** Stable error codes. The web client translates these, so never rename one. */
export type ErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_FUNDS"
  | "BET_TOO_SMALL"
  | "BET_TOO_LARGE"
  | "INVALID_AUTO_CASH_OUT"
  | "ROUND_IN_PROGRESS"
  | "ROUND_NOT_FOUND"
  | "ROUND_OVER"
  | "SEED_LOCKED"
  | "TOP_UP_NOT_NEEDED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  VALIDATION_FAILED: 400,
  INSUFFICIENT_FUNDS: 422,
  BET_TOO_SMALL: 422,
  BET_TOO_LARGE: 422,
  INVALID_AUTO_CASH_OUT: 422,
  ROUND_IN_PROGRESS: 409,
  ROUND_NOT_FOUND: 404,
  ROUND_OVER: 409,
  SEED_LOCKED: 409,
  TOP_UP_NOT_NEEDED: 409,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  IDEMPOTENCY_KEY_REUSED: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class GameError extends Error {
  readonly statusCode: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.statusCode = STATUS[code];
  }
}
