"use client";

import { useEffect, useMemo, useState } from "react";
import ImageUploader from "@/components/ImageUploader";

type CardRow = {
  id: number;
  cardNumber: string;
  player: string;
  team: string | null;
  position: string | null;
  subset: string | null;
  insert: string | null;
  variant: string | null;
  bookValue: number;
  quantityOwned: number;
  imageUrl: string | null;
};

type ProductSet = {
  id: string;
  name: string | null;
  isBase: boolean;
  oddsPerPack: number | null;
  productId: string;
  product?: { id: string };
  _count?: { cards: number };
  cards: CardRow[];
};

function toMoneyDisplay(v: number | null | undefined) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return n.toFixed(2);
}

function moneyLooseToNumber(input: string) {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export default function ProductSetDetailClient({ productSetId }: { productSetId: string }) {
  const [data, setData] = useState<ProductSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // buffered display for bookValue so you can type freely
  const [bookDisplay, setBookDisplay] = useState<Record<number, string>>({});

  async function load() {
    setError(null);
    setMsg(null);

    const res = await fetch(`/api/product-sets/${encodeURIComponent(productSetId)}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j?.error ?? `Failed to load (${res.status})`);
      setData(null);
      return;
    }

    const j = (await res.json()) as ProductSet;
    setData(j);

    // initialize buffered book inputs
    const map: Record<number, string> = {};
    for (const c of j.cards) map[c.id] = toMoneyDisplay(c.bookValue);
    setBookDisplay(map);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSetId]);

  const sortedCards = useMemo(() => {
    if (!data) return [];
    // sort by numeric cardNumber when possible
    return [...data.cards].sort((a, b) => {
      const an = Number(a.cardNumber);
      const bn = Number(b.cardNumber);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return String(a.cardNumber).localeCompare(String(b.cardNumber));
    });
  }, [data]);

  function updateCardLocal(cardId: number, patch: Partial<CardRow>) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        cards: prev.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
      };
    });
  }

  function commitBook(cardId: number) {
    setData((prev) => {
      if (!prev) return prev;
      const raw = bookDisplay[cardId] ?? "0";
      const v = moneyLooseToNumber(raw);
      return {
        ...prev,
        cards: prev.cards.map((c) => (c.id === cardId ? { ...c, bookValue: v } : c)),
      };
    });

    setBookDisplay((prev) => {
      const raw = prev[cardId] ?? "0";
      const v = moneyLooseToNumber(raw);
      return { ...prev, [cardId]: toMoneyDisplay(v) };
    });
  }

  async function saveCard(cardId: number) {
    if (!data) return;

    setSavingId(cardId);
    setError(null);
    setMsg(null);

    try {
      // Ensure bookValue is committed
      commitBook(cardId);

      const card = data.cards.find((c) => c.id === cardId);
      if (!card) throw new Error("Card not found in state");

      // If commitBook hasn't reflected yet, compute directly from display:
      const book = moneyLooseToNumber(bookDisplay[cardId] ?? toMoneyDisplay(card.bookValue));

      const res = await fetch(`/api/cards/${encodeURIComponent(String(cardId))}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: card.imageUrl,
          quantityOwned: card.quantityOwned,
          bookValue: book,
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? `Save failed (${res.status})`);

      setMsg(`Saved card #${card.cardNumber} (${card.player}).`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Admin: Product Set</h1>

      {error && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {error}
        </div>
      )}

      {msg && (
        <div style={{ marginBottom: 12, padding: 10, background: "#efe", border: "1px solid #9f9" }}>
          {msg}
        </div>
      )}

      {!data ? (
        <div>Loading…</div>
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 800 }}>{data.id}</div>
            <div style={{ opacity: 0.85 }}>
              Product: <span style={{ fontWeight: 700 }}>{data.productId}</span> •{" "}
              {data.isBase ? "Base" : "Non-base"} • Cards: {data._count?.cards ?? data.cards.length}
            </div>
          </div>

          <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
                <tr>
                  {[
                    "Card #",
                    "Player",
                    "Team",
                    "Subset",
                    "Insert",
                    "Variant",
                    "Image",
                    "Qty",
                    "Book",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: 8,
                        borderBottom: "1px solid #ddd",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedCards.map((c, idx) => {
                  const saving = savingId === c.id;

                  return (
                    <tr key={c.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                        {c.cardNumber}
                      </td>

                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                        {c.player}
                      </td>

                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                        {c.team ?? "—"}
                      </td>

                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                        {c.subset ?? "—"}
                      </td>

                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                        {c.insert ?? "—"}
                      </td>

                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                        {c.variant ?? "—"}
                      </td>

                      {/* Image upload + URL field */}
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", minWidth: 360 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <ImageUploader
                            label="Card image"
                            value={c.imageUrl}
                            onUploaded={(url) => updateCardLocal(c.id, { imageUrl: url })}
                          />
                          <input
                            value={c.imageUrl ?? ""}
                            onChange={(e) => updateCardLocal(c.id, { imageUrl: e.target.value || null })}
                            placeholder='Or paste URL (e.g. "/uploads/..." )'
                            style={{ width: 340, padding: 6 }}
                          />
                        </div>
                      </td>

                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                        <input
                          value={String(c.quantityOwned ?? 0)}
                          onChange={(e) =>
                            updateCardLocal(c.id, {
                              quantityOwned: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                            })
                          }
                          style={{ width: 70, padding: 6 }}
                        />
                      </td>

                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={bookDisplay[c.id] ?? toMoneyDisplay(c.bookValue)}
                          onChange={(e) => setBookDisplay((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          onBlur={() => commitBook(c.id)}
                          style={{ width: 90, padding: 6 }}
                        />
                      </td>

                      <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => saveCard(c.id)}
                          disabled={saving}
                          style={{ padding: "6px 10px" }}
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {sortedCards.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ padding: 12 }}>
                      No cards in this Product Set yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
