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

  return [row.productYear, row.productBrand, fallbackSetLabel]
    .filter(Boolean)
    .join(" ") || row.productId;
}

function getSubline(row: SlabRow) {
  return [
    row.team,
    row.subset,
    row.variant,
    row.productSport,
  ]
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .join(" • ");
}

function GradeFilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? colors.blue : colors.border}`,
        background: active ? colors.blueSoft : "#fff",
        color: active ? colors.blue : colors.text,
        borderRadius: 999,
        padding: "7px 10px",
        fontWeight: 950,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label} <span style={{ color: colors.mutedText }}>({count})</span>
    </button>
  );
}

function TierFilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? colors.gold : colors.border}`,
        background: active ? colors.goldSoft : "#fff",
        color: active ? colors.gold : colors.text,
        borderRadius: 999,
        padding: "7px 10px",
        fontWeight: 950,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label} <span style={{ color: colors.mutedText }}>({count})</span>
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
  }

  function clearFilters() {
    setQueryInput("");
    setQ("");
    setGrade("ALL");
    setTier("ALL");
    setSort("grade_desc");
    setPage(1);
  }

  return (
    <main
      style={{
        background: colors.bg,
        minHeight: "calc(100vh - 80px)",
        padding: 16,
        color: colors.text,
        fontFamily: "system-ui",
      }}
    >
      <div style={{ maxWidth: 1260, margin: "0 auto" }}>
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
        ) : (
          <>
            {isMobile ? (
              <div style={{ marginTop: 14 }}>
                {(() => {
                  const row = rows[Math.min(activeSlabIndex, rows.length - 1)];

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
                        minHeight: "calc(100vh - 190px)",
                        display: "grid",
                        gridTemplateRows: "auto 1fr auto",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          background: colors.card,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 999,
                          padding: "7px 12px",
                          textAlign: "center",
                          fontWeight: 1000,
                          color: colors.subtext,
                          fontSize: 13,
                          width: "fit-content",
                          margin: "0 auto",
                        }}
                      >
                        Slab {activeSlabIndex + 1} of {rows.length}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          justifyItems: "center",
                          alignItems: "center",
                          width: "100%",
                          overflow: "visible",
                        }}
                      >
                        <div
                          style={{
                            width: "min(96vw, 390px)",
                            display: "grid",
                            justifyItems: "center",
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
                          background: colors.card,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 16,
                          padding: 12,
                          boxShadow: "0 8px 24px rgba(0,0,0,0.04)",
                        }}
                      >
                        <div style={{ fontSize: 17, fontWeight: 1000 }}>
                          #{row.cardNumber} — {row.player}
                        </div>

                        <div
                          style={{
                            marginTop: 4,
                            color: colors.mutedText,
                            fontSize: 13,
                            fontWeight: 800,
                            lineHeight: 1.35,
                          }}
                        >
                          {getSetName(row)}
                          {getSubline(row) ? ` • ${getSubline(row)}` : ""}
                        </div>

                        <div
                          style={{
                            marginTop: 10,
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            alignItems: "center",
                          }}
                        >
                          <button
                            onClick={goPrev}
                            disabled={activeSlabIndex <= 0}
                            style={{
                              border: `1px solid ${colors.border}`,
                              background: "#fff",
                              borderRadius: 12,
                              padding: "9px 12px",
                              fontWeight: 1000,
                              opacity: activeSlabIndex <= 0 ? 0.45 : 1,
                              cursor: activeSlabIndex <= 0 ? "not-allowed" : "pointer",
                            }}
                          >
                            ← Prev
                          </button>

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

                          <button
                            onClick={goNext}
                            disabled={activeSlabIndex >= rows.length - 1}
                            style={{
                              border: `1px solid ${colors.border}`,
                              background: "#fff",
                              borderRadius: 12,
                              padding: "9px 12px",
                              fontWeight: 1000,
                              opacity: activeSlabIndex >= rows.length - 1 ? 0.45 : 1,
                              cursor: activeSlabIndex >= rows.length - 1 ? "not-allowed" : "pointer",
                            }}
                          >
                            Next →
                          </button>
                        </div>

                        <div style={{ marginTop: 8, color: colors.green, fontWeight: 1000, fontSize: 13 }}>
                          Total: {formatDollarsFromCents(row.totalValueCents)}
                        </div>

                        <div
                          style={{
                            marginTop: 8,
                            color: colors.mutedText,
                            fontSize: 12,
                            fontWeight: 800,
                            textAlign: "center",
                          }}
                        >
                          Swipe left or right to browse slabs.
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
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
            )}

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
                disabled={!data || data.page <= 1}
                style={{
                  border: `1px solid ${colors.border}`,
                  background: "#fff",
                  borderRadius: 10,
                  padding: "9px 12px",
                  fontWeight: 950,
                  cursor: !data || data.page <= 1 ? "not-allowed" : "pointer",
                  opacity: !data || data.page <= 1 ? 0.5 : 1,
                }}
              >
                Previous
              </button>

              <div style={{ color: colors.mutedText, fontWeight: 900, fontSize: 13 }}>
                Page {data?.page ?? 1} of {data?.totalPages ?? 1}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(data?.totalPages ?? p, p + 1))}
                disabled={!data || data.page >= data.totalPages}
                style={{
                  border: `1px solid ${colors.border}`,
                  background: "#fff",
                  borderRadius: 10,
                  padding: "9px 12px",
                  fontWeight: 950,
                  cursor: !data || data.page >= data.totalPages ? "not-allowed" : "pointer",
                  opacity: !data || data.page >= data.totalPages ? 0.5 : 1,
                }}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}