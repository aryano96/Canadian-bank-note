import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseConfig } from "@mint-rush/engine";
import { buildApp } from "./app.ts";
import { MemoryStore } from "./store/memory.ts";
import { SqliteStore } from "./store/sqlite.ts";
import type { Store } from "./store/types.ts";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const configPath = process.env.CONFIG_PATH ?? here("../../../config/game.config.json");
const config = parseConfig(JSON.parse(readFileSync(configPath, "utf8")));

const store: Store =
  process.env.STORE === "memory"
    ? new MemoryStore()
    : new SqliteStore(process.env.DB_PATH ?? here("../data/mint-rush.db"));

const { app } = await buildApp({
  config,
  store,
  staticDir: process.env.STATIC_DIR ?? here("../../web/dist"),
  logger: process.env.NODE_ENV !== "test",
});

const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: process.env.HOST ?? "0.0.0.0" });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
