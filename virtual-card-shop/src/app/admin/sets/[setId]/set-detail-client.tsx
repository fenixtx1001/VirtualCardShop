"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SetModel = {
  id: string;
  year: string | null;
  brand: string | null;
  sport: string | null;
  packPriceCents: number | null;
  _count?: { cards: number };
};

type CardModel = {
  id: number;
  setId: string;
  cardNumber: string;
  player: string;
  team: string | null;
  position: string | null;
  subset: string | null;
  insert: string | null;
  variant: string | null;
  bookValue: number; // dollars (Float in prisma)
  quantityOwned: number;
  imageUrl?: string | null;
};

function dollars(n: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toFixed(2);
}

function numberFromInput(s: string) {
  const cleaned = (s ?? "").toString().replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function intFromInput(s: string) {
  const n = Number((s ?? "").toString().replace(/[^0-9-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

export default function SetDetailClient({ setId }: { setId: string }) {
  // IMPORTANT: decode once here for consistent API usage
  const decodedSetId = useMemo(() => decodeURIComponent(setId), [setId]);

  const [loading, setLoading] = useState(true);
  const [set, setSet] = useState<SetModel | null>(null);
  const [cards, setCards] = useState<CardModel[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Which row is actively saving (for the Status column)
  const [savingCardId, setSavingCardId] = useState<number | null>(null);

  // Local editing state so inputs don't reset / flicker
  const [drafts, setDrafts] = useState<Record<number, Partial<CardModel>>>({});

  async function load() {
    setLoading(true);
    setError(null);

    try {
      // 1) Fetch set
      const setRes = await fetch(`/api/sets/${encodeURIComponent(decodedSetId)}`, {
        cache: "no-store",
      });

      if (!setRes.ok) {
        const txt = await setRes.text();
        throw new Error(`Set fetch failed (${setRes.status}): ${txt}`);
      }

      const setJson = await setRes.json();
      setSet(setJson?.set ?? setJson ?? null);

      // 2) Fetch cards
      const cardsRes = await fetch(`/api/sets/${encodeURIComponent(decodedSetId)}/cards`, {
        cache: "no-store",
      });

      if (!cardsRes.ok) {
        const txt = await cardsRes.text();
        throw new Error(`Cards fetch failed (${cardsRes.status}): ${txt}`);
      }

      const cardsJson = await cardsRes.json();
      const list: CardModel[] = cardsJson?.cards ?? cardsJson ?? [];

      setCards(list);
      setDrafts({}); // reset drafts on reload
    } catch (e: any) {
      setSet(null);
      setCards([]);
      setDrafts({});
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decodedSetId]);

  // Get displayed value = draft override if present, else the server value
  function view<T extends keyof CardModel>(card: CardModel, key: T): CardModel[T] {
    const d = drafts[card.id];
    if (d && key in d) return d[key] as CardModel[T];
    return card[key];
  }

  function setDraft(id: number, patch: Partial<CardModel>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
  }

  const updateCard = async (id: number, patch: Partial<CardModel>) => {
    // optimistic local update
    setCards((prev) => prev.map((c) => (c.id === id ? ({ ...c, ...patch } as CardModel) : c)));
    setSavingCardId(id);

    try {
      const res = await fetch(`/api/cards/${encodeURIComponent(String(id))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Save failed (${res.status}): ${txt}`);
      }

      // If save succeeded, clear draft fields that match what we just saved
      setDrafts((prev) => {
        const existing = prev[id];
        if (!existing) return prev;

        const next = { ...existing };
        for (const k of Object.keys(patch) as (keyof CardModel)[]) {
          delete (next as any)[k];
        }

        const out = { ...prev };
        if (Object.keys(next).length === 0) delete out[id];
        else out[id] = next;

        return out;
      });
    } catch (e: any) {
      // revert optimistic update by reloading (simple + reliable)
      alert(e?.message ?? String(e));
      await load();
    } finally {
      setSavingCardId(null);
    }
  };

  // Small shared styles (plain inline so you don’t have to touch CSS files)
  const styles = {
    page: { padding: 24 } as React.CSSProperties,
    meta: { marginTop: 6, color: "#555" } as React.CSSProperties,
    preError: {
      marginTop: 12,
      padding: 12,
      background: "#fff7f7",
      border: "1px solid #ffd7d7",
      whiteSpace: "pre-wrap",
    } as React.CSSProperties,
    tableWrap: {
      marginTop: 10,
      overflow: "auto",
      border: "1px solid #e6e6e6",
      borderRadius: 10,
      maxHeight: "72vh", // makes sticky header useful
    } as React.CSSProperties,
    table: { width: "100%", borderCollapse: "separate", borderSpacing: 0 } as React.CSSProperties,
    th: {
      position: "sticky",
      top: 0,
      zIndex: 2,
      background: "#fafafa",
      borderBottom: "1px solid #ddd",
      padding: 10,
      textAlign: "left",
      fontWeight: 600,
      whiteSpace: "nowrap",
    } as React.CSSProperties,
    td: {
      padding: 10,
      borderBottom: "1px solid #f0f0f0",
      verticalAlign: "middle",
      whiteSpace: "nowrap",
    } as React.CSSProperties,
    input: {
      padding: "6px 8px",
      border: "1px solid #d6d6d6",
      borderRadius: 8,
      outline: "none",
      background: "white",
    } as React.CSSProperties,
    smallLink: { fontSize: 12, marginLeft: 8 } as React.CSSProperties,
    status: { fontSize: 12, color: "#666" } as React.CSSProperties,
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <Link href="/admin/sets">← Back to Sets</Link>
        <p style={{ marginTop: 12 }}>Loading…</p>
      </div>
    );
  }

  if (!set) {
    return (
      <div style={styles.page}>
        <Link href="/admin/sets">← Back to Sets</Link>
        <p style={{ marginTop: 12 }}>Set not found.</p>
        {error && <pre style={styles.preError}>{error}</pre>}
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        <div>
          <Link href="/admin/sets">← Back to Sets</Link>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginTop: 10 }}>{set.id}</h1>
          <div style={styles.meta}>
            {set.year ?? "—"} • {set.brand ?? "—"} • {set.sport ?? "—"} • Pack: $
            {((set.packPriceCents ?? 0) / 100).toFixed(2)} • Cards: {set._count?.cards ?? cards.length}
          </div>
        </div>
      </div>

      {error && <pre style={styles.preError}>{error}</pre>}

      <h2 style={{ marginTop: 22, fontSize: 18 }}>Checklist</h2>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>#</th>
              <th style={styles.th}>Player</th>
              <th style={styles.th}>Team</th>
              <th style={styles.th}>Pos</th>
              <th style={styles.th}>Subset</th>
              <th style={styles.th}>Insert</th>
              <th style={styles.th}>Variant</th>
              <th style={styles.th}>Value ($)</th>
              <th style={styles.th}>Qty</th>
              <th style={styles.th}>Image URL</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>

          <tbody>
            {cards.map((c, idx) => {
              const zebra = idx % 2 === 0 ? "white" : "#fcfcfc";
              const rowBg = savingCardId === c.id ? "#fffdf2" : zebra;

              const cardNumber = String(view(c, "cardNumber") ?? "");
              const player = String(view(c, "player") ?? "");
              const team = String(view(c, "team") ?? "");
              const position = String(view(c, "position") ?? "");
              const subset = String(view(c, "subset") ?? "");
              const insert = String(view(c, "insert") ?? "");
              const variant = String(view(c, "variant") ?? "");
              const bookValue = Number(view(c, "bookValue") ?? 0);
              const quantityOwned = Number(view(c, "quantityOwned") ?? 0);
              const imageUrl = String(view(c, "imageUrl") ?? "");

              return (
                <tr key={c.id} style={{ background: rowBg }}>
                  {/* cardNumber */}
                  <td style={styles.td}>
                    <input
                      value={cardNumber}
                      style={{ ...styles.input, width: 90 }}
                      onChange={(e) => setDraft(c.id, { cardNumber: e.target.value })}
                      onBlur={(e) => updateCard(c.id, { cardNumber: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </td>

                  {/* player */}
                  <td style={styles.td}>
                    <input
                      value={player}
                      style={{ ...styles.input, width: 220 }}
                      onChange={(e) => setDraft(c.id, { player: e.target.value })}
                      onBlur={(e) => updateCard(c.id, { player: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </td>

                  {/* team */}
                  <td style={styles.td}>
                    <input
                      value={team}
                      style={{ ...styles.input, width: 190 }}
                      onChange={(e) => setDraft(c.id, { team: e.target.value })}
                      onBlur={(e) => updateCard(c.id, { team: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </td>

                  {/* position */}
                  <td style={styles.td}>
                    <input
                      value={position}
                      style={{ ...styles.input, width: 70 }}
                      onChange={(e) => setDraft(c.id, { position: e.target.value })}
                      onBlur={(e) => updateCard(c.id, { position: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </td>

                  {/* subset */}
                  <td style={styles.td}>
                    <input
                      value={subset}
                      style={{ ...styles.input, width: 160 }}
                      onChange={(e) => setDraft(c.id, { subset: e.target.value })}
                      onBlur={(e) => updateCard(c.id, { subset: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </td>

                  {/* insert */}
                  <td style={styles.td}>
                    <input
                      value={insert}
                      style={{ ...styles.input, width: 160 }}
                      onChange={(e) => setDraft(c.id, { insert: e.target.value })}
                      onBlur={(e) => updateCard(c.id, { insert: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </td>

                  {/* variant */}
                  <td style={styles.td}>
                    <input
                      value={variant}
                      style={{ ...styles.input, width: 120 }}
                      onChange={(e) => setDraft(c.id, { variant: e.target.value })}
                      onBlur={(e) => updateCard(c.id, { variant: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </td>

                  {/* bookValue */}
                  <td style={styles.td}>
                    <input
                      value={dollars(bookValue)}
                      style={{ ...styles.input, width: 90 }}
                      onChange={(e) => setDraft(c.id, { bookValue: numberFromInput(e.target.value) })}
                      onBlur={(e) => updateCard(c.id, { bookValue: numberFromInput(e.target.value) })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </td>

                  {/* quantityOwned */}
                  <td style={styles.td}>
                    <input
                      value={String(quantityOwned)}
                      style={{ ...styles.input, width: 70 }}
                      onChange={(e) => setDraft(c.id, { quantityOwned: Math.max(0, intFromInput(e.target.value)) })}
                      onBlur={(e) =>
                        updateCard(c.id, {
                          quantityOwned: Math.max(0, intFromInput(e.target.value)),
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </td>

                  {/* imageUrl */}
                  <td style={styles.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        value={imageUrl}
                        placeholder="https://..."
                        style={{ ...styles.input, width: 340 }}
                        onChange={(e) => setDraft(c.id, { imageUrl: e.target.value })}
                        onBlur={(e) => updateCard(c.id, { imageUrl: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                      />
                      {imageUrl?.startsWith("http") ? (
                        <a
                          href={imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={styles.smallLink}
                          title="Open image in new tab"
                        >
                          Preview
                        </a>
                      ) : null}
                    </div>
                  </td>

                  {/* status */}
                  <td style={styles.td}>
                    <span style={styles.status}>{savingCardId === c.id ? "Saving…" : ""}</span>
                  </td>
                </tr>
              );
            })}

            {cards.length === 0 && (
              <tr>
                <td colSpan={11} style={{ padding: 14 }}>
                  No cards found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
        Tip: Press <b>Enter</b> to save a cell (it blurs + triggers save). Header stays visible while you scroll.
      </div>
    </div>
  );
}
