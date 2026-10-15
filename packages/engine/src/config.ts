import { z } from "zod";

/**
 * One wallet currency. Amounts are integers in the currency's smallest unit
 * (cents, pence, satoshis, or 1e-8 ETH), so balances never touch floating point.
 */
export const currencySchema = z
  .object({
    code: z.string().regex(/^[A-Z]{3,5}$/, "use an upper-case code such as CAD or BTC"),
    symbol: z.string().min(1),
    name: z.string().min(1),
    kind: z.enum(["fiat", "crypto"]),
    minorUnits: z.number().int().min(0).max(8),
    startingBalance: z.number().int().positive().max(Number.MAX_SAFE_INTEGER / 1e6),
    topUpAmount: z.number().int().positive(),
    minBet: z.number().int().positive(),
    maxBet: z.number().int().positive(),
    presets: z.array(z.number().int().positive()).min(1).max(6),
  })
  .refine((c) => c.minBet <= c.maxBet, { message: "minBet must be <= maxBet", path: ["minBet"] });

export type Currency = z.infer<typeof currencySchema>;

/**
 * The single source of truth for every tunable rule in the game.
 */
const baseSchema = z
  .object({
    /** Every wallet a player gets. The first one is the default. */
    currencies: z.array(currencySchema).min(1),
    betting: z.object({
      minAutoCashOut: z.number().min(1.01),
    }),
    rng: z.object({
      houseEdge: z.number().min(0).max(0.5),
      maxMultiplier: z.number().min(2).max(1_000_000),
    }),
    timing: z.object({
      growthRatePerSecond: z.number().positive().max(5),
      accelerationPerSecond2: z.number().min(0).max(1).default(0),
      resultHoldMs: z.number().int().min(0),
    }),
    bonus: z.object({
      enabled: z.boolean(),
      goldenRoundEvery: z.number().int().min(2),
      goldenMultiplierBoost: z.number().min(0).max(1),
    }),
    ui: z.object({
      defaultLocale: z.string(),
      locales: z.array(z.string()).min(1),
      theme: z.string(),
      historySize: z.number().int().min(1).max(100),
    }),
  })
  .passthrough()
  .refine((c) => new Set(c.currencies.map((x) => x.code)).size === c.currencies.length, {
    message: "currency codes must be unique",
  })
  .refine((c) => c.ui.locales.includes(c.ui.defaultLocale), {
    message: "ui.defaultLocale must be one of ui.locales",
  });

type BaseConfig = z.output<typeof baseSchema>;

/**
 * The parsed config also carries the active currency's rules as `currency`,
 * `account` and `betting`, so game code never has to look them up. Parsing
 * selects the first currency; `withCurrency` switches to another.
 */
function applyCurrency<C extends BaseConfig>(config: C, cur: Currency) {
  const { minAutoCashOut } = config.betting;
  return {
    ...config,
    currency: { code: cur.code, symbol: cur.symbol, name: cur.name, kind: cur.kind, minorUnits: cur.minorUnits },
    account: { startingBalance: cur.startingBalance, topUpAmount: cur.topUpAmount },
    betting: { minAutoCashOut, minBet: cur.minBet, maxBet: cur.maxBet, presets: cur.presets },
  };
}

export const gameConfigSchema = baseSchema.transform((c) => applyCurrency(c, c.currencies[0]!));

export type GameConfig = z.output<typeof gameConfigSchema>;

export function findCurrency(config: GameConfig, code: string | undefined): Currency | undefined {
  return config.currencies.find((c) => c.code === code);
}

/** The same config with `code`'s wallet rules active. Unknown codes fall back to the default. */
export function withCurrency(config: GameConfig, code: string | undefined): GameConfig {
  const cur = findCurrency(config, code) ?? config.currencies[0]!;
  return cur.code === config.currency.code ? config : applyCurrency(config, cur);
}

export function parseConfig(raw: unknown): GameConfig {
  const result = gameConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid game config:\n  ${issues.join("\n  ")}`);
  }
  return result.data;
}
