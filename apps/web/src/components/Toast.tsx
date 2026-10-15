import { useEffect } from "react";
import type { GameError } from "../game/useGame.ts";
import type { MessageKey } from "../i18n/en.ts";
import { useI18n } from "../i18n/index.tsx";

export function Toast({ error, onDone, vars }: { error: GameError | null; onDone: () => void; vars?: Record<string, string> }) {
  const { t } = useI18n();
  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(onDone, 3500);
    return () => window.clearTimeout(id);
  }, [error, onDone]);
  if (!error) return null;
  const key = `error.${error.code}` as MessageKey;
  return (
    <div className="toast" role="alert" key={error.id}>
      {t(key, vars)}
    </div>
  );
}
