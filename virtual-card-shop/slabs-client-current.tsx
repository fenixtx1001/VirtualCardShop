// src/app/collection/slabs/slabs-client.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import VcsSlab from "@/components/grading/VcsSlab";

type Gradeability = "COMMON" | "GREAT" | "ICONIC";
type SortMode = "grade_desc" | "value_desc" | "player_asc" | "year_desc" | "newest" | "random";

type SlabRow = {
  key: string;
  cardId: number;
  player: string;
  cardNumber: string;
  team: string | null;
  subset: string | null;
  variant: string | null;

  productId: string;
  productYear: number | null;
  productBrand: string | null;
  productSport: string | null;

  productSetId: string | null;
  productSetName: string | null;
  productSetIsBase: boolean | null;

  frontImageUrl: string | null;
  backImageUrl: string | null;

  grade: number;
  gradeLabel: string;
  quantity: number;
  rawBookValueCents: number;
  valueCents: number;
  totalValueCents: number;

  gradeability: Gradeability;
  gradeabilityLabel: string;

  gradedAt: string | null;
};

type ApiResponse = {
  ok: boolean;
  q: string;
  grade: string;
  tier: "ALL" | Gradeability;
  sort: SortMode;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  totalQuantity: number;
  totalValueCents: number;
  countsByGrade: {
    "6": number;
    "7": number;
    "8": number;
    "9": number;
    "10": number;
  };
  countsByTier: {
    COMMON: number;
    GREAT: number;
    ICONIC: number;
  };
  rows: SlabRow[];
};

const colors = {
  bg: "#fbfaf7",
  card: "#ffffff",
  border: "#e7e3dc",
  text: "#121212",
  subtext: "#333333",
  mutedText: "#666666",
  muted: "#f2efe9",
  blue: "#16477d",
  blueSoft: "#eef6ff",
  green: "#185c24",
  greenSoft: "#f0fff3",
  gold: "#7a5200",
  goldSoft: "#fff8e8",
  red: "#7a1f1f",
  redSoft: "#fff1f1",
  carouselBg: "#030712",
  carouselPanel: "rgba(255,255,255,0.08)",
  carouselBorder: "rgba(255,255,255,0.14)",
  carouselText: "#f8fafc",
  carouselMuted: "rgba(248,250,252,0.68)",
};

function safeNum(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatDollarsFromCents(cents: number) {
  const safe = Number.isFinite(cents) ? cents : 0;

  return (safe / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function getSetName(row: SlabRow) {
  const productSetName = row.productSetName?.trim();

  if (productSetName) return productSetName;

  const fallbackSetLabel =
    row.productSetIsBase == null
      ? ""
      : row.productSetIsBase
        ? "Base"
        : "Insert";

  return [row.productYear, row.productBrand, fallbackSetLabel].filter(Boolean).join(" ") || row.productId;
}

function getSubline(row: SlabRow) {
  return [row.team, row.subset, row.variant, row.productSport]
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .join(" • ");
}

function GradeFilterButton({
  label,
  count,
  active,
  onClick,
  dark = false,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dark?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? (dark ? "rgba(125,211,252,0.8)" : colors.blue) : dark ? colors.carouselBorder : colors.border}`,
        background: active ? (dark ? "rgba(14,165,233,0.18)" : colors.blueSoft) : dark ? "rgba(255,255,255,0.06)" : "#fff",
        color: active ? (dark ? "#e0f2fe" : colors.blue) : dark ? colors.carouselText : colors.text,
        borderRadius: 999,
        padding: "7px 10px",
        fontWeight: 950,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}{" "}
      <span style={{ color: dark ? colors.carouselMuted : colors.mutedText }}>
        ({count})
      </span>
    </button>
  );
}

function TierFilterButton({
  label,
  count,
  active,
  onClick,
  dark = false,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dark?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? (dark ? "rgba(251,191,36,0.78)" : colors.gold) : dark ? colors.carouselBorder : colors.border}`,
        background: active ? (dark ? "rgba(251,191,36,0.16)" : colors.goldSoft) : dark ? "rgba(255,255,255,0.06)" : "#fff",
        color: active ? (dark ? "#fef3c7" : colors.gold) : dark ? colors.carouselText : colors.text,
        borderRadius: 999,
        padding: "7px 10px",
        fontWeight: 950,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}{" "}
      <span style={{ color: dark ? colors.carouselMuted : colors.mutedText }}>
        ({count})
      </span>
    </button>
  );
}

export default function SlabsClient() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState("ALL");
  const [tier, setTier] = useState<"ALL" | Gradeability>("ALL");
  const [sort, setSort] = useState<SortMode>("grade_desc");
  const [randomSeed, setRandomSeed] = useState(() => String(Date.now()));
  const [page, setPage] = useState(1);
  const [activeSlabIndex, setActiveSlabIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      if (grade !== "ALL") qs.set("grade", grade);
      if (tier !== "ALL") qs.set("tier", tier);
      qs.set("sort", sort);
      if (sort === "random") qs.set("seed", randomSeed);
      qs.set("page", String(page));
      qs.set("pageSize", "24");

      const res = await fetch(`/api/collection/slabs?${qs.toString()}`, {
        cache: "no-store",
      });

      const raw = await res.text();

      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Slabs API returned non-JSON (${res.status}): ${raw.slice(0, 180)}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Failed to load slabs (${res.status})`);
      }

      setData(json as ApiResponse);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load slabs");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, grade, tier, sort, randomSeed, page]);

  useEffect(() => {
    function updateIsMobile() {
      setIsMobile(window.innerWidth < 768);
    }

    updateIsMobile();
    window.addEventListener("resize", updateIsMobile);

    return () => window.removeEventListener("resize", updateIsMobile);
  }, []);

  useEffect(() => {
    setActiveSlabIndex(0);
  }, [q, grade, tier, sort, randomSeed, page]);

  const rows = data?.rows ?? [];

  const totalQuantity = safeNum(data?.totalQuantity);
  const totalValueCents = safeNum(data?.totalValueCents);
  const totalUniqueSlabs = safeNum(data?.total);

  const gradeCounts = useMemo(() => {
    return data?.countsByGrade ?? { "6": 0, "7": 0, "8": 0, "9": 0, "10": 0 };
  }, [data]);

  const tierCounts = useMemo(() => {
    return data?.countsByTier ?? { COMMON: 0, GREAT: 0, ICONIC: 0 };
  }, [data]);

  function submitSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPage(1);
    if (sort === "random") setRandomSeed(String(Date.now()));
    setQ(queryInput.trim());
    setMobileControlsOpen(false);
  }

  function clearFilters() {
    setQueryInput("");
    setQ("");
    setGrade("ALL");
    setTier("ALL");
    setSort("grade_desc");
    setPage(1);
    setMobileControlsOpen(false);
  }

  function reshuffleRandom() {
    setSort("random");
    setRandomSeed(String(Date.now()));
    setPage(1);
    setActiveSlabIndex(0);
  }

  const mobileCarouselActive = isMobile && rows.length > 0 && !loading && !err;

  return (
    <main
      style={{
        background: mobileCarouselActive
          ? `radial-gradient(circle at 50% 10%, rgba(30,64,175,0.34), transparent 32%), radial-gradient(circle at 50% 60%, rgba(120,53,15,0.22), transparent 35%), ${colors.carouselBg}`
          : colors.bg,
        minHeight: mobileCarouselActive ? 0 : "calc(100vh - 80px)",
        padding: mobileCarouselActive ? 0 : 16,
        color: mobileCarouselActive ? colors.carouselText : colors.text,
        fontFamily: "system-ui",
        transition: "background 240ms ease",
      }}
    >
      <div style={{ maxWidth: mobileCarouselActive ? "none" : 1260, margin: "0 auto" }}>
        {mobileCarouselActive ? (
          <MobileSlabCarousel
            rows={rows}
            activeSlabIndex={activeSlabIndex}
            setActiveSlabIndex={setActiveSlabIndex}
            touchStartX={touchStartX}
            setTouchStartX={setTouchStartX}
            page={data?.page ?? 1}
            totalPages={data?.totalPages ?? 1}
            setPage={setPage}
            queryInput={queryInput}
            setQueryInput={setQueryInput}
            submitSearch={submitSearch}
            clearFilters={clearFilters}
            grade={grade}
            setGrade={setGrade}
            tier={tier}
            setTier={setTier}
            sort={sort}
            setSort={setSort}
            setRandomSeed={setRandomSeed}
            gradeCounts={gradeCounts}
            tierCounts={tierCounts}
            totalQuantity={totalQuantity}
            totalValueCents={totalValueCents}
            totalUniqueSlabs={totalUniqueSlabs}
            mobileControlsOpen={mobileControlsOpen}
            setMobileControlsOpen={setMobileControlsOpen}
            reshuffleRandom={reshuffleRandom}
          />
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div>
                <Link
                  href="/collection"
                  style={{
                    color: colors.blue,
                    fontWeight: 900,
                    fontSize: 13,
                  }}
                >
                  ← Back to Collection
                </Link>

                <h1 style={{ fontSize: 34, fontWeight: 1000, marginTop: 8, marginBottom: 6 }}>
                  VCS Slab Gallery
                </h1>

                <div style={{ color: colors.subtext, fontSize: 14, fontWeight: 750, lineHeight: 1.45 }}>
                  Browse your graded cards as a premium slabbed collection.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link
                  href="/grading"
                  style={{
                    border: `1px solid ${colors.border}`,
                    background: colors.card,
                    borderRadius: 10,
                    padding: "9px 12px",
                    fontWeight: 950,
                    color: colors.text,
                    textDecoration: "none",
                  }}
                >
                  Grading
                </Link>

                <button
                  onClick={load}
                  disabled={loading}
                  style={{
                    border: `1px solid ${colors.border}`,
                    background: colors.muted,
                    borderRadius: 10,
                    padding: "9px 12px",
                    fontWeight: 950,
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>

            <DesktopStats
              totalUniqueSlabs={totalUniqueSlabs}
              totalQuantity={totalQuantity}
              totalValueCents={totalValueCents}
            />

            <DesktopControls
              queryInput={queryInput}
              setQueryInput={setQueryInput}
              submitSearch={submitSearch}
              clearFilters={clearFilters}
              grade={grade}
              setGrade={setGrade}
              tier={tier}
              setTier={setTier}
              sort={sort}
              setSort={setSort}
              setRandomSeed={setRandomSeed}
              setPage={setPage}
              gradeCounts={gradeCounts}
              tierCounts={tierCounts}
              totalQuantity={totalQuantity}
            />

            {err ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  background: colors.redSoft,
                  border: "1px solid #f3b7b7",
                  borderRadius: 12,
                  color: colors.red,
                  fontWeight: 900,
                }}
              >
                {err}
              </div>
            ) : null}

            {loading ? (
              <div style={{ marginTop: 18, color: colors.subtext, fontWeight: 900 }}>
                Loading slab gallery…
              </div>
            ) : rows.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <DesktopSlabGrid rows={rows} />

                <Pagination
                  page={data?.page ?? 1}
                  totalPages={data?.totalPages ?? 1}
                  setPage={setPage}
                />
              </>
            )}
          </>
        )}

        {isMobile && !mobileCarouselActive ? (
          <>
            {err ? (
              <div
                style={{
                  margin: 16,
                  padding: 12,
                  background: colors.redSoft,
                  border: "1px solid #f3b7b7",
                  borderRadius: 12,
                  color: colors.red,
                  fontWeight: 900,
                }}
              >
                {err}
              </div>
            ) : null}

            {loading ? (
              <div style={{ padding: 16, color: colors.subtext, fontWeight: 900 }}>
                Loading slab carousel…
              </div>
            ) : rows.length === 0 ? (
              <div style={{ padding: 16 }}>
                <EmptyState />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

function MobileSlabCarousel({
  rows,
  activeSlabIndex,
  setActiveSlabIndex,
  touchStartX,
  setTouchStartX,
  page,
  totalPages,
  setPage,
  queryInput,
  setQueryInput,
  submitSearch,
  clearFilters,
  grade,
  setGrade,
  tier,
  setTier,
  sort,
  setSort,
  setRandomSeed,
  gradeCounts,
  tierCounts,
  totalQuantity,
  totalValueCents,
  totalUniqueSlabs,
  mobileControlsOpen,
  setMobileControlsOpen,
  reshuffleRandom,
}: {
  rows: SlabRow[];
  activeSlabIndex: number;
  setActiveSlabIndex: React.Dispatch<React.SetStateAction<number>>;
  touchStartX: number | null;
  setTouchStartX: React.Dispatch<React.SetStateAction<number | null>>;
  page: number;
  totalPages: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  queryInput: string;
  setQueryInput: React.Dispatch<React.SetStateAction<string>>;
  submitSearch: (e: React.FormEvent<HTMLFormElement>) => void;
  clearFilters: () => void;
  grade: string;
  setGrade: React.Dispatch<React.SetStateAction<string>>;
  tier: "ALL" | Gradeability;
  setTier: React.Dispatch<React.SetStateAction<"ALL" | Gradeability>>;
  sort: SortMode;
  setSort: React.Dispatch<React.SetStateAction<SortMode>>;
  setRandomSeed: React.Dispatch<React.SetStateAction<string>>;
  gradeCounts: ApiResponse["countsByGrade"];
  tierCounts: ApiResponse["countsByTier"];
  totalQuantity: number;
  totalValueCents: number;
  totalUniqueSlabs: number;
  mobileControlsOpen: boolean;
  setMobileControlsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  reshuffleRandom: () => void;
}) {
  const row = rows[Math.min(activeSlabIndex, rows.length - 1)];
  const previousRow = activeSlabIndex > 0 ? rows[activeSlabIndex - 1] : null;
  const nextRow = activeSlabIndex < rows.length - 1 ? rows[activeSlabIndex + 1] : null;

  function goPrev() {
    setActiveSlabIndex((i) => Math.max(0, i - 1));
  }

  function goNext() {
    setActiveSlabIndex((i) => Math.min(rows.length - 1, i + 1));
  }

  return (
    <div
      onTouchStart={(e) => setTouchStartX(e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        if (touchStartX == null) return;

        const endX = e.changedTouches[0]?.clientX ?? touchStartX;
        const delta = endX - touchStartX;

        if (Math.abs(delta) > 45) {
          if (delta > 0) goPrev();
          else goNext();
        }

        setTouchStartX(null);
      }}
      style={{
        position: "fixed",
          inset: 0,
          zIndex: 9999,
          height: "100dvh",
          width: "100vw",
          display: "grid",
          gridTemplateRows: "auto minmax(0, 1fr) auto",
          overflow: "hidden",
          background: `radial-gradient(circle at 50% 10%, rgba(30,64,175,0.34), transparent 32%), radial-gradient(circle at 50% 60%, rgba(120,53,15,0.22), transparent 35%), ${colors.carouselBg}`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.08), transparent 24%, rgba(0,0,0,0.34) 100%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          padding: "10px 12px 8px",
          background: "linear-gradient(180deg, rgba(3,7,18,0.94), rgba(3,7,18,0.62), transparent)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Link
            href="/collection"
            style={{
              color: colors.carouselText,
              textDecoration: "none",
              fontWeight: 950,
              fontSize: 12,
              border: `1px solid ${colors.carouselBorder}`,
              background: "rgba(255,255,255,0.07)",
              borderRadius: 999,
              padding: "7px 10px",
            }}
          >
            ← Collection
          </Link>

          <div style={{ textAlign: "center", minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 1000,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: colors.carouselMuted,
              }}
            >
              Slab Carousel
            </div>
            <div
              style={{
                marginTop: 1,
                fontSize: 13,
                fontWeight: 1000,
                color: colors.carouselText,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {activeSlabIndex + 1} / {rows.length}
            </div>
          </div>

          <button
            onClick={() => setMobileControlsOpen((v) => !v)}
            style={{
              border: `1px solid ${colors.carouselBorder}`,
              background: mobileControlsOpen ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)",
              color: colors.carouselText,
              borderRadius: 999,
              padding: "7px 10px",
              fontWeight: 950,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Tune
          </button>
        </div>

        {mobileControlsOpen ? (
          <div
            style={{
              marginTop: 10,
              border: `1px solid ${colors.carouselBorder}`,
              background: "rgba(2,6,23,0.72)",
              borderRadius: 18,
              padding: 10,
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            }}
          >
            <form onSubmit={submitSearch} style={{ display: "flex", gap: 8 }}>
              <input
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Search slabs…"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: `1px solid ${colors.carouselBorder}`,
                  borderRadius: 12,
                  padding: "10px 11px",
                  fontWeight: 850,
                  fontSize: 14,
                  color: colors.carouselText,
                  background: "rgba(255,255,255,0.08)",
                  outline: "none",
                }}
              />

              <button
                type="submit"
                style={{
                  border: "1px solid rgba(125,211,252,0.75)",
                  background: "rgba(14,165,233,0.22)",
                  color: "#e0f2fe",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                Search
              </button>
            </form>

            <div style={{ marginTop: 10, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
              <GradeFilterButton
                label="All"
                count={totalQuantity}
                active={grade === "ALL"}
                dark
                onClick={() => {
                  setGrade("ALL");
                  if (sort === "random") setRandomSeed(String(Date.now()));
                  setPage(1);
                }}
              />
              {(["10", "9", "8", "7", "6"] as const).map((g) => (
                <GradeFilterButton
                  key={g}
                  label={`VCS ${g}`}
                  count={gradeCounts[g]}
                  active={grade === g}
                  dark
                  onClick={() => {
                    setGrade(g);
                    if (sort === "random") setRandomSeed(String(Date.now()));
                    setPage(1);
                  }}
                />
              ))}
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
              <TierFilterButton
                label="All"
                count={totalQuantity}
                active={tier === "ALL"}
                dark
                onClick={() => {
                  setTier("ALL");
                  if (sort === "random") setRandomSeed(String(Date.now()));
                  setPage(1);
                }}
              />
              <TierFilterButton
                label="Iconic"
                count={tierCounts.ICONIC}
                active={tier === "ICONIC"}
                dark
                onClick={() => {
                  setTier("ICONIC");
                  if (sort === "random") setRandomSeed(String(Date.now()));
                  setPage(1);
                }}
              />
              <TierFilterButton
                label="Great"
                count={tierCounts.GREAT}
                active={tier === "GREAT"}
                dark
                onClick={() => {
                  setTier("GREAT");
                  if (sort === "random") setRandomSeed(String(Date.now()));
                  setPage(1);
                }}
              />
              <TierFilterButton
                label="Common"
                count={tierCounts.COMMON}
                active={tier === "COMMON"}
                dark
                onClick={() => {
                  setTier("COMMON");
                  if (sort === "random") setRandomSeed(String(Date.now()));
                  setPage(1);
                }}
              />
            </div>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
              <select
                value={sort}
                onChange={(e) => {
                  const nextSort = e.target.value as SortMode;
                  setSort(nextSort);
                  if (nextSort === "random") setRandomSeed(String(Date.now()));
                  setPage(1);
                }}
                style={{
                  minWidth: 0,
                  border: `1px solid ${colors.carouselBorder}`,
                  borderRadius: 12,
                  padding: "9px 10px",
                  fontWeight: 900,
                  color: colors.carouselText,
                  background: "rgba(255,255,255,0.08)",
                }}
              >
                <option value="grade_desc">Highest grade</option>
                <option value="value_desc">Highest value</option>
                <option value="newest">Newest graded</option>
                <option value="player_asc">Player A–Z</option>
                <option value="year_desc">Newest year</option>
                <option value="random">Random</option>
              </select>

              <button
                type="button"
                onClick={reshuffleRandom}
                style={{
                  border: `1px solid ${colors.carouselBorder}`,
                  background: "rgba(255,255,255,0.08)",
                  color: colors.carouselText,
                  borderRadius: 12,
                  padding: "9px 10px",
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                Shuffle
              </button>

              <button
                type="button"
                onClick={clearFilters}
                style={{
                  border: `1px solid ${colors.carouselBorder}`,
                  background: "rgba(255,255,255,0.08)",
                  color: colors.carouselText,
                  borderRadius: 12,
                  padding: "9px 10px",
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          alignItems: "center",
          justifyItems: "center",
          padding: "6px 0 0",
          overflow: "hidden",
        }}
      >
        {previousRow ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: "-48%",
              top: "50%",
              transform: "translateY(-50%) scale(0.78)",
              opacity: 0.16,
              filter: "blur(1px)",
              width: "min(92vw, 350px)",
              pointerEvents: "none",
            }}
          >
            <VcsSlab
              player={previousRow.player}
              cardNumber={previousRow.cardNumber}
              setName={getSetName(previousRow)}
              team={previousRow.team}
              grade={previousRow.grade}
              gradeability={previousRow.gradeability}
              gradeabilityLabel={previousRow.gradeabilityLabel}
              valueCents={previousRow.valueCents}
              quantity={previousRow.quantity}
              imageUrl={previousRow.frontImageUrl}
            />
          </div>
        ) : null}

        {nextRow ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              right: "-48%",
              top: "50%",
              transform: "translateY(-50%) scale(0.78)",
              opacity: 0.16,
              filter: "blur(1px)",
              width: "min(92vw, 350px)",
              pointerEvents: "none",
            }}
          >
            <VcsSlab
              player={nextRow.player}
              cardNumber={nextRow.cardNumber}
              setName={getSetName(nextRow)}
              team={nextRow.team}
              grade={nextRow.grade}
              gradeability={nextRow.gradeability}
              gradeabilityLabel={nextRow.gradeabilityLabel}
              valueCents={nextRow.valueCents}
              quantity={nextRow.quantity}
              imageUrl={nextRow.frontImageUrl}
            />
          </div>
        ) : null}

        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 390,
            display: "grid",
            justifyItems: "center",
            transform: "translate(-50%, -50%) scale(0.72)",
            transformOrigin: "center",
            filter: "drop-shadow(0 30px 55px rgba(0,0,0,0.55))",
          }}
        >
          <VcsSlab
            player={row.player}
            cardNumber={row.cardNumber}
            setName={getSetName(row)}
            team={row.team}
            grade={row.grade}
            gradeability={row.gradeability}
            gradeabilityLabel={row.gradeabilityLabel}
            valueCents={row.valueCents}
            quantity={row.quantity}
            imageUrl={row.frontImageUrl}
          />
        </div>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 2,
          padding: "10px 12px 14px",
          background: "linear-gradient(0deg, rgba(3,7,18,0.98), rgba(3,7,18,0.74), transparent)",
        }}
      >
        <div
          style={{
            border: `1px solid ${colors.carouselBorder}`,
            background: "rgba(255,255,255,0.08)",
            borderRadius: 22,
            padding: 12,
            boxShadow: "0 22px 70px rgba(0,0,0,0.34)",
            backdropFilter: "blur(16px)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: colors.carouselText,
                  fontSize: 18,
                  fontWeight: 1000,
                  lineHeight: 1.1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row.player}
              </div>

              <div
                style={{
                  marginTop: 4,
                  color: colors.carouselMuted,
                  fontSize: 13,
                  fontWeight: 850,
                  lineHeight: 1.3,
                }}
              >
                {getSetName(row)} #{row.cardNumber}
                {getSubline(row) ? ` • ${getSubline(row)}` : ""}
              </div>
            </div>

            <div style={{ textAlign: "right", flex: "0 0 auto" }}>
              <div
                style={{
                  color: "#fef3c7",
                  fontSize: 17,
                  fontWeight: 1000,
                  lineHeight: 1.1,
                }}
              >
                VCS {row.grade}
              </div>
              <div style={{ marginTop: 4, color: "#bbf7d0", fontSize: 13, fontWeight: 1000 }}>
                {formatDollarsFromCents(row.totalValueCents)}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: 10,
              alignItems: "center",
            }}
          >
            <button
              onClick={goPrev}
              disabled={activeSlabIndex <= 0}
              style={{
                border: `1px solid ${colors.carouselBorder}`,
                background: "rgba(255,255,255,0.08)",
                color: colors.carouselText,
                borderRadius: 14,
                padding: "10px 12px",
                fontWeight: 1000,
                opacity: activeSlabIndex <= 0 ? 0.35 : 1,
                cursor: activeSlabIndex <= 0 ? "not-allowed" : "pointer",
              }}
            >
              ←
            </button>

            <Link
              href={`/cards/${row.cardId}`}
              style={{
                border: `1px solid ${colors.carouselBorder}`,
                background: "rgba(255,255,255,0.06)",
                color: colors.carouselText,
                borderRadius: 14,
                padding: "10px 12px",
                fontWeight: 950,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Card details
            </Link>

            <button
              onClick={goNext}
              disabled={activeSlabIndex >= rows.length - 1}
              style={{
                border: `1px solid ${colors.carouselBorder}`,
                background: "rgba(255,255,255,0.08)",
                color: colors.carouselText,
                borderRadius: 14,
                padding: "10px 12px",
                fontWeight: 1000,
                opacity: activeSlabIndex >= rows.length - 1 ? 0.35 : 1,
                cursor: activeSlabIndex >= rows.length - 1 ? "not-allowed" : "pointer",
              }}
            >
              →
            </button>
          </div>

          <div
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
            }}
          >
            <MetricPill label="Types" value={String(totalUniqueSlabs)} />
            <MetricPill label="Slabs" value={String(totalQuantity)} />
            <MetricPill label="Value" value={formatDollarsFromCents(totalValueCents)} />
          </div>

          <div
            style={{
              marginTop: 10,
              color: colors.carouselMuted,
              fontSize: 11,
              fontWeight: 850,
              textAlign: "center",
            }}
          >
            Swipe left or right to browse. Page {page} of {totalPages}.
          </div>
        </div>

        {totalPages > 1 ? (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              justifyContent: "center",
              gap: 10,
              alignItems: "center",
            }}
          >
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{
                border: `1px solid ${colors.carouselBorder}`,
                background: "rgba(255,255,255,0.07)",
                color: colors.carouselText,
                borderRadius: 999,
                padding: "8px 12px",
                fontWeight: 950,
                opacity: page <= 1 ? 0.35 : 1,
                cursor: page <= 1 ? "not-allowed" : "pointer",
              }}
            >
              Prev page
            </button>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{
                border: `1px solid ${colors.carouselBorder}`,
                background: "rgba(255,255,255,0.07)",
                color: colors.carouselText,
                borderRadius: 999,
                padding: "8px 12px",
                fontWeight: 950,
                opacity: page >= totalPages ? 0.35 : 1,
                cursor: page >= totalPages ? "not-allowed" : "pointer",
              }}
            >
              Next page
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: `1px solid ${colors.carouselBorder}`,
        background: "rgba(255,255,255,0.06)",
        borderRadius: 14,
        padding: "8px 6px",
        textAlign: "center",
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: colors.carouselMuted,
          fontSize: 10,
          fontWeight: 950,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 2,
          color: colors.carouselText,
          fontSize: 12,
          fontWeight: 1000,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DesktopStats({
  totalUniqueSlabs,
  totalQuantity,
  totalValueCents,
}: {
  totalUniqueSlabs: number;
  totalQuantity: number;
  totalValueCents: number;
}) {
  return (
    <div
      style={{
        marginTop: 16,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 10,
      }}
    >
      <div
        style={{
          background: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: 16,
          padding: 12,
        }}
      >
        <div style={{ color: colors.mutedText, fontSize: 12, fontWeight: 900 }}>Slab types</div>
        <div style={{ marginTop: 4, fontSize: 24, fontWeight: 1000 }}>{totalUniqueSlabs}</div>
      </div>

      <div
        style={{
          background: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: 16,
          padding: 12,
        }}
      >
        <div style={{ color: colors.mutedText, fontSize: 12, fontWeight: 900 }}>Total slabs</div>
        <div style={{ marginTop: 4, fontSize: 24, fontWeight: 1000 }}>{totalQuantity}</div>
      </div>

      <div
        style={{
          background: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: 16,
          padding: 12,
        }}
      >
        <div style={{ color: colors.mutedText, fontSize: 12, fontWeight: 900 }}>Estimated value</div>
        <div style={{ marginTop: 4, fontSize: 24, fontWeight: 1000 }}>
          {formatDollarsFromCents(totalValueCents)}
        </div>
      </div>
    </div>
  );
}

function DesktopControls({
  queryInput,
  setQueryInput,
  submitSearch,
  clearFilters,
  grade,
  setGrade,
  tier,
  setTier,
  sort,
  setSort,
  setRandomSeed,
  setPage,
  gradeCounts,
  tierCounts,
  totalQuantity,
}: {
  queryInput: string;
  setQueryInput: React.Dispatch<React.SetStateAction<string>>;
  submitSearch: (e: React.FormEvent<HTMLFormElement>) => void;
  clearFilters: () => void;
  grade: string;
  setGrade: React.Dispatch<React.SetStateAction<string>>;
  tier: "ALL" | Gradeability;
  setTier: React.Dispatch<React.SetStateAction<"ALL" | Gradeability>>;
  sort: SortMode;
  setSort: React.Dispatch<React.SetStateAction<SortMode>>;
  setRandomSeed: React.Dispatch<React.SetStateAction<string>>;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  gradeCounts: ApiResponse["countsByGrade"];
  tierCounts: ApiResponse["countsByTier"];
  totalQuantity: number;
}) {
  return (
    <div
      style={{
        marginTop: 12,
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: 16,
        padding: 12,
        display: "grid",
        gap: 12,
      }}
    >
      <form onSubmit={submitSearch} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Search player, team, set, card number…"
          style={{
            flex: "1 1 260px",
            minWidth: 0,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: "10px 12px",
            fontWeight: 850,
            fontSize: 14,
          }}
        />

        <button
          type="submit"
          style={{
            border: `1px solid ${colors.blue}`,
            background: colors.blue,
            color: "#fff",
            borderRadius: 12,
            padding: "10px 12px",
            fontWeight: 950,
            cursor: "pointer",
          }}
        >
          Search
        </button>

        <button
          type="button"
          onClick={clearFilters}
          style={{
            border: `1px solid ${colors.border}`,
            background: colors.muted,
            color: colors.text,
            borderRadius: 12,
            padding: "10px 12px",
            fontWeight: 950,
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </form>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ color: colors.mutedText, fontSize: 13, fontWeight: 950, marginRight: 2 }}>
          Grade
        </div>

        <GradeFilterButton
          label="All"
          count={totalQuantity}
          active={grade === "ALL"}
          onClick={() => {
            setGrade("ALL");
            if (sort === "random") setRandomSeed(String(Date.now()));
            setPage(1);
          }}
        />
        {(["10", "9", "8", "7", "6"] as const).map((g) => (
          <GradeFilterButton
            key={g}
            label={`VCS ${g}`}
            count={gradeCounts[g]}
            active={grade === g}
            onClick={() => {
              setGrade(g);
              if (sort === "random") setRandomSeed(String(Date.now()));
              setPage(1);
            }}
          />
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ color: colors.mutedText, fontSize: 13, fontWeight: 950, marginRight: 2 }}>
          Tier
        </div>

        <TierFilterButton
          label="All"
          count={totalQuantity}
          active={tier === "ALL"}
          onClick={() => {
            setTier("ALL");
            if (sort === "random") setRandomSeed(String(Date.now()));
            setPage(1);
          }}
        />
        <TierFilterButton
          label="Iconic"
          count={tierCounts.ICONIC}
          active={tier === "ICONIC"}
          onClick={() => {
            setTier("ICONIC");
            if (sort === "random") setRandomSeed(String(Date.now()));
            setPage(1);
          }}
        />
        <TierFilterButton
          label="Great"
          count={tierCounts.GREAT}
          active={tier === "GREAT"}
          onClick={() => {
            setTier("GREAT");
            if (sort === "random") setRandomSeed(String(Date.now()));
            setPage(1);
          }}
        />
        <TierFilterButton
          label="Common"
          count={tierCounts.COMMON}
          active={tier === "COMMON"}
          onClick={() => {
            setTier("COMMON");
            if (sort === "random") setRandomSeed(String(Date.now()));
            setPage(1);
          }}
        />

        <select
          value={sort}
          onChange={(e) => {
            const nextSort = e.target.value as SortMode;
            setSort(nextSort);
            if (nextSort === "random") setRandomSeed(String(Date.now()));
            setPage(1);
          }}
          style={{
            marginLeft: "auto",
            minWidth: 180,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: "9px 10px",
            fontWeight: 900,
            background: "#fff",
          }}
        >
          <option value="grade_desc">Highest grade</option>
          <option value="value_desc">Highest value</option>
          <option value="newest">Newest graded</option>
          <option value="player_asc">Player A–Z</option>
          <option value="year_desc">Newest year</option>
          <option value="random">Random</option>
        </select>
      </div>
    </div>
  );
}

function DesktopSlabGrid({ rows }: { rows: SlabRow[] }) {
  return (
    <div
      style={{
        marginTop: 16,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
        gap: 18,
        alignItems: "start",
      }}
    >
      {rows.map((row) => (
        <div
          key={row.key}
          style={{
            display: "grid",
            justifyItems: "center",
            gap: 10,
          }}
        >
          <VcsSlab
            player={row.player}
            cardNumber={row.cardNumber}
            setName={getSetName(row)}
            team={row.team}
            grade={row.grade}
            gradeability={row.gradeability}
            gradeabilityLabel={row.gradeabilityLabel}
            valueCents={row.valueCents}
            quantity={row.quantity}
            imageUrl={row.frontImageUrl}
          />

          <div
            style={{
              width: "100%",
              maxWidth: 390,
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 14,
              padding: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 1000 }}>
              #{row.cardNumber} — {row.player}
            </div>

            <div
              style={{
                marginTop: 3,
                color: colors.mutedText,
                fontSize: 12,
                fontWeight: 800,
                lineHeight: 1.35,
              }}
            >
              {getSetName(row)}
              {getSubline(row) ? ` • ${getSubline(row)}` : ""}
            </div>

            <div
              style={{
                marginTop: 8,
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div style={{ color: colors.green, fontWeight: 1000, fontSize: 13 }}>
                Total: {formatDollarsFromCents(row.totalValueCents)}
              </div>

              <Link
                href={`/cards/${row.cardId}`}
                style={{
                  color: colors.blue,
                  fontWeight: 950,
                  fontSize: 13,
                }}
              >
                Card details
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        marginTop: 14,
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: 16,
        padding: 18,
        color: colors.subtext,
        fontWeight: 850,
        lineHeight: 1.45,
      }}
    >
      No slabs found. Submit cards for VCS grading, then reveal completed mailers to add slabs to this gallery.
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  setPage,
}: {
  page: number;
  totalPages: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <div
      style={{
        marginTop: 18,
        display: "flex",
        justifyContent: "center",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <button
        onClick={() => setPage((p) => Math.max(1, p - 1))}
        disabled={page <= 1}
        style={{
          border: `1px solid ${colors.border}`,
          background: "#fff",
          borderRadius: 10,
          padding: "9px 12px",
          fontWeight: 950,
          cursor: page <= 1 ? "not-allowed" : "pointer",
          opacity: page <= 1 ? 0.5 : 1,
        }}
      >
        Previous
      </button>

      <div style={{ color: colors.mutedText, fontWeight: 900, fontSize: 13 }}>
        Page {page} of {totalPages}
      </div>

      <button
        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        disabled={page >= totalPages}
        style={{
          border: `1px solid ${colors.border}`,
          background: "#fff",
          borderRadius: 10,
          padding: "9px 12px",
          fontWeight: 950,
          cursor: page >= totalPages ? "not-allowed" : "pointer",
          opacity: page >= totalPages ? 0.5 : 1,
        }}
      >
        Next
      </button>
    </div>
  );
}