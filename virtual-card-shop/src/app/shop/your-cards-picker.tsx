"use client";

import { useEffect, useState } from "react";

type MyCardRow = {
  cardId: number;
  player: string;
  cardNumber: string;
  team: string | null;
  productSetName: string | null;
  productSetId: string | null;
  subset: string | null;
  variant: string | null;
  frontImageUrl: string | null;
  qtyOwned: number;
  grade?: number;
  gradeLabel?: string;
  bookValue: number;
  perCardValueCents?: number;
  ownershipKey?: string;
};
type MyCardsResponse =
  | { ok: true; rows: MyCardRow[] }
  | { ok: false; error: string };

function money(cents: number) {
  return (Math.max(0, cents) / 100).toLocaleString("en-US", {
    style: "currency", currency: "USD",
  });
}

export function YourCardsPicker({ onPick, disabled = false }: {
  onPick: (cardId: number, label: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<MyCardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasQuery = query.trim().length >= 2;

  useEffect(() => {
    const abort = new AbortController();
    if (!hasQuery) { setRows([]); setLoading(false); setError(null); return; }
    const timer = setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        const params = new URLSearchParams({ q: query.trim(), limit: "25" });
        const response = await fetch("/api/shop/my-cards?" + params, {
          cache: "no-store", signal: abort.signal,
        });
        const result = await response.json().catch(() => null) as MyCardsResponse | null;
        if (!response.ok || result?.ok !== true)
          throw new Error(result && "error" in result ? result.error : "Couldn't search your cards.");
        if (!abort.signal.aborted) setRows(result.rows ?? []);
      } catch (err) {
        if (!abort.signal.aborted) {
          setRows([]);
          setError(err instanceof Error ? err.message : "Couldn't search your cards.");
        }
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [query, hasQuery]);

  return <div className="singles-picker">
    <label className="singles-picker-search">
      <input type="search" value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Search a player, set, team, or card number…"
        aria-label="Search your collection to sell" disabled={disabled} />
    </label>
    <p className="singles-picker-note" role="status">
      {!hasQuery ? "Type at least 2 characters to find your cards." :
        loading ? "Searching your collection…" : error ? error :
        rows.length ? rows.length + " matching versions" : "No matching cards in your collection."}
    </p>
    {!!rows.length && <div className="singles-picker-results">
      {rows.map(r => {
        const grade = Number(r.grade ?? 0);
        const gradeLabel = r.gradeLabel || (grade === 0 ? "Raw" : "VCS " + grade);
        const key = r.ownershipKey || r.cardId + ":" + grade;
        const setLabel = r.productSetName || r.productSetId || "Trading card";
        return <div className="singles-picker-result" key={key}>
          <div className="singles-picker-art">
            {r.frontImageUrl ? <img src={r.frontImageUrl} alt={r.player + " card front"} loading="lazy" /> : <span>VCS</span>}
          </div>
          <div className="singles-picker-meta">
            <strong>{r.player}{r.cardNumber ? " #" + r.cardNumber : ""}</strong>
            <small>{setLabel}</small>
            <small>{gradeLabel} · Own {r.qtyOwned}
              {r.perCardValueCents != null ? " · " + money(r.perCardValueCents) : ""}</small>
          </div>
          <button type="button" disabled={disabled}
            onClick={() => onPick(r.cardId, r.player + (r.cardNumber ? " #" + r.cardNumber : "") + " · " + gradeLabel)}
            aria-label={"Select " + r.player + " " + gradeLabel}>Select</button>
        </div>;
      })}
    </div>}
  </div>;
}
