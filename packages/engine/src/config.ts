import { z } from "zod";

/**
 * The single source of truth for every tunable rule in the game.
 * Amounts are in minor units (cents) so balances never touch floating point.
 */
export const gameConfigSchema = z
  .object({
    currency: z.object({
      code: z.string().length(3),
      symbol: z.string().min(1),
      label: z.string().min(1),
      minorUnits: z.number().int().min(0).max(4),
    }),
    account: z.object({
      startingBalance: z.number().int().positive(),
      topUpAmount: z.number().int().positive(),
    }),
    betting: z.object({
      minBet: z.number().int().positive(),
      maxBet: z.number().int().positive(),
      presets: z.array(z.number().int().positive()).min(1).max(6),
      minAutoCashOut: z.number().min(1.01),
    }),
    rng: z.object({
      houseEdge: z.number().min(0).max(0.5),
      maxMultiplier: z.number().min(2).max(1_000_000),
    }),
    timing: z.object({
      growthRatePerSecond: z.number().positive().max(5),
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
  .refine((c) => c.betting.minBet <= c.betting.maxBet, {
    message: "betting.minBet must be <= betting.maxBet",
  })
  .refine((c) => c.ui.locales.includes(c.ui.defaultLocale), {
    message: "ui.defaultLocale must be one of ui.locales",
  });

export type GameConfig = z.infer<typeof gameConfigSchema>;

export function parseConfig(raw: unknown): GameConfig {
  const result = gameConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid game config:\n  ${issues.join("\n  ")}`);
  }
  return result.data;
}
