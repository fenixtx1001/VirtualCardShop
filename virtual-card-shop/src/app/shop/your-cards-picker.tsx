// src/app/shop/your-cards-picker.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type MyCardRow = {
  cardId: number;
  qtyOwned: number;
  bookValue: number;

  grade?: number;
  gradeLabel?: string;
  isRaw?: boolean;
  isGraded?: boolean;

  rawBookValueCents?: number;
  perCardValueCents?: number;
  totalBucketValueCents?: number;
  gradeability?: string;

  ownershipKey?: string;

  cardNumber: string;
  player: string;
  team: string | null;

  setId: string;
  productSetId: string | null;
  productSetName: string | null;
  productId: string | null;

  subset: string | null;
  variant: string | null;
  isInsert: boolean;

  frontImageUrl: string | null;
};

type MyCardsResponse =
  | { ok: true; q: string; count: number; rows: MyCardRow[] }
  | { ok: false; error: string };

function safeImgSrc(url: string | null | undefined) {
  const u = (url ?? "").trim();
  return u.length ? u : null;
}

function money(n: unknown) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function centsMoney(cents: unknown) {
  const v = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return money(v / 100);
}

function gradePillStyle(isGraded: boolean) {
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 11,
    fontWeight: 1000,
    border: isGraded ? "1px solid #b8860b" : "1px solid #ccc",
    background: isGraded ? "#fff7d6" : "#f7f7f7",
    color: isGraded ? "#7a4f00" : "#333",
  };
}

export function YourCardsPicker({
  onPick,
  disabled,
}: {
  onPick: (cardId: number) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<MyCardRow[]>([]);

  const canSearch = useMemo(() => q.trim().length >= 2, [q]);

  useEffect(() => {
    let alive = true;

    const t = setTimeout(async () => {
      const query = q.trim();
      if (!alive) return;

      setErr(null);

      if (query.length < 2) {
        setRows([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const params = new URLSearchParams();
        params.set("q", query);
        params.set("limit", "25");

        const res = await fetch(`/api/shop/my-cards?${params.toString()}`, { cache: "no-store" });

        const raw = await res.text();
        let j: MyCardsResponse | null = null;
        try {
          j = raw ? (JSON.parse(raw) as MyCardsResponse) : null;
        } catch {
          throw new Error(`Non-JSON (${res.status}): ${raw.slice(0, 120)}`);
        }

        if (!res.ok) throw new Error((j as any)?.error ?? `Failed (${res.status})`);
        if (!j || (j as any).ok !== true) throw new Error((j as any)?.error ?? "Failed");

        if (!alive) return;
        setRows(Array.isArray((j as any).rows) ? ((j as any).rows as MyCardRow[]) : []);
      } catch (e: any) {
        if (!alive) return;
        setRows([]);
        setErr(e?.message ?? "Failed to search your cards");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }, 220);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12, background: "#fff" }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>Pick a card to request an offer</div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your cards (player, team, setId, productSet name, card #)…"
          disabled={!!disabled}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ccc",
            minWidth: 320,
            flex: "1 1 320px",
          }}
        />

        <div style={{ fontSize: 12, color: "#555", fontWeight: 800 }}>
          {disabled ? "Disabled" : loading ? "Searching…" : !canSearch ? "Type 2+ chars" : `${rows.length} results`}
        </div>
      </div>

      {err ? (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 12, background: "#fee", border: "1px solid #f99" }}>
          {err}
        </div>
      ) : null}

      {canSearch && !loading && rows.length === 0 && !err ? (
        <div style={{ marginTop: 10, color: "#666", fontWeight: 800, fontSize: 12 }}>
          No matches. Try player name, team, set id, product set name, or card number.
        </div>
      ) : null}

      {rows.length ? (
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {rows.map((r) => {
            const img = safeImgSrc(r.frontImageUrl);
            const grade = typeof r.grade === "number" ? r.grade : 0;
            const gradeLabel = r.gradeLabel ?? (grade === 0 ? "Raw" : `VCS ${grade}`);
            const isGraded = grade !== 0;
            const key = r.ownershipKey ?? `${r.cardId}:${grade}`;

            return (
              <div
                key={key}
                style={{
                  border: isGraded ? "1px solid #e0c15c" : "1px solid #eee",
                  borderRadius: 14,
                  padding: 12,
                  background: isGraded ? "#fffdf3" : "#fcfcfc",
                  display: "grid",
                  gridTemplateColumns: "56px 1fr",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div style={{ width: 56, height: 56, borderRadius: 12, overflow: "hidden", border: "1px solid #ddd", background: "white" }}>
                  {img ? (
                    <img src={img} alt="Card" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontSize: 11, color: "#777" }}>
                      No image
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900 }}>
                      {r.player} {r.cardNumber ? `#${r.cardNumber}` : ""}{" "}
                      <span style={gradePillStyle(isGraded)}>{gradeLabel}</span>{" "}
                      <span style={{ fontWeight: 700, color: "#666" }}>• Owned: {r.qtyOwned}</span>
                    </div>

                    <div style={{ fontSize: 12, color: "#555" }}>
                      Raw Book: <b>{money(r.bookValue)}</b>
                      {isGraded ? (
                        <>
                          {" "}• Graded Value: <b>{centsMoney(r.perCardValueCents)}</b>
                        </>
                      ) : null}
                      {" "}• Card ID: <b>{r.cardId}</b>
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: "#666" }}>
                    {[
                      r.team,
                      r.productSetName ?? r.productSetId ?? null,
                      r.setId ? `setId: ${r.setId}` : null,
                      r.subset,
                      r.variant,
                      r.isInsert ? "Insert" : null,
                    ]
                      .filter(Boolean)
                      .join(" • ") || "—"}
                  </div>

                  <div>
                    <button
                      onClick={() => onPick(r.cardId)}
                      disabled={!!disabled}
                      style={{
                        padding: "9px 10px",
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        background: disabled ? "#f2f2f2" : "white",
                        fontWeight: 900,
                        cursor: disabled ? "not-allowed" : "pointer",
                      }}
                      title="Use this card for the offer request"
                    >
                      Use this card →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}