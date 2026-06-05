"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ImageUploader from "@/components/ImageUploader";

type Gradeability = "COMMON" | "GREAT" | "ICONIC";
type GradeabilityOverride = Gradeability | null;

type CardRow = {
  id: number;
  cardNumber: string;
  player: string;
  team: string | null;
  position: string | null;
  subset: string | null;
  insert: string | null;
  variant: string | null;
  quantityOwned: number;
  bookValue: number;
  frontImageUrl: string | null;
  backImageUrl: string | null;
  gradeabilityOverride: GradeabilityOverride;
};

type ProductSetResponse = {
  id: string;
  name: string | null;
  isBase: boolean;
  oddsPerPack: number | null;
  productId: string;
  defaultGradeability: Gradeability;
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

type DefaultingInfo = {
  reason:
    | "ok"
    | "no-player"
    | "no-product-set"
    | "no-tier-profile"
    | "unassigned-tier"
    | "no-price-for-tier"
    | "loading"
    | "error";
  tier: string | null;
  tierLabel: string;
  defaultPrice: number | null;
  normalizedName?: string;
  error?: string | null;
};

type PricingActionResponse = {
  ok: boolean;
  action?: "syncPlayers" | "fillBlankPrices" | "overwriteAllPrices";
  summary?: {
    scannedCards?: number;
    insertedProfiles?: number;
    updatedCards?: number;
    skippedNoTier?: number;
    skippedNoPrice?: number;
    skippedAlreadyPriced?: number;
    unassignedCount?: number;
  };
  touched?: Array<{
    cardId: number;
    player: string;
    oldBookValue: number;
    newBookValue: number;
    tierLabel: string;
  }>;
  error?: string;
};

type AutoSaveState = "pending" | "saving" | "saved" | "error";

const GRADEABILITY_OPTIONS: Array<{ value: Gradeability; label: string; hint: string }> = [
  { value: "COMMON", label: "Common", hint: "Normal cards / most base cards" },
  { value: "GREAT", label: "Great", hint: "Key stars, notable rookies, chase cards" },
  { value: "ICONIC", label: "Iconic", hint: "Legendary rookies / set-defining cards" },
];

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

function normalizeGradeability(v: unknown): Gradeability {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "GREAT") return "GREAT";
  if (s === "ICONIC") return "ICONIC";
  return "COMMON";
}

function normalizeGradeabilityOverride(v: unknown): GradeabilityOverride {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().toUpperCase();
  if (s === "COMMON") return "COMMON";
  if (s === "GREAT") return "GREAT";
  if (s === "ICONIC") return "ICONIC";
  return null;
}

function gradeabilityLabel(v: Gradeability | GradeabilityOverride) {
  if (v === "GREAT") return "Great";
  if (v === "ICONIC") return "Iconic";
  return "Common";
}

function gradeabilityBadgeStyle(v: Gradeability): React.CSSProperties {
  if (v === "ICONIC") {
    return {
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 999,
      padding: "3px 8px",
      background: "#fff7ed",
      border: "1px solid #fdba74",
      color: "#9a3412",
      fontSize: 12,
      fontWeight: 900,
    };
  }

  if (v === "GREAT") {
    return {
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 999,
      padding: "3px 8px",
      background: "#eff6ff",
      border: "1px solid #93c5fd",
      color: "#1d4ed8",
      fontSize: 12,
      fontWeight: 900,
    };
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "3px 8px",
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    color: "#334155",
    fontSize: 12,
    fontWeight: 900,
  };
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
  | "GRADEABILITY_ASC"
  | "GRADEABILITY_DESC"
  | "NEEDS_SETUP_FIRST";

function pricingHintColor(info: DefaultingInfo | undefined) {
  if (!info) return "#777";
  switch (info.reason) {
    case "ok":
      return "#0f6b32";
    case "unassigned-tier":
    case "no-tier-profile":
      return "#8a5a00";
    case "no-price-for-tier":
    case "error":
      return "#8a1f1f";
    default:
      return "#666";
  }
}

function pricingHintText(info: DefaultingInfo | undefined) {
  if (!info) return "Checking default…";
  switch (info.reason) {
    case "loading":
      return "Checking default…";
    case "ok":
      return `Tier: ${info.tierLabel} • Default: ${moneyToDisplay(info.defaultPrice ?? 0)}`;
    case "unassigned-tier":
      return "Tier: Unassigned";
    case "no-tier-profile":
      return "Player not yet in repository";
    case "no-price-for-tier":
      return `Tier: ${info.tierLabel} • No product-set default price configured`;
    case "no-player":
      return "No player name";
    case "no-product-set":
      return "No product set";
    case "error":
      return info.error || "Default lookup failed";
    default:
      return "No default pricing data";
  }
}

function gradeabilityRank(v: Gradeability) {
  if (v === "ICONIC") return 3;
  if (v === "GREAT") return 2;
  return 1;
}

export default function ProductSetDetailClient({ productSetId }: { productSetId: string }) {
  const [data, setData] = useState<ProductSetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [savingCardId, setSavingCardId] = useState<number | null>(null);
  const [defaultingCardId, setDefaultingCardId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const [savingProductSet, setSavingProductSet] = useState(false);

  const [autoSaveById, setAutoSaveById] = useState<Record<number, AutoSaveState | undefined>>({});

  const [query, setQuery] = useState("");
  const [subsetFilter, setSubsetFilter] = useState("ALL");
  const [variantFilter, setVariantFilter] = useState("ALL");
  const [gradeabilityFilter, setGradeabilityFilter] = useState<"ALL" | "COMMON" | "GREAT" | "ICONIC" | "OVERRIDE">("ALL");

  const [needsSetupOnly, setNeedsSetupOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("CARDNO_ASC");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const [bookDraft, setBookDraft] = useState<Record<number, string>>({});
  const [defaultingById, setDefaultingById] = useState<Record<number, DefaultingInfo>>({});
  const [pricingBusy, setPricingBusy] = useState(false);

  const baselineRef = useRef<Map<number, string>>(new Map());

  const dataRef = useRef<ProductSetResponse | null>(null);
  const bookDraftRef = useRef<Record<number, string>>({});
  const autoSaveTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const autoSaveInFlightRef = useRef<Record<number, boolean>>({});

  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [saveNeedsOnly, setSaveNeedsOnly] = useState(true);

  const defaultGradeability = normalizeGradeability(data?.defaultGradeability);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    bookDraftRef.current = bookDraft;
  }, [bookDraft]);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(autoSaveTimersRef.current)) {
        clearTimeout(timer);
      }
      autoSaveTimersRef.current = {};
    };
  }, []);

  function getEffectiveGradeability(card: CardRow) {
    return normalizeGradeability(card.gradeabilityOverride ?? defaultGradeability);
  }

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

      const payload = {
        ...j,
        defaultGradeability: normalizeGradeability(j?.defaultGradeability),
        cards: Array.isArray(j?.cards)
          ? j.cards.map((c: any) => ({
              ...c,
              gradeabilityOverride: normalizeGradeabilityOverride(c?.gradeabilityOverride),
            }))
          : [],
      } as ProductSetResponse;

      setData(payload);
      dataRef.current = payload;

      const nextDraft: Record<number, string> = {};
      for (const c of payload.cards ?? []) nextDraft[c.id] = moneyToDisplay(c.bookValue ?? 0);
      setBookDraft(nextDraft);
      bookDraftRef.current = nextDraft;

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
            bookValue: typeof c.bookValue === "number" ? c.bookValue : 0,
            frontImageUrl: c.frontImageUrl ?? null,
            backImageUrl: c.backImageUrl ?? null,
            gradeabilityOverride: c.gradeabilityOverride ?? null,
          })
        );
      }
      baselineRef.current = map;
    } catch (e: any) {
      setPageError(e?.message ?? "Failed to load");
      setData(null);
      dataRef.current = null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSetId, page, pageSize]);

  const defaultingPageKey = useMemo(() => {
    const cards = data?.cards ?? [];
    return cards.map((c) => c.id).join(",");
  }, [data?.cards]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadDefaultingForPage() {
      const cards = dataRef.current?.cards ?? [];
      if (!cards.length) {
        setDefaultingById({});
        return;
      }

      const initial: Record<number, DefaultingInfo> = {};
      for (const c of cards) {
        initial[c.id] = {
          reason: "loading",
          tier: null,
          tierLabel: "Checking…",
          defaultPrice: null,
        };
      }
      setDefaultingById(initial);

      try {
        const res = await fetch(`/api/product-sets/${encodeURIComponent(productSetId)}/default-prices`, {
          cache: "no-store",
          signal: controller.signal,
        });

        const raw = await res.text();
        let j: any = {};
        try {
          j = raw ? JSON.parse(raw) : {};
        } catch {}

        if (!res.ok || !j?.ok) throw new Error(j?.error ?? "Failed to load default prices");

        const results = j.results ?? {};
        const mapped: Record<number, DefaultingInfo> = {};

        for (const card of cards) {
          const r = results[card.id];

          mapped[card.id] = {
            reason: r?.reason ?? "error",
            tier: r?.tier ?? null,
            tierLabel: r?.tierLabel ?? "Unknown",
            defaultPrice: typeof r?.defaultPrice === "number" ? r.defaultPrice : null,
            normalizedName: r?.normalizedName,
            error: null,
          };
        }

        if (!cancelled) setDefaultingById(mapped);
      } catch (e: any) {
        if (e?.name === "AbortError") return;

        const fallback: Record<number, DefaultingInfo> = {};
        for (const c of cards) {
          fallback[c.id] = {
            reason: "error",
            tier: null,
            tierLabel: "Error",
            defaultPrice: null,
            error: e?.message ?? "Failed",
          };
        }

        if (!cancelled) setDefaultingById(fallback);
      }
    }

    loadDefaultingForPage();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [defaultingPageKey, productSetId]);

  function getEffectiveBookValue(card: CardRow) {
    const draft = bookDraft[card.id];
    if (typeof draft === "string") return displayToMoney(draft);
    return typeof card.bookValue === "number" ? card.bookValue : 0;
  }

  function getEffectiveBookValueFromRefs(card: CardRow) {
    const draft = bookDraftRef.current[card.id];
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
      bookValue: getEffectiveBookValue(card),
      frontImageUrl: card.frontImageUrl ?? null,
      backImageUrl: card.backImageUrl ?? null,
      gradeabilityOverride: card.gradeabilityOverride ?? null,
    });
  }

  function buildBaselineComparableFromRefs(card: CardRow) {
    return JSON.stringify({
      cardNumber: card.cardNumber ?? "",
      player: card.player ?? "",
      team: card.team ?? null,
      position: card.position ?? null,
      subset: card.subset ?? null,
      variant: card.variant ?? null,
      bookValue: getEffectiveBookValueFromRefs(card),
      frontImageUrl: card.frontImageUrl ?? null,
      backImageUrl: card.backImageUrl ?? null,
      gradeabilityOverride: card.gradeabilityOverride ?? null,
    });
  }

  function getLatestCard(cardId: number, patch: Partial<CardRow> = {}) {
    const current = dataRef.current?.cards.find((c) => c.id === cardId);
    if (!current) return null;
    return { ...current, ...patch };
  }

  function buildSavePayload(card: CardRow) {
    const bookValue = getEffectiveBookValueFromRefs(card);

    return {
      cardNumber: card.cardNumber,
      player: card.player,
      team: card.team,
      position: card.position,
      subset: card.subset,
      variant: card.variant,
      bookValue,
      frontImageUrl: card.frontImageUrl ?? null,
      backImageUrl: card.backImageUrl ?? null,
      gradeabilityOverride: card.gradeabilityOverride ?? null,
    };
  }

  async function saveProductSetDefaultGradeability(next: Gradeability) {
    if (!data) return;

    const previous = defaultGradeability;

    setSavingProductSet(true);
    setSaveError(null);
    setSaveOk(null);

    setData((prev) => {
      if (!prev) return prev;
      const nextData = { ...prev, defaultGradeability: next };
      dataRef.current = nextData;
      return nextData;
    });

    try {
      const res = await fetch(`/api/product-sets/${encodeURIComponent(productSetId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultGradeability: next }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Product set save returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok || !j?.ok) throw new Error(j?.error ?? `Save failed (${res.status})`);

      setSaveOk(`Saved product-set grading default: ${gradeabilityLabel(next)}`);
    } catch (e: any) {
      setData((prev) => {
        if (!prev) return prev;
        const nextData = { ...prev, defaultGradeability: previous };
        dataRef.current = nextData;
        return nextData;
      });
      setSaveError(e?.message ?? "Failed to save product-set gradeability");
    } finally {
      setSavingProductSet(false);
    }
  }

  async function saveCardNow(cardId: number, patch: Partial<CardRow> = {}, source: "auto" | "manual" = "auto") {
    const card = getLatestCard(cardId, patch);
    if (!card) return;

    if (autoSaveInFlightRef.current[cardId]) {
      scheduleAutoSave(cardId, patch, 700);
      return;
    }

    autoSaveInFlightRef.current[cardId] = true;
    setSavingCardId(cardId);
    setAutoSaveById((prev) => ({ ...prev, [cardId]: "saving" }));

    if (source === "manual") {
      setSaveError(null);
      setSaveOk(null);
    }

    try {
      const res = await fetch(`/api/cards/${encodeURIComponent(String(cardId))}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSavePayload(card)),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Save returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Save failed (${res.status})`);

      const savedBook = getEffectiveBookValueFromRefs(card);
      const savedOverride = normalizeGradeabilityOverride(j?.card?.gradeabilityOverride ?? card.gradeabilityOverride);

      baselineRef.current.set(
        cardId,
        buildBaselineComparableFromRefs({ ...card, bookValue: savedBook, gradeabilityOverride: savedOverride })
      );

      patchCard(cardId, { bookValue: savedBook, gradeabilityOverride: savedOverride }, { autosave: false });

      setBookDraft((prev) => {
        const next = { ...prev, [cardId]: moneyToDisplay(savedBook) };
        bookDraftRef.current = next;
        return next;
      });

      setAutoSaveById((prev) => ({ ...prev, [cardId]: "saved" }));
      if (source === "manual") setSaveOk(`Saved card #${card.cardNumber}`);

      window.setTimeout(() => {
        setAutoSaveById((prev) => {
          if (prev[cardId] !== "saved") return prev;
          return { ...prev, [cardId]: undefined };
        });
      }, 1400);
    } catch (e: any) {
      setAutoSaveById((prev) => ({ ...prev, [cardId]: "error" }));
      if (source === "manual") setSaveError(e?.message ?? "Save failed");
      else setSaveError(`Autosave failed for card #${card.cardNumber}: ${e?.message ?? "Save failed"}`);
    } finally {
      autoSaveInFlightRef.current[cardId] = false;
      setSavingCardId(null);
    }
  }

  function scheduleAutoSave(cardId: number, patch: Partial<CardRow> = {}, delayMs = 800) {
    const existing = autoSaveTimersRef.current[cardId];
    if (existing) clearTimeout(existing);

    setAutoSaveById((prev) => ({ ...prev, [cardId]: "pending" }));

    autoSaveTimersRef.current[cardId] = setTimeout(() => {
      delete autoSaveTimersRef.current[cardId];
      saveCardNow(cardId, patch, "auto");
    }, delayMs);
  }

  function patchCard(
    cardId: number,
    patch: Partial<CardRow>,
    options: { autosave?: boolean; autosaveDelayMs?: number } = {}
  ) {
    const shouldAutosave = options.autosave !== false;

    setData((prev) => {
      if (!prev) return prev;

      const next = {
        ...prev,
        cards: prev.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
      };

      dataRef.current = next;
      return next;
    });

    if (shouldAutosave) scheduleAutoSave(cardId, patch, options.autosaveDelayMs ?? 800);
  }

  function isDirty(card: CardRow) {
    const base = baselineRef.current.get(card.id);
    if (!base) return true;
    return base !== buildBaselineComparable(card);
  }  
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

    const cmpStr = (a: any, b: any) =>
      String(a ?? "").localeCompare(String(b ?? ""), undefined, { sensitivity: "base" });

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
        case "GRADEABILITY_ASC": {
          const gx = gradeabilityRank(getEffectiveGradeability(x));
          const gy = gradeabilityRank(getEffectiveGradeability(y));
          if (gx !== gy) return gx - gy;
          return cmpCardNo(x, y);
        }
        case "GRADEABILITY_DESC": {
          const gx = gradeabilityRank(getEffectiveGradeability(x));
          const gy = gradeabilityRank(getEffectiveGradeability(y));
          if (gx !== gy) return gy - gx;
          return cmpCardNo(x, y);
        }
        case "NEEDS_SETUP_FIRST": {
          const nx = needsSetup({ ...x, bookValue: getEffectiveBookValue(x) }) ? 1 : 0;
          const ny = needsSetup({ ...y, bookValue: getEffectiveBookValue(y) }) ? 1 : 0;
          if (ny !== nx) return ny - nx;
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
  }, [data, sortMode, bookDraft, defaultGradeability]);

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

      const effectiveGradeability = getEffectiveGradeability(c);
      if (gradeabilityFilter === "OVERRIDE" && !c.gradeabilityOverride) return false;
      if (
        gradeabilityFilter !== "ALL" &&
        gradeabilityFilter !== "OVERRIDE" &&
        effectiveGradeability !== gradeabilityFilter
      ) {
        return false;
      }

      if (needsSetupOnly) {
        const effective = { ...c, bookValue: getEffectiveBookValue(c) };
        if (!needsSetup(effective)) return false;
      }

      if (!q) return true;
      const hay = `${c.cardNumber} ${c.player} ${c.team ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [
    sortedCards,
    query,
    subsetFilter,
    variantFilter,
    gradeabilityFilter,
    needsSetupOnly,
    bookDraft,
    defaultGradeability,
  ]);

  async function saveCard(card: CardRow) {
    const existing = autoSaveTimersRef.current[card.id];
    if (existing) {
      clearTimeout(existing);
      delete autoSaveTimersRef.current[card.id];
    }

    await saveCardNow(card.id, {}, "manual");
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
                bookValue,
                frontImageUrl: card.frontImageUrl ?? null,
                backImageUrl: card.backImageUrl ?? null,
                gradeabilityOverride: card.gradeabilityOverride ?? null,
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
            setBookDraft((prev) => {
              const next = { ...prev, [card.id]: moneyToDisplay(bookValue) };
              bookDraftRef.current = next;
              return next;
            });
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

      setData((prev) => {
        const next = prev ? { ...prev, cards: prev.cards.filter((c) => c.id !== card.id) } : prev;
        dataRef.current = next;
        return next;
      });

      setBookDraft((prev) => {
        const next = { ...prev };
        delete next[card.id];
        bookDraftRef.current = next;
        return next;
      });

      setDefaultingById((prev) => {
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

  async function refreshPlayerRepository() {
    setPricingBusy(true);
    setSaveError(null);
    setSaveOk(null);

    try {
      const res = await fetch(`/api/product-sets/${encodeURIComponent(productSetId)}/pricing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "syncPlayers" }),
      });

      const raw = await res.text();
      let j: PricingActionResponse | any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Repository refresh returned non-JSON (${res.status})`);
      }

      if (!res.ok || !j?.ok) throw new Error(j?.error ?? `Repository refresh failed (${res.status})`);

      setSaveOk(
        `Repository refreshed. Scanned ${j?.summary?.scannedCards ?? 0} cards • inserted ${
          j?.summary?.insertedProfiles ?? 0
        } player profile(s) • unassigned in sport: ${j?.summary?.unassignedCount ?? 0}.`
      );

      await load(page, pageSize);
    } catch (e: any) {
      setSaveError(e?.message ?? "Repository refresh failed");
    } finally {
      setPricingBusy(false);
    }
  }

  async function runPricingAction(action: "fillBlankPrices" | "overwriteAllPrices") {
    setPricingBusy(true);
    setSaveError(null);
    setSaveOk(null);

    try {
      const res = await fetch(`/api/product-sets/${encodeURIComponent(productSetId)}/pricing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const raw = await res.text();
      let j: PricingActionResponse | any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Pricing action returned non-JSON (${res.status})`);
      }

      if (!res.ok || !j?.ok) throw new Error(j?.error ?? `Pricing action failed (${res.status})`);

      const s = j?.summary ?? {};
      const actionLabel = action === "fillBlankPrices" ? "Fill Blank Prices" : "Overwrite All Prices";

      setSaveOk(
        `${actionLabel} complete. Updated ${s.updatedCards ?? 0} card(s) • skipped no tier: ${
          s.skippedNoTier ?? 0
        } • skipped no price: ${s.skippedNoPrice ?? 0}${
          action === "fillBlankPrices" ? ` • already priced: ${s.skippedAlreadyPriced ?? 0}` : ""
        }.`
      );

      await load(page, pageSize);
    } catch (e: any) {
      setSaveError(e?.message ?? "Pricing action failed");
    } finally {
      setPricingBusy(false);
    }
  }

  async function fillBlankPrices() {
    await runPricingAction("fillBlankPrices");
  }

  async function overwriteAllPrices() {
    const ok = window.confirm(
      "Overwrite all prices on this product set with tier defaults?\n\nThis will replace manual pricing where a tier + product-set default exists."
    );
    if (!ok) return;
    await runPricingAction("overwriteAllPrices");
  }

  async function useDefaultForCard(card: CardRow) {
    setDefaultingCardId(card.id);
    setSaveError(null);
    setSaveOk(null);

    try {
      const res = await fetch(`/api/cards/${encodeURIComponent(String(card.id))}/default-price`, {
        method: "POST",
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Default price returned non-JSON (${res.status})`);
      }

      if (!res.ok || !j?.ok) {
        throw new Error(j?.error ?? `Failed to apply default price (${res.status})`);
      }

      const nextBook =
        typeof j?.card?.bookValue === "number"
          ? j.card.bookValue
          : typeof j?.defaulting?.defaultPrice === "number"
            ? j.defaulting.defaultPrice
            : card.bookValue;

      patchCard(card.id, { bookValue: nextBook }, { autosave: true, autosaveDelayMs: 100 });
      setBookDraft((prev) => {
        const next = { ...prev, [card.id]: moneyToDisplay(nextBook) };
        bookDraftRef.current = next;
        return next;
      });
      setDefaultingById((prev) => ({
        ...prev,
        [card.id]: {
          reason: j?.defaulting?.reason ?? "ok",
          tier: j?.defaulting?.tier ?? null,
          tierLabel: j?.defaulting?.tierLabel ?? "Unknown",
          defaultPrice: typeof j?.defaulting?.defaultPrice === "number" ? j.defaulting.defaultPrice : null,
          normalizedName: j?.defaulting?.normalizedName,
        },
      }));
      setSaveOk(`Applied default price to #${card.cardNumber} ${card.player}`);
    } catch (e: any) {
      setSaveError(e?.message ?? "Failed to apply default price");
    } finally {
      setDefaultingCardId(null);
    }
  }

  function autoSaveText(cardId: number) {
    const status = autoSaveById[cardId];
    if (savingCardId === cardId || status === "saving") return "Saving…";
    if (status === "pending") return "Autosave pending…";
    if (status === "saved") return "Saved";
    if (status === "error") return "Autosave failed";
    return "";
  }

  const bodyCell: React.CSSProperties = { padding: 8, borderBottom: "1px solid #eee" };

  const totalCards = data?._count?.cards ?? data?.pagination?.totalCards ?? 0;
  const totalPages = data?.pagination?.totalPages ?? Math.max(1, Math.ceil(totalCards / pageSize));

  function PaginationControls() {
    return (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          margin: "10px 0",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => setPage(1)}
            disabled={page <= 1 || bulkSaving || pricingBusy}
            style={{ padding: "6px 10px" }}
          >
            « First
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || bulkSaving || pricingBusy}
            style={{ padding: "6px 10px" }}
          >
            ‹ Prev
          </button>
          <div style={{ fontSize: 13 }}>
            Page <b>{page}</b> of <b>{totalPages}</b> (Total cards: <b>{totalCards}</b>)
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || bulkSaving || pricingBusy}
            style={{ padding: "6px 10px" }}
          >
            Next ›
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages || bulkSaving || pricingBusy}
            style={{ padding: "6px 10px" }}
          >
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
              disabled={bulkSaving || pricingBusy}
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
            <input
              type="checkbox"
              checked={saveNeedsOnly}
              onChange={(e) => setSaveNeedsOnly(e.target.checked)}
              disabled={bulkSaving || pricingBusy}
            />
            Save needs-setup only
          </label>

          <button
            onClick={saveThisPage}
            disabled={bulkSaving || loading || !data || pricingBusy}
            style={{ padding: "8px 12px", fontWeight: 800 }}
          >
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

        <button
          onClick={() => load(page, pageSize)}
          style={{ padding: "8px 12px" }}
          disabled={bulkSaving || pricingBusy || savingProductSet}
        >
          Refresh
        </button>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {pageError && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {pageError}
        </div>
      )}
      {saveError && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {saveError}
        </div>
      )}
      {saveOk && (
        <div style={{ marginBottom: 12, padding: 10, background: "#efe", border: "1px solid #9f9" }}>
          {saveOk}
        </div>
      )}

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
          {bulkErrors.length > 20 ? (
            <div style={{ fontSize: 12, marginTop: 6 }}>…and {bulkErrors.length - 20} more</div>
          ) : null}
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
              <Link
                href={`/admin/products/${encodeURIComponent(data.productId)}`}
                style={{ textDecoration: "underline", fontWeight: 700 }}
              >
                {data.productId}
              </Link>{" "}
              • {data.isBase ? "Base" : "Non-base"} • Total Cards: {totalCards}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              border: "1px solid #ddd",
              background: "#f8fafc",
              padding: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 900 }}>VCS Grading Defaults</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 800 }}>Product-set default</div>
              <select
                value={defaultGradeability}
                onChange={(e) => saveProductSetDefaultGradeability(normalizeGradeability(e.target.value))}
                disabled={savingProductSet || bulkSaving || pricingBusy}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ccc", minWidth: 160 }}
              >
                {GRADEABILITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <span style={gradeabilityBadgeStyle(defaultGradeability)}>
              Default: {gradeabilityLabel(defaultGradeability)}
            </span>

            <div style={{ fontSize: 12, color: "#555", lineHeight: 1.35, maxWidth: 700 }}>
              This controls grading multipliers and odds for cards without an override. Use card-level overrides for key rookies,
              stars, and chase cards. Existing already-graded cards keep their grade number, but their displayed value uses the
              current gradeability setting.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              border: "1px solid #ddd",
              background: "#f8fafc",
              padding: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 800 }}>Pricing Tools</div>

            <button
              onClick={refreshPlayerRepository}
              disabled={pricingBusy || bulkSaving || loading || savingProductSet}
              style={{ padding: "8px 12px", fontWeight: 800 }}
            >
              {pricingBusy ? "Working…" : "Refresh Player Repository"}
            </button>

            <button
              onClick={fillBlankPrices}
              disabled={pricingBusy || bulkSaving || loading || savingProductSet}
              style={{ padding: "8px 12px", fontWeight: 800 }}
            >
              Fill Blank Prices
            </button>

            <button
              onClick={overwriteAllPrices}
              disabled={pricingBusy || bulkSaving || loading || savingProductSet}
              style={{ padding: "8px 12px", fontWeight: 800, background: "#fff4e5" }}
            >
              Overwrite All Prices
            </button>

            <div style={{ color: "#555", fontSize: 12, marginLeft: "auto" }}>
              Uses tier defaults when a player has an assigned tier and this product set has a configured default for that tier.
            </div>
          </div>

          <PaginationControls />

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
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Card #, player, team…"
                style={{ padding: 8, width: 260 }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 700 }}>Subset</div>
              <select
                value={subsetFilter}
                onChange={(e) => setSubsetFilter(e.target.value)}
                style={{ padding: 8, width: 220 }}
              >
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
              <select
                value={variantFilter}
                onChange={(e) => setVariantFilter(e.target.value)}
                style={{ padding: 8, width: 220 }}
              >
                <option value="ALL">All</option>
                {filterOptions.variants.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 700 }}>VCS Tier</div>
              <select
                value={gradeabilityFilter}
                onChange={(e) => setGradeabilityFilter(e.target.value as any)}
                style={{ padding: 8, width: 180 }}
              >
                <option value="ALL">All</option>
                <option value="COMMON">Common</option>
                <option value="GREAT">Great</option>
                <option value="ICONIC">Iconic</option>
                <option value="OVERRIDE">Overrides only</option>
              </select>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 22 }}>
              <input type="checkbox" checked={needsSetupOnly} onChange={(e) => setNeedsSetupOnly(e.target.checked)} />
              <span style={{ fontWeight: 700 }}>Needs setup only</span>
              <span style={{ color: "#555", fontSize: 12 }}>(price=0 or missing images)</span>
            </label>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 700 }}>Sort</div>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                style={{ padding: 8, width: 220 }}
              >
                <option value="CARDNO_ASC">Card # (default)</option>
                <option value="BOOK_DESC">Book (high → low)</option>
                <option value="BOOK_ASC">Book (low → high)</option>
                <option value="GRADEABILITY_DESC">VCS Tier (Iconic → Common)</option>
                <option value="GRADEABILITY_ASC">VCS Tier (Common → Iconic)</option>
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
                setGradeabilityFilter("ALL");
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
                  {[
                    "Row",
                    "Card #",
                    "Player",
                    "Team",
                    "Subset",
                    "Variant",
                    "VCS Tier",
                    "Front Image",
                    "Back Image",
                    "Book",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredCards.map((c, idx) => {
                  const zebra = idx % 2 === 0 ? "#fff" : "#fcfcfc";
                  const saving = savingCardId === c.id;
                  const defaulting = defaultingCardId === c.id;
                  const info = defaultingById[c.id];
                  const effectiveGradeability = getEffectiveGradeability(c);

                  return (
                    <tr key={c.id} style={{ background: zebra }}>
                      <td style={{ ...bodyCell, width: 60 }}>{idx + 1}</td>

                      <td style={{ ...bodyCell, width: 110 }}>
                        <input
                          value={c.cardNumber}
                          onChange={(e) => patchCard(c.id, { cardNumber: e.target.value })}
                          style={{ width: "100%", padding: 6 }}
                        />
                      </td>

                      <td style={{ ...bodyCell, minWidth: 280 }}>
                        <input
                          value={c.player ?? ""}
                          onChange={(e) => patchCard(c.id, { player: e.target.value })}
                          style={{ width: "100%", padding: 6 }}
                        />
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 12,
                            color: pricingHintColor(info),
                            fontWeight: 700,
                            lineHeight: 1.35,
                          }}
                        >
                          {pricingHintText(info)}
                        </div>
                      </td>

                      <td style={{ ...bodyCell, minWidth: 220 }}>
                        <input
                          value={c.team ?? ""}
                          onChange={(e) => patchCard(c.id, { team: e.target.value || null })}
                          style={{ width: "100%", padding: 6 }}
                        />
                      </td>

                      <td style={{ ...bodyCell, minWidth: 180 }}>
                        <input
                          value={c.subset ?? ""}
                          onChange={(e) => patchCard(c.id, { subset: e.target.value || null })}
                          style={{ width: "100%", padding: 6 }}
                        />
                      </td>

                      <td style={{ ...bodyCell, minWidth: 160 }}>
                        <input
                          value={c.variant ?? ""}
                          onChange={(e) => patchCard(c.id, { variant: e.target.value || null })}
                          style={{ width: "100%", padding: 6 }}
                        />
                      </td>

                      <td style={{ ...bodyCell, minWidth: 210 }}>
                        <select
                          value={c.gradeabilityOverride ?? ""}
                          onChange={(e) => {
                            const next = normalizeGradeabilityOverride(e.target.value);
                            patchCard(c.id, { gradeabilityOverride: next }, { autosaveDelayMs: 250 });
                          }}
                          disabled={saving || bulkSaving || pricingBusy || savingProductSet}
                          style={{ width: "100%", padding: 7, borderRadius: 8, border: "1px solid #ccc" }}
                        >
                          <option value="">Use set default ({gradeabilityLabel(defaultGradeability)})</option>
                          <option value="COMMON">Common</option>
                          <option value="GREAT">Great</option>
                          <option value="ICONIC">Iconic</option>
                        </select>

                        <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={gradeabilityBadgeStyle(effectiveGradeability)}>
                            {gradeabilityLabel(effectiveGradeability)}
                          </span>
                          {c.gradeabilityOverride ? (
                            <span style={{ fontSize: 11, color: "#555", fontWeight: 800 }}>override</span>
                          ) : (
                            <span style={{ fontSize: 11, color: "#777" }}>set default</span>
                          )}
                        </div>
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

                          <ImageUploader
                            label="Upload front image"
                            value={c.frontImageUrl}
                            onUploaded={(url) => patchCard(c.id, { frontImageUrl: url }, { autosaveDelayMs: 100 })}
                          />
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

                          <ImageUploader
                            label="Upload back image"
                            value={c.backImageUrl}
                            onUploaded={(url) => patchCard(c.id, { backImageUrl: url }, { autosaveDelayMs: 100 })}
                          />
                        </div>
                      </td>

                      <td style={{ ...bodyCell, width: 150 }}>
                        <input
                          value={bookDraft[c.id] ?? moneyToDisplay(c.bookValue ?? 0)}
                          onChange={(e) => {
                            const nextRaw = e.target.value;
                            setBookDraft((prev) => {
                              const next = { ...prev, [c.id]: nextRaw };
                              bookDraftRef.current = next;
                              return next;
                            });

                            const parsed = displayToMoney(nextRaw);
                            patchCard(c.id, { bookValue: parsed }, { autosaveDelayMs: 900 });
                          }}
                          onBlur={() => {
                            const raw = bookDraft[c.id] ?? moneyToDisplay(c.bookValue ?? 0);
                            const parsed = displayToMoney(raw);
                            patchCard(c.id, { bookValue: parsed }, { autosaveDelayMs: 100 });
                            setBookDraft((prev) => {
                              const next = { ...prev, [c.id]: moneyToDisplay(parsed) };
                              bookDraftRef.current = next;
                              return next;
                            });
                          }}
                          style={{ width: "100%", padding: 6 }}
                        />

                        <div
                          style={{
                            minHeight: 18,
                            marginTop: 4,
                            fontSize: 12,
                            color: autoSaveById[c.id] === "error" ? "#8a1f1f" : "#666",
                          }}
                        >
                          {autoSaveText(c.id)}
                        </div>

                        <button
                          onClick={() => useDefaultForCard(c)}
                          disabled={saving || defaulting || bulkSaving || pricingBusy || savingProductSet}
                          style={{ marginTop: 8, width: "100%", padding: "6px 8px", fontWeight: 800 }}
                          title="Apply the configured tier default for this player on this product set"
                        >
                          {defaulting ? "Applying…" : "Use Default"}
                        </button>
                      </td>

                      <td style={{ ...bodyCell, whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => saveCard(c)}
                          disabled={saving || bulkSaving || pricingBusy || savingProductSet}
                          style={{ padding: "6px 10px", marginRight: 8 }}
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => deleteCard(c)}
                          disabled={saving || bulkSaving || pricingBusy || savingProductSet}
                          style={{ padding: "6px 10px" }}
                        >
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