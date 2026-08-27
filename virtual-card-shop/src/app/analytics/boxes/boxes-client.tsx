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

const colors = {
  text: "#171717",
  muted: "#6b7280",
  border: "#e5ded3",
  borderStrong: "#d7cbb9",
  gold: "#8a6200",
  goldSoft: "#fff8e8",
  green: "#166534",
  red: "#991b1b",
};

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
    <main className="boxesPage">
      <style>{`
        .boxesPage {
          min-height: 100vh;
          color: ${colors.text};
          background:
            radial-gradient(circle at top left, rgba(245,158,11,.12), transparent 30%),
            linear-gradient(180deg, #f8f3ea 0%, #f2eadf 100%);
          padding: 12px 10px 30px;
        }

        .boxesShell {
          max-width: 1240px;
          margin: 0 auto;
        }

        .boxesHeader {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-end;
          flex-wrap: wrap;
        }

        .boxesTitle {
          margin: 7px 0 3px;
          font-size: clamp(30px, 7vw, 42px);
          letter-spacing: -.045em;
          line-height: 1;
          font-weight: 1000;
        }

        .boxesSubtitle {
          color: ${colors.muted};
          font-size: 12.5px;
          font-weight: 750;
        }

        .boxesSummary {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          border: 1px solid ${colors.borderStrong};
          border-radius: 16px;
          overflow: hidden;
          background: rgba(255,255,255,.9);
        }

        .boxesSummaryCell {
          min-width: 0;
          padding: 10px 11px;
          border-left: 1px solid ${colors.border};
        }

        .boxesSummaryCell:first-child {
          border-left: 0;
        }

        .boxesLabel {
          color: ${colors.muted};
          font-size: 9px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: .04em;
          white-space: nowrap;
        }

        .boxesValue {
          margin-top: 3px;
          font-size: 17px;
          line-height: 1.05;
          font-weight: 1000;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .boxesListPanel {
          margin-top: 12px;
          border: 1px solid ${colors.borderStrong};
          background: rgba(255,255,255,.82);
          border-radius: 17px;
          padding: 10px;
          box-shadow: 0 10px 28px rgba(80,49,20,.05);
        }

        .boxesListHeader {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }

        .boxesSort {
          border: 1px solid ${colors.borderStrong};
          background: #fff;
          border-radius: 11px;
          padding: 8px 10px;
          font-weight: 900;
          font-size: 12px;
          color: ${colors.text};
        }

        .boxesList {
          display: grid;
          gap: 8px;
        }

        .boxCard {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) repeat(5, minmax(84px,.7fr)) 80px;
          gap: 8px;
          align-items: center;
          border: 1px solid ${colors.border};
          background: #fff;
          border-radius: 14px;
          padding: 10px;
          text-decoration: none;
          color: inherit;
        }

        .boxTitle {
          font-weight: 1000;
          font-size: 13px;
          line-height: 1.15;
        }

        .boxSub {
          margin-top: 2px;
          color: ${colors.muted};
          font-weight: 750;
          font-size: 10.5px;
        }

        .boxTopPull {
          margin-top: 4px;
          color: #92400e;
          font-weight: 850;
          font-size: 10.5px;
          line-height: 1.25;
        }

        .boxMetricsMobile {
          display: none;
        }

        @media (max-width: 760px) {
          .boxesPage {
            padding: 10px 8px 24px;
          }

          .boxesHeader {
            align-items: start;
          }

          .boxesTitle {
            font-size: 30px;
          }

          .boxesSubtitle {
            font-size: 11.5px;
          }

          .boxesSummary {
            grid-template-columns: repeat(3, minmax(0,1fr));
          }

          .boxesSummaryCell {
            padding: 8px 7px;
          }

          .boxesSummaryCell:nth-child(4) {
            border-left: 0;
            border-top: 1px solid ${colors.border};
          }

          .boxesSummaryCell:nth-child(5),
          .boxesSummaryCell:nth-child(6) {
            border-top: 1px solid ${colors.border};
          }

          .boxesValue {
            font-size: 13px;
          }

          .boxesListPanel {
            padding: 8px;
            border-radius: 14px;
          }

          .boxesListHeader {
            align-items: stretch;
          }

          .boxesSort {
            width: 100%;
          }

          .boxCard {
            display: block;
            border-radius: 14px;
            padding: 9px;
          }

          .boxTitle {
            font-size: 14px;
          }

          .boxSub,
          .boxTopPull {
            font-size: 10px;
          }

          .boxMetricsDesktop {
            display: none !important;
          }

          .boxMetricsMobile {
            margin-top: 8px;
            display: grid;
            grid-template-columns: repeat(4, minmax(0,1fr));
            border: 1px solid ${colors.border};
            border-radius: 11px;
            overflow: hidden;
          }

          .boxMetricMobile {
            min-width: 0;
            padding: 7px 6px;
            border-left: 1px solid ${colors.border};
          }

          .boxMetricMobile:first-child {
            border-left: 0;
          }

          .boxMetricMobile .boxesValue {
            font-size: 11.5px;
          }

          .boxFooterMobile {
            margin-top: 7px;
            display: grid;
            grid-template-columns: minmax(0,1fr) auto;
            gap: 8px;
            align-items: center;
          }

          .boxProgressTrack {
            height: 7px;
            border-radius: 999px;
            background: #eee7dc;
            overflow: hidden;
          }

          .boxProgressFill {
            height: 100%;
            border-radius: inherit;
            background: linear-gradient(90deg,#c98d18,#e8bf57);
          }

          .boxStatusMobile {
            font-size: 10px;
            font-weight: 950;
            color: ${colors.gold};
            white-space: nowrap;
          }
        }
      `}</style>

      <div className="boxesShell">
        <header className="boxesHeader">
          <div>
            <Link href="/analytics" className="vcs-back-link">
              ← Analytics
            </Link>
            <h1 className="boxesTitle">Box Portfolio</h1>
            <div className="boxesSubtitle">
              Track each box as an investment: cost, pull value, profit, ROI, and progress.
            </div>
          </div>

          <Link href="/shop" className="vcs-button vcs-button-primary vcs-button-compact">
            Buy Boxes →
          </Link>
        </header>

        {error ? (
          <div
            style={{
              marginTop: 10,
              border: "1px solid #fecaca",
              background: "#fff1f2",
              color: colors.red,
              borderRadius: 12,
              padding: 10,
              fontWeight: 850,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        ) : null}

        {!data ? (
          <div
            style={{
              marginTop: 12,
              border: `1px solid ${colors.border}`,
              background: "rgba(255,255,255,.75)",
              borderRadius: 14,
              padding: 12,
              fontWeight: 850,
            }}
          >
            Loading box portfolio…
          </div>
        ) : (
          <>
            <section className="boxesSummary">
              <SummaryCell label="Boxes" value={String(data.totals.boxes)} />
              <SummaryCell label="Cost" value={money(data.totals.costCents)} />
              <SummaryCell label="Pull Value" value={money(data.totals.pullValueCents)} />
              <SummaryCell
                label="Profit"
                value={money(data.totals.profitCents)}
                tone={data.totals.profitCents}
              />
              <SummaryCell
                label="ROI"
                value={pct(data.totals.roiPct)}
                tone={data.totals.profitCents}
              />
              <SummaryCell
                label="Packs"
                value={`${data.totals.packsOpened}/${data.totals.packsPurchased}`}
              />
            </section>

            <section className="boxesListPanel">
              <div className="boxesListHeader">
                <div>
                  <div style={{ fontWeight: 1000, fontSize: 16 }}>Tracked Boxes</div>
                  <div style={{ color: colors.muted, fontWeight: 700, fontSize: 10.5 }}>
                    Paper ROI uses raw book value of cards pulled.
                  </div>
                </div>

                <select
                  className="boxesSort"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                >
                  <option value="date">Newest</option>
                  <option value="roi">Best ROI</option>
                  <option value="profit">Best Profit</option>
                  <option value="value">Pull Value</option>
                  <option value="cost">Cost</option>
                  <option value="progress">Most Opened</option>
                </select>
              </div>

              {sortedBoxes.length === 0 ? (
                <div
                  style={{
                    border: `1px dashed ${colors.borderStrong}`,
                    borderRadius: 12,
                    padding: 12,
                    color: colors.muted,
                    fontWeight: 750,
                    fontSize: 12,
                  }}
                >
                  No boxes tracked yet. Buy a box from the shop to start building your portfolio.
                </div>
              ) : (
                <div className="boxesList">
                  {sortedBoxes.map((box) => {
                    const progress =
                      box.packsPurchased > 0
                        ? Math.round((box.packsOpened / box.packsPurchased) * 100)
                        : 0;

                    return (
                      <Link
                        key={box.id}
                        href={`/analytics/boxes/${box.id}`}
                        className="boxCard"
                      >
                        <div style={{ minWidth: 0 }}>
                          <div className="boxTitle">
                            Box #{box.id} · {box.productName}
                          </div>
                          <div className="boxSub">
                            Purchased {dateLabel(box.createdAt)} · {box.packsOpened}/{box.packsPurchased} packs opened
                          </div>

                          {box.topCard ? (
                            <div className="boxTopPull">
                              Top pull: {box.topCard.player} #{box.topCard.cardNumber}
                              {cardSubtitle(box.topCard) ? ` · ${cardSubtitle(box.topCard)}` : ""}
                            </div>
                          ) : (
                            <div className="boxSub" style={{ marginTop: 4 }}>
                              No tracked packs opened yet
                            </div>
                          )}

                          <div className="boxMetricsMobile">
                            <MobileMetric label="Cost" value={money(box.purchasePriceCents)} />
                            <MobileMetric label="Value" value={money(box.totalPullValueCents)} />
                            <MobileMetric label="Profit" value={money(box.profitCents)} tone={box.profitCents} />
                            <MobileMetric label="ROI" value={pct(box.roiPct)} tone={box.profitCents} />
                          </div>

                          <div className="boxFooterMobile">
                            <div className="boxProgressTrack">
                              <div className="boxProgressFill" style={{ width: `${Math.min(100, progress)}%` }} />
                            </div>
                            <div className="boxStatusMobile">
                              {box.isClosed ? "Closed" : `${progress}% open`}
                            </div>
                          </div>
                        </div>

                        <div className="boxMetricsDesktop"><Cell label="Cost" value={money(box.purchasePriceCents)} /></div>
                        <div className="boxMetricsDesktop"><Cell label="Pull Value" value={money(box.totalPullValueCents)} /></div>
                        <div className="boxMetricsDesktop"><Cell label="Profit" value={money(box.profitCents)} tone={box.profitCents} /></div>
                        <div className="boxMetricsDesktop"><Cell label="ROI" value={pct(box.roiPct)} tone={box.profitCents} /></div>
                        <div className="boxMetricsDesktop"><Cell label="Packs" value={`${box.packsOpened}/${box.packsPurchased}`} /></div>

                        <div
                          className="boxMetricsDesktop"
                          style={{
                            borderRadius: 999,
                            padding: "7px 9px",
                            background: box.isClosed ? "#dcfce7" : colors.goldSoft,
                            color: box.isClosed ? colors.green : colors.gold,
                            fontWeight: 950,
                            fontSize: 11,
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
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: number;
}) {
  const color = tone === undefined ? colors.text : tone >= 0 ? colors.green : colors.red;

  return (
    <div className="boxesSummaryCell">
      <div className="boxesLabel">{label}</div>
      <div className="boxesValue" style={{ color }}>{value}</div>
    </div>
  );
}

function MobileMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: number;
}) {
  const color = tone === undefined ? colors.text : tone >= 0 ? colors.green : colors.red;

  return (
    <div className="boxMetricMobile">
      <div className="boxesLabel">{label}</div>
      <div className="boxesValue" style={{ color }}>{value}</div>
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
  const color = tone === undefined ? colors.text : tone >= 0 ? colors.green : colors.red;

  return (
    <div style={{ minWidth: 0 }}>
      <div className="boxesLabel">{label}</div>
      <div style={{ color, fontWeight: 1000, fontSize: 13 }}>{value}</div>
    </div>
  );
}
