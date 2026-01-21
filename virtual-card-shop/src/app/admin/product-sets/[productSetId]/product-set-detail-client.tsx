"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ImageUploader from "@/components/ImageUploader";

type CardRow = {
  id: number;
  cardNumber: string;
  player: string;
  team: string | null;
  position: string | null;
  subset: string | null;
  // keep in DB, but we are hiding from UI
  insert: string | null;
  variant: string | null;
  quantityOwned: number;
  bookValue: number;
  frontImageUrl: string | null;
  backImageUrl: string | null;
};

type ProductSetResponse = {
  id: string;
  name: string | null;
  isBase: boolean;
  oddsPerPack: number | null;
  productId: string;
  product?: {
    id: string;
    year: number | null;
    brand: string | null;
    sport: string | null;
    packPriceCents: number | null;
    cardsPerPack: number | null;
  };
  _count?: { cards: number };
  cards: CardRow[];
};

function parseCardNumberSortKey(cardNumber: string) {
  const s = (cardNumber ?? "").trim();

  if (s.includes("-")) {
    const m = s.match(/^(\d+)-(\d+)([A-Za-z]?)$/);
    const a = m ? Number(m[1]) : Number.POSITIVE_INFINITY;
    const b = m ? Number(m[2]) : Number.POSITIVE_INFINITY;
    const suf = m?.[3] ?? "";
    return { bucket: 1, a, b, suf, raw: s };
  }

  const m = s.match(/^(\d+)([A-Za-z]?)$/);
  const n = m ? Number(m[1]) : Number.POSITIVE_INFINITY;
  const suf = m?.[2] ?? "";
  return { bucket: 0, a: n, b: 0, suf, raw: s };
}

function moneyToDisplay(v: number) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "0.00";
  return v.toFixed(2);
}

function displayToMoney(s: string) {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeOpt(v: string | null | undefined) {
  const s = (v ?? "").trim();
  return s.length ? s : "—";
}

export default function ProductSetDetailClient({ productSetId }: { productSetId: string }) {
  const [data, setData] = useState<ProductSetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [savingCardId, setSavingCardId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  // Search + filters (NO insert filter anymore)
  const [query, setQuery] = useState("");
  const [subsetFilter, setSubsetFilter] = useState("ALL");
  const [variantFilter, setVariantFilter] = useState("ALL");

  // Draft strings for Book input
  const [bookDraft, setBookDraft] = useState<Record<number, string>>({});

  async function load() {
    setLoading(true);
    setPageError(null);
    setSaveError(null);
    setSaveOk(null);

    try {
      const res = await fetch(`/api/product-sets/${encodeURIComponent(productSetId)}`, { cache: "no-store" });
      const raw = await res.text();

      let j: any;
      try {
        j = JSON.parse(raw);
      } catch {
        throw new Error(`API returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed to load (${res.status})`);

      const payload = j as ProductSetResponse;
      setData(payload);

      const nextDraft: Record<number, string> = {};
      for (const c of payload.cards ?? []) nextDraft[c.id] = moneyToDisplay(c.bookValue ?? 0);
      setBookDraft(nextDraft);
    } catch (e: any) {
      setPageError(e?.message ?? "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSetId]);

  const sortedCards = useMemo(() => {
    const cards = data?.cards ?? [];
    const arr = [...cards];
    arr.sort((x, y) => {
      const a = parseCardNumberSortKey(x.cardNumber);
      const b = parseCardNumberSortKey(y.cardNumber);
      if (a.bucket !== b.bucket) return a.bucket - b.bucket;
      if (a.a !== b.a) return a.a - b.a;
      if (a.b !== b.b) return a.b - b.b;
      if (a.suf !== b.suf) return a.suf.localeCompare(b.suf);
      return x.id - y.id;
    });
    return arr;
  }, [data]);

  const filterOptions = useMemo(() => {
    const cards = data?.cards ?? [];
    const subsets = new Set<string>();
    const variants = new Set<string>();

    for (const c of cards) {
      subsets.add(normalizeOpt(c.subset));
      variants.add(normalizeOpt(c.variant));
    }

    const sortAlpha = (a: string, b: string) => {
      if (a === "—" && b !== "—") return -1;
      if (a !== "—" && b === "—") return 1;
      return a.localeCompare(b);
    };

    return {
      subsets: Array.from(subsets).sort(sortAlpha),
      variants: Array.from(variants).sort(sortAlpha),
    };
  }, [data]);

  const filteredCards = useMemo(() => {
    const q = query.trim().toLowerCase();

    return sortedCards.filter((c) => {
      if (subsetFilter !== "ALL" && normalizeOpt(c.subset) !== subsetFilter) return false;
      if (variantFilter !== "ALL" && normalizeOpt(c.variant) !== variantFilter) return false;

      if (!q) return true;
      const hay = `${c.cardNumber} ${c.player} ${c.team ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sortedCards, query, subsetFilter, variantFilter]);

  function patchCard(cardId: number, patch: Partial<CardRow>) {
    setData((prev) => {
      if (!prev) return prev;
      return { ...prev, cards: prev.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)) };
    });
  }

  function getEffectiveBookValue(card: CardRow) {
    const draft = bookDraft[card.id];
    if (typeof draft === "string") return displayToMoney(draft);
    return typeof card.bookValue === "number" ? card.bookValue : 0;
  }

  async function saveCard(card: CardRow) {
    setSavingCardId(card.id);
    setSaveError(null);
    setSaveOk(null);

    try {
      const bookValue = getEffectiveBookValue(card);

      const res = await fetch(`/api/cards/${encodeURIComponent(String(card.id))}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardNumber: card.cardNumber,
          player: card.player,
          team: card.team,
          position: card.position,
          subset: card.subset,
          variant: card.variant,
          quantityOwned: card.quantityOwned,
          bookValue,
          productSetId, // keep it attached

          // ✅ image fields
          frontImageUrl: card.frontImageUrl ?? null,
          backImageUrl: card.backImageUrl ?? null,
        }),
      });

      const raw = await res.text();
      let j: any;
      try {
        j = JSON.parse(raw);
      } catch {
        throw new Error(`Save returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Save failed (${res.status})`);

      patchCard(card.id, { bookValue, frontImageUrl: card.frontImageUrl ?? null, backImageUrl: card.backImageUrl ?? null });
      setBookDraft((prev) => ({ ...prev, [card.id]: moneyToDisplay(bookValue) }));
      setSaveOk(`Saved card #${card.cardNumber}`);
    } catch (e: any) {
      setSaveError(e?.message ?? "Save failed");
    } finally {
      setSavingCardId(null);
    }
  }

  async function deleteCard(card: CardRow) {
    const label = `#${card.cardNumber} ${card.player}`.trim();
    const ok = window.confirm(`Delete card ${label}?\n\nThis cannot be undone.`);
    if (!ok) return;

    setSavingCardId(card.id);
    setSaveError(null);
    setSaveOk(null);

    try {
      const res = await fetch(`/api/cards/${encodeURIComponent(String(card.id))}`, { method: "DELETE" });
      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {}

      if (!res.ok) throw new Error(j?.error ?? `Delete failed (${res.status})`);

      setData((prev) => (prev ? { ...prev, cards: prev.cards.filter((c) => c.id !== card.id) } : prev));

      setBookDraft((prev) => {
        const next = { ...prev };
        delete next[card.id];
        return next;
      });

      setSaveOk(`Deleted ${label}`);
    } catch (e: any) {
      setSaveError(e?.message ?? "Delete failed");
    } finally {
      setSavingCardId(null);
    }
  }

  const headerCell: React.CSSProperties = { textAlign: "left", padding: 8, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" };
  const bodyCell: React.CSSProperties = { padding: 8, borderBottom: "1px solid #eee" };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>Admin: Product Set</h1>
          <div style={{ marginTop: 6 }}>
            <Link href="/admin/product-sets" style={{ textDecoration: "underline", marginRight: 12 }}>
              ← Back to Product Sets
            </Link>
            <Link href="/admin/products" style={{ textDecoration: "underline" }}>
              Admin: Products
            </Link>
          </div>
        </div>

        <button onClick={load} style={{ padding: "8px 12px" }}>
          Refresh
        </button>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {pageError && <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>{pageError}</div>}
      {saveError && <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>{saveError}</div>}
      {saveOk && <div style={{ marginBottom: 12, padding: 10, background: "#efe", border: "1px solid #9f9" }}>{saveOk}</div>}

      {loading || !data ? (
        <div>Loading…</div>
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{data.id}</div>
            <div style={{ color: "#333", marginTop: 4 }}>
              Product:{" "}
              <Link href={`/admin/products/${encodeURIComponent(data.productId)}`} style={{ textDecoration: "underline", fontWeight: 700 }}>
                {data.productId}
              </Link>{" "}
              • {data.isBase ? "Base" : "Non-base"} • Cards: {data._count?.cards ?? data.cards.length}
            </div>
          </div>

          {/* Search + Filters */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", border: "1px solid #ddd", padding: 10, marginBottom: 12, background: "#fafafa" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 700 }}>Search</div>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Card #, player, team…" style={{ padding: 8, width: 260 }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 700 }}>Subset</div>
              <select value={subsetFilter} onChange={(e) => setSubsetFilter(e.target.value)} style={{ padding: 8, width: 220 }}>
                <option value="ALL">All</option>
                {filterOptions.subsets.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 700 }}>Variant</div>
              <select value={variantFilter} onChange={(e) => setVariantFilter(e.target.value)} style={{ padding: 8, width: 220 }}>
                <option value="ALL">All</option>
                {filterOptions.variants.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 700 }}>Showing</div>
              <div style={{ padding: "8px 0" }}>
                {filteredCards.length} / {sortedCards.length}
              </div>
            </div>

            <button
              onClick={() => {
                setQuery("");
                setSubsetFilter("ALL");
                setVariantFilter("ALL");
              }}
              style={{ padding: "10px 12px" }}
            >
              Clear
            </button>
          </div>

          <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f7f7f7", zIndex: 2 }}>
                <tr>
                  {["Row", "Card #", "Player", "Team", "Subset", "Variant", "Front Image", "Back Image", "Qty", "Book", "Actions"].map((h) => (
                    <th key={h} style={headerCell}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredCards.map((c, idx) => {
                  const zebra = idx % 2 === 0 ? "#fff" : "#fcfcfc";
                  const saving = savingCardId === c.id;

                  return (
                    <tr key={c.id} style={{ background: zebra }}>
                      <td style={{ ...bodyCell, width: 60 }}>{idx + 1}</td>

                      <td style={{ ...bodyCell, width: 110 }}>
                        <input value={c.cardNumber} onChange={(e) => patchCard(c.id, { cardNumber: e.target.value })} style={{ width: "100%", padding: 6 }} />
                      </td>

                      <td style={{ ...bodyCell, minWidth: 260 }}>
                        <input value={c.player ?? ""} onChange={(e) => patchCard(c.id, { player: e.target.value })} style={{ width: "100%", padding: 6 }} />
                      </td>

                      <td style={{ ...bodyCell, minWidth: 220 }}>
                        <input value={c.team ?? ""} onChange={(e) => patchCard(c.id, { team: e.target.value || null })} style={{ width: "100%", padding: 6 }} />
                      </td>

                      <td style={{ ...bodyCell, minWidth: 180 }}>
                        <input value={c.subset ?? ""} onChange={(e) => patchCard(c.id, { subset: e.target.value || null })} style={{ width: "100%", padding: 6 }} />
                      </td>

                      <td style={{ ...bodyCell, minWidth: 160 }}>
                        <input value={c.variant ?? ""} onChange={(e) => patchCard(c.id, { variant: e.target.value || null })} style={{ width: "100%", padding: 6 }} />
                      </td>

                      {/* Front */}
                      <td style={{ ...bodyCell, minWidth: 420 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <input
                              value={c.frontImageUrl ?? ""}
                              onChange={(e) => patchCard(c.id, { frontImageUrl: e.target.value || null })}
                              placeholder="front image URL"
                              style={{ flex: 1, padding: 6, minWidth: 260 }}
                            />
                            {c.frontImageUrl ? (
                              <a href={c.frontImageUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                                Preview
                              </a>
                            ) : null}
                          </div>

                          <ImageUploader
                            label="Upload front image"
                            value={c.frontImageUrl}
                            onUploaded={(url) => patchCard(c.id, { frontImageUrl: url })}
                          />
                        </div>
                      </td>

                      {/* Back */}
                      <td style={{ ...bodyCell, minWidth: 420 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <input
                              value={c.backImageUrl ?? ""}
                              onChange={(e) => patchCard(c.id, { backImageUrl: e.target.value || null })}
                              placeholder="back image URL"
                              style={{ flex: 1, padding: 6, minWidth: 260 }}
                            />
                            {c.backImageUrl ? (
                              <a href={c.backImageUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                                Preview
                              </a>
                            ) : null}
                          </div>

                          <ImageUploader
                            label="Upload back image"
                            value={c.backImageUrl}
                            onUploaded={(url) => patchCard(c.id, { backImageUrl: url })}
                          />
                        </div>
                      </td>

                      <td style={{ ...bodyCell, width: 90 }}>
                        <input
                          inputMode="numeric"
                          value={String(c.quantityOwned ?? 0)}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            patchCard(c.id, { quantityOwned: Number.isFinite(n) ? n : 0 });
                          }}
                          style={{ width: "100%", padding: 6 }}
                        />
                      </td>

                      <td style={{ ...bodyCell, width: 110 }}>
                        <input
                          value={bookDraft[c.id] ?? moneyToDisplay(c.bookValue ?? 0)}
                          onChange={(e) => setBookDraft((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          onBlur={() => {
                            const raw = bookDraft[c.id] ?? moneyToDisplay(c.bookValue ?? 0);
                            const parsed = displayToMoney(raw);
                            patchCard(c.id, { bookValue: parsed });
                            setBookDraft((prev) => ({ ...prev, [c.id]: moneyToDisplay(parsed) }));
                          }}
                          style={{ width: "100%", padding: 6 }}
                        />
                      </td>

                      <td style={{ ...bodyCell, whiteSpace: "nowrap" }}>
                        <button onClick={() => saveCard(c)} disabled={saving} style={{ padding: "6px 10px", marginRight: 8 }}>
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button onClick={() => deleteCard(c)} disabled={saving} style={{ padding: "6px 10px" }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredCards.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ padding: 12 }}>
                      No cards match your search/filters.
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
