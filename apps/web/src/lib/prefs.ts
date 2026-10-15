import { useCallback, useState } from "react";

/** A preference remembered in localStorage, tolerant of blocked storage. */
export function usePref(key: string, fallback: boolean): [boolean, (v: boolean) => void];
export function usePref(key: string, fallback: string): [string, (v: string) => void];
export function usePref<T extends string | boolean>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`mint-rush.${key}`);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {}
    return fallback;
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(`mint-rush.${key}`, JSON.stringify(v));
      } catch {}
    },
    [key],
  );
  return [value, set];
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
