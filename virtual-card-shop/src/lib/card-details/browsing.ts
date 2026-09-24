"use client";
import { useEffect, useRef } from "react";
export type TrailItem = { cardId: number; grade?: number };
export type CardTrail = {
  source: string;
  label: string;
  items: TrailItem[];
  scroll: number;
  state: Record<string, unknown>;
  savedAt: number;
};
const KEY = "vcs:card-browse:v1";
export function readTrail(): CardTrail | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (
      !value ||
      typeof value.source !== "string" ||
      !/^\/(collection|checklist|showcase)(\/|\?|$)/.test(value.source) ||
      !Array.isArray(value.items) ||
      Date.now() - value.savedAt > 6 * 3600000
    )
      return null;
    return {
      ...value,
      items: value.items
        .filter(
          (r: TrailItem) => Number.isSafeInteger(r.cardId) && r.cardId > 0,
        )
        .slice(0, 2000),
    };
  } catch {
    return null;
  }
}
export function returnState(source: string) {
  const trail = readTrail();
  return trail?.source === source ? trail.state : null;
}
export function restoreScroll(source: string) {
  const trail = readTrail();
  if (trail?.source === source)
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        window.scrollTo({
          top: Math.max(0, trail.scroll || 0),
          behavior: "instant",
        }),
      ),
    );
}
export function useCardBrowseSource(
  items: TrailItem[],
  label: string,
  state: Record<string, unknown> = {},
) {
  const current = useRef({ items, label, state });
  current.current = { items, label, state };
  useEffect(() => {
    function capture(event: MouseEvent) {
      const anchor = (event.target as Element)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const url = new URL(anchor.href, location.href);
      if (
        url.origin !== location.origin ||
        !/^\/cards\/\d+$/.test(url.pathname)
      )
        return;
      const cardId = Number(url.pathname.split("/").at(-1));
      if (!current.current.items.some((r) => r.cardId === cardId)) return;
      const trail: CardTrail = {
        source: location.pathname + location.search,
        label: current.current.label,
        items: current.current.items,
        scroll: window.scrollY,
        state: current.current.state,
        savedAt: Date.now(),
      };
      try {
        sessionStorage.setItem(KEY, JSON.stringify(trail));
      } catch {
        /* Browser storage is optional. */
      }
    }
    document.addEventListener("click", capture, true);
    document.addEventListener("auxclick", capture, true);
    return () => {
      document.removeEventListener("click", capture, true);
      document.removeEventListener("auxclick", capture, true);
    };
  }, []);
}
