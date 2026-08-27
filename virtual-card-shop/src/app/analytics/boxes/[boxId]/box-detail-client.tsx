"use client";

// src/app/analytics/boxes/[boxId]/box-detail-client.tsx
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SortKey =
  | "position"
  | "value"
  | "cash"
  | "book"
  | "qty"
  | "held"
  | "sold"
  | "graded"
  | "owned"
  | "player"
  | "number"
  | "set";

type CardStatus =
  | "HOLDING"
  | "PARTIAL"
  | "SOLD_OUT"
  | "GRADED"
  | "GRADED_PARTIAL"
  | "GRADED_SOLD_OUT";

type BoxCard = {
  id: number;
  cardNumber: string;
  player: string;
  team: string | null;
  position: string | null;
  subset: string | null;
  variant: string | null;
  frontImageUrl: string | null;
  productSetName: string | null;
  isInsert: boolean;
  quantityPulled: number;
  soldQuantity: number;
  remainingPulledQuantity: number;
  realizedCents: number;
  rawOwned: number;
  gradedOwned: number;
  totalOwned: number;
  gradedFromBox: number;
  gradingFeeCents: number;
  bestGrade: number | null;
  pendingGradingQuantity: number;
  revealedGradingQuantity: number;
  status: CardStatus;
  bookValueCents: number;
  totalValueCents: number;
  remainingValueCents: number;
  totalPositionCents: number;
  firstPulledAt: string;
};

type ApiData = {
  ok: boolean;
  error?: string;
  box: {
    id: number;
    productName: string;
    purchasePriceCents: number;
    packsPurchased: number;
    packsOpened: number;
    isClosed: boolean;
    createdAt: string;
    totalPulledCards: number;
    totalUniqueCards: number;
    totalPullValueCents: number;
    remainingInventoryValueCents: number;
    realizedCents: number;
    gradingFeeCents: number;
    totalPositionCents: number;
    profitCents: number;
    roiPct: number | null;
  };
  cards: BoxCard[];
};

const colors = {
  text: "#171717",
  muted: "#6b7280",
  border: "#e5ded3",
  borderStrong: "#d7cbb9",
  gold: "#8a6200",
  goldSoft: "#fff8e8",
  green: "#166534",
  greenSoft: "#ecfdf3",
  red: "#991b1b",
  blue: "#16477d",
  blueSoft: "#eef5fb",
  purple: "#6d28d9",
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function pct(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function subtitle(card: BoxCard) {
  return [card.team, card.subset, card.variant].filter(Boolean).join(" · ");
}

function setLabel(card: BoxCard) {
  return card.productSetName || (card.isInsert ? "Insert" : "Base");
}

function statusMeta(status: CardStatus) {
  if (status === "SOLD_OUT") return { label: "Sold", cls: "sold" };
  if (status === "PARTIAL") return { label: "Partial", cls: "partial" };
  if (status === "GRADED") return { label: "Graded", cls: "graded" };
  if (status === "GRADED_PARTIAL") return { label: "Graded + Partial", cls: "gradedPartial" };
  if (status === "GRADED_SOLD_OUT") return { label: "Graded + Sold", cls: "gradedSold" };
  return { label: "Holding", cls: "holding" };
}

export default function BoxDetailClient({ boxId }: { boxId: string }) {
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("position");
  const [busy, setBusy] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch(`/api/analytics/boxes/${boxId}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiData | null;

      if (cancelled) return;

      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Failed to load box.");
        return;
      }

      setData(json);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [boxId]);

  const cards = useMemo(() => {
    const rows = [...(data?.cards ?? [])];

    rows.sort((a, b) => {
      if (sortKey === "value") return b.totalValueCents - a.totalValueCents;
      if (sortKey === "cash") return b.realizedCents - a.realizedCents;
      if (sortKey === "book") return b.bookValueCents - a.bookValueCents;
      if (sortKey === "qty") return b.quantityPulled - a.quantityPulled;
      if (sortKey === "held") return b.remainingPulledQuantity - a.remainingPulledQuantity;
      if (sortKey === "sold") return b.soldQuantity - a.soldQuantity;
      if (sortKey === "graded") return b.gradedFromBox - a.gradedFromBox;
      if (sortKey === "owned") return b.totalOwned - a.totalOwned;
      if (sortKey === "player") return a.player.localeCompare(b.player);
      if (sortKey === "number") {
        return a.cardNumber.localeCompare(b.cardNumber, undefined, { numeric: true });
      }
      if (sortKey === "set") {
        return setLabel(a).localeCompare(setLabel(b));
      }

      return b.totalPositionCents - a.totalPositionCents;
    });

    return rows;
  }, [data?.cards, sortKey]);

  const topPulls = useMemo(() => {
    return [...(data?.cards ?? [])]
      .sort((a, b) => {
        const byBook = b.bookValueCents - a.bookValueCents;
        if (byBook !== 0) return byBook;
        return b.totalValueCents - a.totalValueCents;
      })
      .slice(0, 5);
  }, [data?.cards]);

  async function getOffer(cardId: number) {
    setBusy(`offer-${cardId}`);

    try {
      const res = await fetch("/api/shop/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Offer failed.");
      }

      alert(json.reused ? "Existing active offer found." : "Shop offer created.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Offer failed.");
    } finally {
      setBusy("");
    }
  }

  async function submitToGrading(cardId: number) {
    setBusy(`grade-${cardId}`);

    try {
      const res = await fetch("/api/grading/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, quantity: 1 }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Grading submission failed.");
      }

      alert("Submitted 1 raw copy for grading.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Grading submission failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="boxDetailPage">
      <style>{`
        .boxDetailPage {
          min-height: 100vh;
          color: ${colors.text};
          background:
            radial-gradient(circle at top left, rgba(245,158,11,.12), transparent 30%),
            linear-gradient(180deg,#f8f3ea,#f2eadf);
        }

        .boxDetailWrap {
          max-width: 1280px;
          margin: 0 auto;
          padding: 12px 10px 32px;
        }

        .boxDetailTitle {
          margin: 7px 0 3px;
          font-size: clamp(30px,7vw,40px);
          line-height: 1;
          letter-spacing: -.045em;
          font-weight: 1000;
        }

        .boxDetailProduct {
          color: ${colors.muted};
          font-size: 12.5px;
          font-weight: 800;
        }

        .boxSummary {
          margin-top: 11px;
          display: grid;
          grid-template-columns: repeat(6,minmax(0,1fr));
          border: 1px solid ${colors.borderStrong};
          border-radius: 15px;
          overflow: hidden;
          background: rgba(255,255,255,.9);
        }

        .boxSummaryCell {
          min-width: 0;
          padding: 9px 10px;
          border-left: 1px solid ${colors.border};
        }

        .boxSummaryCell:first-child {
          border-left: 0;
        }

        .boxLabel {
          color: ${colors.muted};
          font-size: 9px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: .04em;
          white-space: nowrap;
        }

        .boxSummaryValue {
          margin-top: 3px;
          font-size: 16px;
          line-height: 1.05;
          font-weight: 1000;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .boxSection {
          margin-top: 11px;
          border: 1px solid ${colors.borderStrong};
          background: rgba(255,255,255,.86);
          border-radius: 16px;
          overflow: hidden;
        }

        .boxSectionHeader {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
          padding: 10px 11px;
          border-bottom: 1px solid ${colors.border};
          background: linear-gradient(90deg,${colors.goldSoft},rgba(255,255,255,.94));
        }

        .boxSectionTitle {
          font-size: 16px;
          line-height: 1.1;
          font-weight: 1000;
        }

        .boxSectionSub {
          margin-top: 2px;
          color: ${colors.muted};
          font-size: 10.5px;
          font-weight: 750;
        }

        .boxSectionBody {
          padding: 9px 10px 10px;
        }

        .topPullGrid {
          display: grid;
          grid-template-columns: repeat(5,minmax(0,1fr));
          gap: 8px;
        }

        .topPullCard {
          min-width: 0;
          display: grid;
          gap: 5px;
          text-decoration: none;
          color: inherit;
        }

        .topPullImage {
          width: 100%;
          aspect-ratio: 2.5 / 3.5;
          object-fit: cover;
          border-radius: 9px;
          border: 1px solid ${colors.border};
          background: #f3f4f6;
        }

        .topPullMissing {
          width: 100%;
          aspect-ratio: 2.5 / 3.5;
          border-radius: 9px;
          border: 1px solid ${colors.border};
          background: #f4f4f5;
          display: grid;
          place-items: center;
          text-align: center;
          padding: 6px;
          color: ${colors.muted};
          font-size: 9px;
          font-weight: 900;
        }

        .topPullName {
          font-size: 11px;
          line-height: 1.15;
          font-weight: 1000;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .topPullValue {
          color: ${colors.gold};
          font-size: 10.5px;
          font-weight: 1000;
        }

        .boxSort {
          border: 1px solid ${colors.borderStrong};
          border-radius: 10px;
          background: #fff;
          padding: 7px 9px;
          color: ${colors.text};
          font-size: 11px;
          font-weight: 900;
        }

        .desktopLedger {
          overflow-x: auto;
        }

        .desktopLedger table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1080px;
        }

        .desktopLedger th {
          text-align: left;
          color: ${colors.muted};
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .03em;
          padding: 7px 8px;
          border-bottom: 1px solid ${colors.border};
        }

        .desktopLedger td {
          padding: 8px;
          border-bottom: 1px solid #eee;
          font-size: 12px;
          font-weight: 750;
        }

        .cardLink {
          color: ${colors.text};
          text-decoration: none;
          font-weight: 1000;
        }

        .cardLink:hover {
          color: ${colors.gold};
        }

        .statusPill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 3px 6px;
          font-size: 9px;
          font-weight: 950;
          white-space: nowrap;
        }

        .holding { background: ${colors.blueSoft}; color: ${colors.blue}; }
        .partial { background: ${colors.goldSoft}; color: ${colors.gold}; }
        .sold { background: ${colors.greenSoft}; color: ${colors.green}; }
        .graded { background: #f5f3ff; color: ${colors.purple}; }
        .gradedPartial { background: #fef3c7; color: #7c2d12; }
        .gradedSold { background: #d1fae5; color: #047857; }

        .ledgerActions {
          display: flex;
          gap: 5px;
          justify-content: flex-end;
        }

        .ledgerButton {
          border: 1px solid ${colors.borderStrong};
          border-radius: 9px;
          padding: 6px 8px;
          background: #fff;
          color: ${colors.text};
          font-size: 10.5px;
          font-weight: 950;
          cursor: pointer;
        }

        .ledgerButton.primary {
          background: ${colors.text};
          color: #fff;
          border-color: ${colors.text};
        }

        .ledgerButton:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .mobileLedger {
          display: none;
        }

        @media (max-width: 760px) {
          .boxDetailWrap {
            padding: 10px 8px 24px;
          }

          .boxDetailTitle {
            font-size: 29px;
          }

          .boxDetailProduct {
            font-size: 11.5px;
          }

          .boxSummary {
            grid-template-columns: repeat(3,minmax(0,1fr));
          }

          .boxSummaryCell {
            padding: 7px 6px;
          }

          .boxSummaryCell:nth-child(4) {
            border-left: 0;
            border-top: 1px solid ${colors.border};
          }

          .boxSummaryCell:nth-child(5),
          .boxSummaryCell:nth-child(6) {
            border-top: 1px solid ${colors.border};
          }

          .boxSummaryValue {
            font-size: 12.5px;
          }

          .boxSection {
            margin-top: 9px;
            border-radius: 14px;
          }

          .boxSectionHeader {
            padding: 8px 9px;
            align-items: stretch;
            flex-direction: column;
          }

          .boxSectionTitle {
            font-size: 14px;
          }

          .boxSectionSub {
            font-size: 9.5px;
          }

          .boxSort {
            width: 100%;
          }

          .boxSectionBody {
            padding: 8px;
          }

          .topPullGrid {
            grid-template-columns: repeat(5,92px);
            overflow-x: auto;
            gap: 7px;
            padding-bottom: 3px;
          }

          .topPullName {
            font-size: 10px;
          }

          .topPullValue {
            font-size: 10px;
          }

          .desktopLedger {
            display: none;
          }

          .mobileLedger {
            display: grid;
            gap: 6px;
          }

          .mobilePullRow {
            border: 1px solid ${colors.border};
            border-radius: 12px;
            background: #fff;
            padding: 8px;
          }

          .mobilePullTop {
            display: grid;
            grid-template-columns: minmax(0,1fr) auto;
            gap: 8px;
            align-items: start;
          }

          .mobilePullName {
            font-size: 13.5px;
            line-height: 1.1;
            font-weight: 1000;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .mobilePullSub {
            margin-top: 2px;
            color: ${colors.muted};
            font-size: 9.5px;
            line-height: 1.2;
            font-weight: 750;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .mobilePosition {
            text-align: right;
            font-size: 13px;
            font-weight: 1000;
            white-space: nowrap;
          }

          .mobilePullInfo {
            margin-top: 6px;
            display: grid;
            grid-template-columns: repeat(4,minmax(0,1fr));
            border: 1px solid ${colors.border};
            border-radius: 9px;
            overflow: hidden;
          }

          .mobilePullMetric {
            min-width: 0;
            padding: 5px 5px;
            border-left: 1px solid ${colors.border};
          }

          .mobilePullMetric:first-child {
            border-left: 0;
          }

          .mobilePullMetricValue {
            margin-top: 1px;
            font-size: 10.5px;
            line-height: 1.05;
            font-weight: 1000;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .mobilePullFooter {
            margin-top: 6px;
            display: grid;
            grid-template-columns: minmax(0,1fr) auto auto auto;
            gap: 5px;
            align-items: center;
          }

          .mobileStatusLine {
            min-width: 0;
            display: flex;
            gap: 4px;
            align-items: center;
            overflow: hidden;
          }

          .mobileStatusLine .statusPill {
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .mobilePullFooter .ledgerButton,
          .mobilePullFooter a.ledgerButton {
            min-width: 0;
            padding: 5px 7px;
            font-size: 9.5px;
            text-decoration: none;
            text-align: center;
          }
        }
      `}</style>

      <div className="boxDetailWrap">
        <Link href="/analytics/boxes" className="vcs-back-link">
          ← Box Portfolio
        </Link>

        {error ? (
          <div className="boxSection" style={{ padding: 10, color: colors.red, fontWeight: 900 }}>
            {error}
          </div>
        ) : !data ? (
          <div className="boxSection" style={{ padding: 10, fontWeight: 900 }}>
            Loading box…
          </div>
        ) : (
          <>
            <h1 className="boxDetailTitle">Box #{data.box.id}</h1>
            <div className="boxDetailProduct">
              {data.box.productName} · {data.box.packsOpened}/{data.box.packsPurchased} packs opened
            </div>

            <section className="boxSummary">
              <SummaryCell label="Cost" value={money(data.box.purchasePriceCents)} />
              <SummaryCell label="Inventory" value={money(data.box.remainingInventoryValueCents)} />
              <SummaryCell label="Cash" value={money(data.box.realizedCents)} tone={data.box.realizedCents} />
              <SummaryCell label="Position" value={money(data.box.totalPositionCents)} />
              <SummaryCell label="Profit" value={money(data.box.profitCents)} tone={data.box.profitCents} />
              <SummaryCell label="ROI" value={pct(data.box.roiPct)} tone={data.box.profitCents} />
            </section>

            <section className="boxSection">
              <div className="boxSectionHeader">
                <div>
                  <div className="boxSectionTitle">Top Pulls</div>
                  <div className="boxSectionSub">Best five cards by raw book value.</div>
                </div>
              </div>

              <div className="boxSectionBody">
                {topPulls.length === 0 ? (
                  <div style={{ color: colors.muted, fontWeight: 850, fontSize: 11.5 }}>
                    Open tracked packs from this box to populate the showcase.
                  </div>
                ) : (
                  <div className="topPullGrid">
                    {topPulls.map((card) => (
                      <Link href={`/cards/${card.id}`} className="topPullCard" key={card.id}>
                        {card.frontImageUrl ? (
                          <img
                            className="topPullImage"
                            src={card.frontImageUrl}
                            alt={`${card.player} #${card.cardNumber}`}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="topPullMissing">
                            {card.player}
                            <br />#{card.cardNumber}
                          </div>
                        )}

                        <div className="topPullName">
                          {card.player} #{card.cardNumber}
                        </div>
                        <div className="topPullValue">{money(card.bookValueCents)}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="boxSection">
              <div className="boxSectionHeader">
                <div>
                  <div className="boxSectionTitle">Pull Ledger</div>
                  <div className="boxSectionSub">
                    Inventory, sales, grading, and current value by card.
                  </div>
                </div>

                <select
                  className="boxSort"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                >
                  <option value="position">Total Position</option>
                  <option value="value">Total Pull Value</option>
                  <option value="cash">Cash Realized</option>
                  <option value="book">Card Value</option>
                  <option value="qty">Quantity Pulled</option>
                  <option value="held">Held From Box</option>
                  <option value="owned">Total Owned</option>
                  <option value="sold">Quantity Sold</option>
                  <option value="graded">Quantity Graded</option>
                  <option value="player">Player A-Z</option>
                  <option value="number">Card #</option>
                  <option value="set">Product Set</option>
                </select>
              </div>

              <div className="boxSectionBody">
                <div className="desktopLedger">
                  <table>
                    <thead>
                      <tr>
                        <th>Card</th>
                        <th>Set</th>
                        <th>Pulled</th>
                        <th>Held</th>
                        <th>Owned</th>
                        <th>Sold</th>
                        <th>Graded</th>
                        <th>Cash</th>
                        <th>Total Value</th>
                        <th>Position</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {cards.map((card) => {
                        const meta = statusMeta(card.status);

                        return (
                          <tr key={card.id}>
                            <td>
                              <Link href={`/cards/${card.id}`} className="cardLink">
                                {card.player} #{card.cardNumber}
                              </Link>
                              <div style={{ color: colors.muted, fontSize: 10.5 }}>
                                {subtitle(card) || "—"}
                              </div>
                              <div style={{ marginTop: 3 }}>
                                <span className={`statusPill ${meta.cls}`}>{meta.label}</span>
                                {card.bestGrade ? (
                                  <span className="statusPill graded" style={{ marginLeft: 4 }}>
                                    Best {card.bestGrade}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td>{setLabel(card)}</td>
                            <td>{card.quantityPulled}</td>
                            <td>{card.remainingPulledQuantity}</td>
                            <td>{card.totalOwned}</td>
                            <td>{card.soldQuantity}</td>
                            <td>{card.gradedFromBox}</td>
                            <td style={{ color: card.realizedCents > 0 ? colors.green : colors.text }}>
                              {money(card.realizedCents)}
                            </td>
                            <td>{money(card.totalValueCents)}</td>
                            <td style={{ fontWeight: 1000 }}>{money(card.totalPositionCents)}</td>
                            <td>
                              <div className="ledgerActions">
                                <button
                                  className="ledgerButton"
                                  disabled={card.totalOwned <= 0 || busy !== ""}
                                  onClick={() => getOffer(card.id)}
                                >
                                  Offer
                                </button>
                                <button
                                  className="ledgerButton primary"
                                  disabled={card.rawOwned <= 0 || busy !== ""}
                                  onClick={() => submitToGrading(card.id)}
                                >
                                  Grade
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mobileLedger">
                  {cards.map((card) => {
                    const meta = statusMeta(card.status);

                    return (
                      <div className="mobilePullRow" key={card.id}>
                        <div className="mobilePullTop">
                          <div style={{ minWidth: 0 }}>
                            <Link href={`/cards/${card.id}`} className="cardLink mobilePullName">
                              {card.player} #{card.cardNumber}
                            </Link>
                            <div className="mobilePullSub">
                              {setLabel(card)}
                              {subtitle(card) ? ` · ${subtitle(card)}` : ""}
                            </div>
                          </div>

                          <div className="mobilePosition">{money(card.totalPositionCents)}</div>
                        </div>

                        <div className="mobilePullInfo">
                          <MobileMetric label="Pulled" value={String(card.quantityPulled)} />
                          <MobileMetric label="Held" value={String(card.remainingPulledQuantity)} />
                          <MobileMetric label="Owned" value={String(card.totalOwned)} />
                          <MobileMetric
                            label="Cash"
                            value={money(card.realizedCents)}
                            tone={card.realizedCents > 0 ? "green" : undefined}
                          />
                        </div>

                        <div className="mobilePullFooter">
                          <div className="mobileStatusLine">
                            <span className={`statusPill ${meta.cls}`}>{meta.label}</span>
                            {card.gradedFromBox > 0 ? (
                              <span className="statusPill graded">
                                Graded {card.gradedFromBox}
                                {card.bestGrade ? ` · Best ${card.bestGrade}` : ""}
                              </span>
                            ) : null}
                          </div>

                          <Link href={`/cards/${card.id}`} className="ledgerButton">
                            Details
                          </Link>

                          <button
                            className="ledgerButton"
                            disabled={card.totalOwned <= 0 || busy !== ""}
                            onClick={() => getOffer(card.id)}
                          >
                            Offer
                          </button>

                          <button
                            className="ledgerButton primary"
                            disabled={card.rawOwned <= 0 || busy !== ""}
                            onClick={() => submitToGrading(card.id)}
                          >
                            Grade
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
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
    <div className="boxSummaryCell">
      <div className="boxLabel">{label}</div>
      <div className="boxSummaryValue" style={{ color }}>
        {value}
      </div>
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
  tone?: "green";
}) {
  return (
    <div className="mobilePullMetric">
      <div className="boxLabel">{label}</div>
      <div
        className="mobilePullMetricValue"
        style={{ color: tone === "green" ? colors.green : colors.text }}
      >
        {value}
      </div>
    </div>
  );
}
