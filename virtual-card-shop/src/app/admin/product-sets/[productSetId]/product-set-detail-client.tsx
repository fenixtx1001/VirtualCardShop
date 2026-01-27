"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ImageUploader from "@/components/ImageUploader";

type CardRow = {
  id: number;
  cardNumber: string;
  player: string;
  team: string | null;
  position: string | null;
  subset: string | null;
  insert: string | null; // kept in DB but hidden
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
  pagination?: {
    page: number;
    pageSize: number;
    totalCards: number;
    totalPages: number;
  };
};

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

function hasFrontImage(c: CardRow) {
  return Boolean((c.frontImageUrl ?? "").trim());
}
function hasBackImage(c: CardRow) {
  return Boolean((c.backImageUrl ?? "").trim());
}

function needsSetup(c: CardRow) {
  const book = typeof c.bookValue === "number" && Number.isFinite(c.bookValue) ? c.bookValue : 0;
  return book <= 0 || !hasFrontImage(c) || !hasBackImage(c);
}

/**
 * ✅ Robust card number sort key:
 * - sorts numerically for "1,2,10"
 * - handles "12A" suffix
 * - handles "1-2" style numbers
 * - falls back safely
 */
function parseCardNumberSortKey(cardNumber: string) {
  const s = (cardNumber ?? "").trim();

  // Handle "12-3A" style
  if (s.includes("-")) {
    const m = s.match(/^(\d+)-(\d+)([A-Za-z]?)$/);
    const a = m ? Number(m[1]) : Number.POSITIVE_INFINITY;
    const b = m ? Number(m[2]) : Number.POSITIVE_INFINITY;
    const suf = m?.[3] ?? "";
    return { bucket: 1, a, b, suf, raw: s };
  }

  // Handle "12A" style
  const m = s.match(/^(\d+)([A-Za-z]?)$/);
  const n = m ? Number(m[1]) : Number.POSITIVE_INFINITY;
  const suf = m?.[2] ?? "";
  return { bucket: 0, a: n, b: 0, suf, raw: s };
}

// Throttled promise pool for Save Page
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  onProgress?: (done: number, total: number) => void
) {
  const total = items.length;
  let done = 0;
  let idx = 0;

  const runners = Array.from({ length: Math.min(limit, total) }, async () => {
    while (true) {
      const myIdx = idx++;
      if (myIdx >= total) break;
      await worker(items[myIdx], myIdx);
      done++;
      onProgress?.(done, total);
    }
  });

  await Promise.all(runners);
}

type SortMode =
  | "CARDNO_ASC"
  | "BOOK_DESC"
  | "BOOK_ASC"
  | "PLAYER_ASC"
  | "TEAM_ASC"
  | "SUBSET_ASC"
  | "VARIANT_ASC"
  | "NEEDS_SETUP_FIRST";

export default function ProductSetDetailClient({ productSetId }: { productSetId: string }) {
  const [data, setData] = useState<ProductSetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [savingCardId, setSavingCardId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  // Search + filters
  const [query, setQuery] = useState("");
  const [subsetFilter, setSubsetFilter] = useState("ALL");
  const [variantFilter, setVariantFilter] = useState("ALL");

  // Needs setup toggle
  const [needsSetupOnly, setNeedsSetupOnly] = useState(false);

  // Sorting (NEW)
  const [sortMode, setSortMode] = useState<SortMode>("CARDNO_ASC");

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Draft strings for Book input
  const [bookDraft, setBookDraft] = useState<Record<number, string>>({});

  // Track baseline
  const baselineRef = useRef<Map<number, string>>(new Map());

  // Save page progress
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [saveNeedsOnly, setSaveNeedsOnly] = useState(true);

  async function load(p = page, ps = pageSize) {
    setLoading(true);
    setPageError(null);
    setSaveError(null);
    setSaveOk(null);

    try {
      const res = await fetch(
        `/api/product-sets/${encodeURIComponent(productSetId)}?page=${encodeURIComponent(String(p))}&pageSize=${encodeURIComponent(String(ps))}`,
        { cache: "no-store" }
      );

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

      const map = new Map<number, string>();
      for (const c of payload.cards ?? []) {
        map.set(
          c.id,
          JSON.stringify({
            cardNumber: c.cardNumber ?? "",
            player: c.player ?? "",
            team: c.team ?? null,
            position: c.position ?? null,
            subset: c.subset ?? null,
            variant: c.variant ?? null,
            quantityOwned: c.quantityOwned ?? 0,
            bookValue: typeof c.bookValue === "number" ? c.bookValue : 0,
            frontImageUrl: c.frontImageUrl ?? null,
            backImageUrl: c.backImageUrl ?? null,
          })
        );
      }
      baselineRef.current = map;
    } catch (e: any) {
      setPageError(e?.message ?? "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSetId, page, pageSize]);

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

  function buildBaselineComparable(card: CardRow) {
    return JSON.stringify({
      cardNumber: card.cardNumber ?? "",
      player: card.player ?? "",
      team: card.team ?? null,
      position: card.position ?? null,
      subset: card.subset ?? null,
      variant: card.variant ?? null,
      quantityOwned: card.quantityOwned ?? 0,
      bookValue: getEffectiveBookValue(card),
      frontImageUrl: card.frontImageUrl ?? null,
      backImageUrl: card.backImageUrl ?? null,
    });
  }

  function isDirty(card: CardRow) {
    const base = baselineRef.current.get(card.id);
    if (!base) return true;
    return base !== buildBaselineComparable(card);
  }

  // ✅ Sorting + filtering (updated pipeline)
  const sortedCards = useMemo(() => {
    const cards = data?.cards ?? [];
    const arr = [...cards];

    const cmpCardNo = (x: CardRow, y: CardRow) => {
      const a = parseCardNumberSortKey(x.cardNumber);
      const b = parseCardNumberSortKey(y.cardNumber);
      if (a.bucket !== b.bucket) return a.bucket - b.bucket;
      if (a.a !== b.a) return a.a - b.a;
      if (a.b !== b.b) return a.b - b.b;
      if (a.suf !== b.suf) return a.suf.localeCompare(b.suf);
      return x.id - y.id;
    };

    const cmpStr = (a: any, b: any) => String(a ?? "").localeCompare(String(b ?? ""), undefined, { sensitivity: "base" });

    arr.sort((x, y) => {
      switch (sortMode) {
        case "BOOK_DESC": {
          const ax = getEffectiveBookValue(x);
          const ay = getEffectiveBookValue(y);
          if (ay !== ax) return ay - ax;
          return cmpCardNo(x, y);
        }
        case "BOOK_ASC": {
          const ax = getEffectiveBookValue(x);
          const ay = getEffectiveBookValue(y);
          if (ax !== ay) return ax - ay;
          return cmpCardNo(x, y);
        }
        case "PLAYER_ASC": {
          const p = cmpStr(x.player, y.player);
          if (p !== 0) return p;
          return cmpCardNo(x, y);
        }
        case "TEAM_ASC": {
          const t = cmpStr(x.team, y.team);
          if (t !== 0) return t;
          return cmpCardNo(x, y);
        }
        case "SUBSET_ASC": {
          const s = cmpStr(x.subset, y.subset);
          if (s !== 0) return s;
          return cmpCardNo(x, y);
        }
        case "VARIANT_ASC": {
          const v = cmpStr(x.variant, y.variant);
          if (v !== 0) return v;
          return cmpCardNo(x, y);
        }
        case "NEEDS_SETUP_FIRST": {
          const nx = needsSetup({ ...x, bookValue: getEffectiveBookValue(x) }) ? 1 : 0;
          const ny = needsSetup({ ...y, bookValue: getEffectiveBookValue(y) }) ? 1 : 0;
          if (ny !== nx) return ny - nx; // needs-setup first
          // Within needs-setup bucket, show highest book first to focus attention
          const ax = getEffectiveBookValue(x);
          const ay = getEffectiveBookValue(y);
          if (ay !== ax) return ay - ax;
          return cmpCardNo(x, y);
        }
        case "CARDNO_ASC":
        default:
          return cmpCardNo(x, y);
      }
    });

    return arr;
  }, [data, sortMode, bookDraft]); // include bookDraft so typing affects BOOK sort immediately

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

      // needsSetupOnly uses effective book draft too
      if (needsSetupOnly) {
        const effective = { ...c, bookValue: getEffectiveBookValue(c) };
        if (!needsSetup(effective)) return false;
      }

      if (!q) return true;
      const hay = `${c.cardNumber} ${c.player} ${c.team ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sortedCards, query, subsetFilter, variantFilter, needsSetupOnly, bookDraft]);

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

      baselineRef.current.set(card.id, buildBaselineComparable({ ...card, bookValue }));
      patchCard(card.id, { bookValue });
      setBookDraft((prev) => ({ ...prev, [card.id]: moneyToDisplay(bookValue) }));
      setSaveOk(`Saved card #${card.cardNumber}`);
    } catch (e: any) {
      setSaveError(e?.message ?? "Save failed");
    } finally {
      setSavingCardId(null);
    }
  }

  async function saveThisPage() {
    if (!data) return;

    setBulkSaving(true);
    setBulkProgress(null);
    setBulkErrors([]);
    setSaveError(null);
    setSaveOk(null);

    try {
      let toSave = filteredCards;
      if (saveNeedsOnly) toSave = toSave.filter((c) => needsSetup({ ...c, bookValue: getEffectiveBookValue(c) }));
      toSave = toSave.filter(isDirty);

      if (toSave.length === 0) {
        setSaveOk("Nothing to save on this page.");
        return;
      }

      setBulkProgress({ done: 0, total: toSave.length });

      const errs: string[] = [];

      await runWithConcurrency(
        toSave,
        4,
        async (card) => {
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
                frontImageUrl: card.frontImageUrl ?? null,
                backImageUrl: card.backImageUrl ?? null,
              }),
            });

            if (!res.ok) {
              const raw = await res.text();
              let msg = `Card ${card.cardNumber}: save failed (${res.status})`;
              try {
                const j = raw ? JSON.parse(raw) : {};
                if (j?.error) msg = `Card ${card.cardNumber}: ${String(j.error)}`;
              } catch {}
              errs.push(msg);
              return;
            }

            baselineRef.current.set(card.id, buildBaselineComparable({ ...card, bookValue }));
            setBookDraft((prev) => ({ ...prev, [card.id]: moneyToDisplay(bookValue) }));
          } catch (e: any) {
            errs.push(`Card ${card.cardNumber}: ${e?.message ?? "save failed"}`);
          }
        },
        (done, total) => setBulkProgress({ done, total })
      );

      setBulkErrors(errs);

      if (errs.length) {
        setSaveError(`Saved with ${errs.length} error(s). See below.`);
      } else {
        setSaveOk(`Saved ${toSave.length} card(s) on this page.`);
      }
    } finally {
      setBulkSaving(false);
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

      baselineRef.current.delete(card.id);

      setSaveOk(`Deleted ${label}`);
    } catch (e: any) {
      setSaveError(e?.message ?? "Delete failed");
    } finally {
      setSavingCardId(null);
    }
  }

  const bodyCell: React.CSSProperties = { padding: 8, borderBottom: "1px solid #eee" };

  const totalCards = data?._count?.cards ?? data?.pagination?.totalCards ?? 0;
  const totalPages = data?.pagination?.totalPages ?? Math.max(1, Math.ceil(totalCards / pageSize));

  function PaginationControls() {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", margin: "10px 0" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setPage(1)} disabled={page <= 1 || bulkSaving} style={{ padding: "6px 10px" }}>
            « First
          </button>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || bulkSaving} style={{ padding: "6px 10px" }}>
            ‹ Prev
          </button>
          <div style={{ fontSize: 13 }}>
            Page <b>{page}</b> of <b>{totalPages}</b> (Total cards: <b>{totalCards}</b>)
          </div>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || bulkSaving} style={{ padding: "6px 10px" }}>
            Next ›
          </button>
          <button onClick={() => setPage(totalPages)} disabled={page >= totalPages || bulkSaving} style={{ padding: "6px 10px" }}>
            Last »
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>Rows/page</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const next = Number(e.target.value);
                setPageSize(Number.isFinite(next) ? next : 100);
                setPage(1);
              }}
              disabled={bulkSaving}
              style={{ padding: "6px 10px" }}
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={saveNeedsOnly} onChange={(e) => setSaveNeedsOnly(e.target.checked)} disabled={bulkSaving} />
            Save needs-setup only
          </label>

          <button onClick={saveThisPage} disabled={bulkSaving || loading || !data} style={{ padding: "8px 12px", fontWeight: 800 }}>
            {bulkSaving ? "Saving…" : "Save This Page"}
          </button>
        </div>
      </div>
    );
  }

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

        <button onClick={() => load(page, pageSize)} style={{ padding: "8px 12px" }} disabled={bulkSaving}>
          Refresh
        </button>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {pageError && <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>{pageError}</div>}
      {saveError && <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>{saveError}</div>}
      {saveOk && <div style={{ marginBottom: 12, padding: 10, background: "#efe", border: "1px solid #9f9" }}>{saveOk}</div>}

      {bulkProgress ? (
        <div style={{ marginBottom: 12, padding: 10, background: "#fffbe6", border: "1px solid #ffe58f" }}>
          Saving… <b>{bulkProgress.done}</b> / <b>{bulkProgress.total}</b>
        </div>
      ) : null}

      {bulkErrors.length ? (
        <div style={{ marginBottom: 12, padding: 10, background: "#fff5f5", border: "1px solid #ffb3b3" }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Save errors:</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {bulkErrors.slice(0, 20).map((e, i) => (
              <li key={i} style={{ fontSize: 12 }}>
                {e}
              </li>
            ))}
          </ul>
          {bulkErrors.length > 20 ? <div style={{ fontSize: 12, marginTop: 6 }}>…and {bulkErrors.length - 20} more</div> : null}
        </div>
      ) : null}

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
              • {data.isBase ? "Base" : "Non-base"} • Total Cards: {totalCards}
            </div>
          </div>

          <PaginationControls />

          {/* Search + Filters + SORT */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              border: "1px solid #ddd",
              padding: 10,
              marginBottom: 12,
              background: "#fafafa",
            }}
          >
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

            <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 22 }}>
              <input type="checkbox" checked={needsSetupOnly} onChange={(e) => setNeedsSetupOnly(e.target.checked)} />
              <span style={{ fontWeight: 700 }}>Needs setup only</span>
              <span style={{ color: "#555", fontSize: 12 }}>(price=0 or missing images)</span>
            </label>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 700 }}>Sort</div>
              <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} style={{ padding: 8, width: 220 }}>
                <option value="CARDNO_ASC">Card # (default)</option>
                <option value="BOOK_DESC">Book (high → low)</option>
                <option value="BOOK_ASC">Book (low → high)</option>
                <option value="NEEDS_SETUP_FIRST">Needs setup first</option>
                <option value="PLAYER_ASC">Player (A → Z)</option>
                <option value="TEAM_ASC">Team (A → Z)</option>
                <option value="SUBSET_ASC">Subset (A → Z)</option>
                <option value="VARIANT_ASC">Variant (A → Z)</option>
              </select>
            </div>

            <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 700 }}>Showing</div>
              <div style={{ padding: "8px 0" }}>
                {filteredCards.length} / {sortedCards.length} (this page)
              </div>
            </div>

            <button
              onClick={() => {
                setQuery("");
                setSubsetFilter("ALL");
                setVariantFilter("ALL");
                setNeedsSetupOnly(false);
                setSortMode("CARDNO_ASC");
              }}
              style={{ padding: "10px 12px" }}
            >
              Clear
            </button>
          </div>

          <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f7f7f7" }}>
                <tr>
                  {["Row", "Card #", "Player", "Team", "Subset", "Variant", "Front Image", "Back Image", "Qty", "Book", "Actions"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>
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

                          <ImageUploader label="Upload front image" value={c.frontImageUrl} onUploaded={(url) => patchCard(c.id, { frontImageUrl: url })} />
                        </div>
                      </td>

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

                          <ImageUploader label="Upload back image" value={c.backImageUrl} onUploaded={(url) => patchCard(c.id, { backImageUrl: url })} />
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
                        <button onClick={() => saveCard(c)} disabled={saving || bulkSaving} style={{ padding: "6px 10px", marginRight: 8 }}>
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button onClick={() => deleteCard(c)} disabled={saving || bulkSaving} style={{ padding: "6px 10px" }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredCards.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ padding: 12 }}>
                      No cards match your search/filters on this page.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls />
        </>
      )}
    </div>
  );
}
