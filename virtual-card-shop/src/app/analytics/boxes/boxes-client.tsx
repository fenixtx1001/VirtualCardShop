"use client";

// src/app/analytics/boxes/boxes-client.tsx
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type BoxRow = {
  id: number;
  productId: string;
  productName: string;
  purchasePriceCents: number;
  packsPurchased: number;
  packsOpened: number;
  isClosed: boolean;
  createdAt: string;
  totalPulledCards: number;
  totalPullValueCents: number;
  profitCents: number;
  roiPct: number | null;
  topCard: null | {
    id: number;
    cardNumber: string;
    player: string;
    team: string | null;
    subset: string | null;
    variant: string | null;
    bookValueCents: number;
    frontImageUrl: string | null;
    quantity: number;
  };
};

type ApiData = {
  ok: boolean;
  error?: string;
  totals: {
    boxes: number;
    costCents: number;
    pullValueCents: number;
    profitCents: number;
    packsPurchased: number;
    packsOpened: number;
    roiPct: number | null;
  };
  boxes: BoxRow[];
};

type SortKey = "date" | "roi" | "profit" | "value" | "cost" | "progress";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function pct(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function cardSubtitle(card: NonNullable<BoxRow["topCard"]>) {
  return [card.team, card.subset, card.variant].filter(Boolean).join(" · ");
}

export default function BoxesClient() {
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");

      const res = await fetch("/api/analytics/boxes", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiData | null;

      if (cancelled) return;

      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Failed to load box portfolio.");
        setData(null);
        return;
      }

      setData(json);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedBoxes = useMemo(() => {
    const rows = [...(data?.boxes ?? [])];

    rows.sort((a, b) => {
      if (sortKey === "roi") return (b.roiPct ?? -999999) - (a.roiPct ?? -999999);
      if (sortKey === "profit") return b.profitCents - a.profitCents;
      if (sortKey === "value") return b.totalPullValueCents - a.totalPullValueCents;
      if (sortKey === "cost") return b.purchasePriceCents - a.purchasePriceCents;
      if (sortKey === "progress") {
        const ap = a.packsPurchased > 0 ? a.packsOpened / a.packsPurchased : 0;
        const bp = b.packsPurchased > 0 ? b.packsOpened / b.packsPurchased : 0;
        return bp - ap;
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return rows;
  }, [data?.boxes, sortKey]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(245,158,11,0.20), transparent 34%), linear-gradient(180deg, #f8f1e7 0%, #efe2cf 100%)",
        fontFamily: "system-ui",
        color: "#1f2937",
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "18px 16px 42px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <Link
              href="/analytics"
              style={{
                color: "#7c2d12",
                fontWeight: 900,
                textDecoration: "none",
                fontSize: 13,
              }}
            >
              ← Analytics
            </Link>

            <h1 style={{ margin: "10px 0 4px", fontSize: 34, letterSpacing: -1.2 }}>
              Box Portfolio
            </h1>

            <p style={{ margin: 0, color: "#6b7280", fontWeight: 650 }}>
              Track every box purchase like a business investment.
            </p>
          </div>

          <Link
            href="/shop"
            style={{
              alignSelf: "flex-start",
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              borderRadius: 999,
              padding: "10px 14px",
              fontWeight: 950,
              textDecoration: "none",
              boxShadow: "0 12px 30px rgba(17,24,39,0.20)",
            }}
          >
            Buy Boxes →
          </Link>
        </div>

        {error ? (
          <div
            style={{
              marginTop: 18,
              border: "1px solid #fecaca",
              background: "#fff1f2",
              color: "#991b1b",
              borderRadius: 18,
              padding: 14,
              fontWeight: 800,
            }}
          >
            {error}
          </div>
        ) : null}

        {!data ? (
          <div
            style={{
              marginTop: 18,
              border: "1px solid #d8cab7",
              background: "rgba(255,255,255,0.70)",
              borderRadius: 22,
              padding: 18,
              fontWeight: 850,
            }}
          >
            Loading box portfolio…
          </div>
        ) : (
          <>
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: 12,
                marginTop: 18,
              }}
            >
              <Stat label="Boxes Tracked" value={String(data.totals.boxes)} />
              <Stat label="Cost Basis" value={money(data.totals.costCents)} />
              <Stat label="Pull Value" value={money(data.totals.pullValueCents)} />
              <Stat label="Paper Profit" value={money(data.totals.profitCents)} tone={data.totals.profitCents} />
              <Stat label="Paper ROI" value={pct(data.totals.roiPct)} tone={data.totals.profitCents} />
              <Stat
                label="Packs Opened"
                value={`${data.totals.packsOpened}/${data.totals.packsPurchased}`}
              />
            </section>

            <div
              style={{
                marginTop: 16,
                border: "1px solid #d8cab7",
                background: "rgba(255,255,255,0.68)",
                borderRadius: 22,
                padding: 12,
                boxShadow: "0 18px 45px rgba(80,49,20,0.10)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 1000, fontSize: 18 }}>Tracked Boxes</div>
                  <div style={{ color: "#6b7280", fontWeight: 650, fontSize: 13 }}>
                    Paper ROI currently uses raw book value of cards pulled. Sales and grading ROI come next.
                  </div>
                </div>

                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  style={{
                    border: "1px solid #d8cab7",
                    background: "#fff",
                    borderRadius: 999,
                    padding: "9px 12px",
                    fontWeight: 900,
                    color: "#111827",
                  }}
                >
                  <option value="date">Sort: Newest</option>
                  <option value="roi">Sort: Best ROI</option>
                  <option value="profit">Sort: Best Profit</option>
                  <option value="value">Sort: Pull Value</option>
                  <option value="cost">Sort: Cost</option>
                  <option value="progress">Sort: Most Opened</option>
                </select>
              </div>

              {sortedBoxes.length === 0 ? (
                <div
                  style={{
                    border: "1px dashed #d8cab7",
                    borderRadius: 18,
                    padding: 18,
                    color: "#6b7280",
                    fontWeight: 750,
                  }}
                >
                  No boxes tracked yet. Buy a box from the shop to start building your portfolio.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {sortedBoxes.map((box) => {
                    const progress =
                      box.packsPurchased > 0
                        ? Math.round((box.packsOpened / box.packsPurchased) * 100)
                        : 0;

                    return (
                      <Link
                        key={box.id}
                        href={`/analytics/boxes/${box.id}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1.6fr) repeat(5, minmax(94px, 0.72fr)) 86px",
                          gap: 10,
                          alignItems: "center",
                          border: "1px solid #eadcc8",
                          background: "rgba(255,255,255,0.86)",
                          borderRadius: 18,
                          padding: 12,
                          textDecoration: "none",
                          color: "inherit",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 1000, color: "#111827" }}>
                            Box #{box.id} · {box.productName}
                          </div>
                          <div style={{ color: "#6b7280", fontWeight: 700, fontSize: 13 }}>
                            Purchased {dateLabel(box.createdAt)}
                          </div>
                          {box.topCard ? (
                            <div style={{ color: "#92400e", fontWeight: 850, fontSize: 13, marginTop: 3 }}>
                              Top pull: {box.topCard.player} #{box.topCard.cardNumber}
                              {cardSubtitle(box.topCard) ? ` · ${cardSubtitle(box.topCard)}` : ""}
                            </div>
                          ) : (
                            <div style={{ color: "#9ca3af", fontWeight: 750, fontSize: 13, marginTop: 3 }}>
                              No tracked packs opened yet
                            </div>
                          )}
                        </div>

                        <Cell label="Cost" value={money(box.purchasePriceCents)} />
                        <Cell label="Pull Value" value={money(box.totalPullValueCents)} />
                        <Cell label="Profit" value={money(box.profitCents)} tone={box.profitCents} />
                        <Cell label="ROI" value={pct(box.roiPct)} tone={box.profitCents} />
                        <Cell label="Packs" value={`${box.packsOpened}/${box.packsPurchased}`} />
                        <div
                          style={{
                            borderRadius: 999,
                            padding: "7px 9px",
                            background: box.isClosed ? "#dcfce7" : "#fffbeb",
                            color: box.isClosed ? "#166534" : "#92400e",
                            fontWeight: 950,
                            fontSize: 12,
                            textAlign: "center",
                          }}
                        >
                          {box.isClosed ? "Closed" : `${progress}%`}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: number;
}) {
  const color = tone === undefined ? "#111827" : tone >= 0 ? "#166534" : "#991b1b";

  return (
    <div
      style={{
        border: "1px solid #d8cab7",
        background: "rgba(255,255,255,0.78)",
        borderRadius: 20,
        padding: 14,
        boxShadow: "0 14px 36px rgba(80,49,20,0.08)",
      }}
    >
      <div style={{ color: "#6b7280", fontWeight: 850, fontSize: 12, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ marginTop: 5, fontWeight: 1000, fontSize: 24, color }}>{value}</div>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: number;
}) {
  const color = tone === undefined ? "#111827" : tone >= 0 ? "#166534" : "#991b1b";

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: "#9ca3af", fontWeight: 850, fontSize: 11, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ color, fontWeight: 1000, fontSize: 14 }}>{value}</div>
    </div>
  );
}