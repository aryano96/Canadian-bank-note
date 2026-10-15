import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseConfig, type GameConfig } from "../src/index.ts";

const path = fileURLToPath(new URL("../../../config/game.config.json", import.meta.url));

export function loadConfig(overrides: (c: GameConfig) => void = () => {}): GameConfig {
  const config = parseConfig(JSON.parse(readFileSync(path, "utf8")));
  overrides(config);
  return config;
}
