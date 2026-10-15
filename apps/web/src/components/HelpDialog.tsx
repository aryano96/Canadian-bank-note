import type { GameConfig } from "@mint-rush/engine";
import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/index.tsx";

export function HelpDialog({ open, onClose, config }: { open: boolean; onClose: () => void; config: GameConfig }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="help" onClose={onClose} aria-labelledby="help-title">
      <h2 id="help-title">{t("help.title")}</h2>
      <ol>
        <li>{t("help.step1")}</li>
        <li>{t("help.step2")}</li>
        <li>{t("help.step3")}</li>
        <li>{t("help.step4")}</li>
        <li>{t("help.step5", { every: config.bonus.goldenRoundEvery })}</li>
      </ol>
      <p className="hint">{t("app.demoNotice")}</p>
      <button className="primary-action small" onClick={onClose} autoFocus>
        {t("help.close")}
      </button>
    </dialog>
  );
}
