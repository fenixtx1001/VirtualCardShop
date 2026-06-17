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
  | "sold"
  | "graded"
  | "player"
  | "number"
  | "owned"
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
  if (status === "SOLD_OUT") return { label: "Sold Out", emoji: "✓", cls: "sold" };
  if (status === "PARTIAL") return { label: "Partial Exit", emoji: "◐", cls: "partial" };
  if (status === "GRADED") return { label: "Graded", emoji: "◆", cls: "graded" };
  if (status === "GRADED_PARTIAL") return { label: "Graded + Partial", emoji: "◆◐", cls: "gradedPartial" };
  if (status === "GRADED_SOLD_OUT") return { label: "Graded + Sold", emoji: "◆✓", cls: "gradedSold" };
  return { label: "Holding", emoji: "●", cls: "holding" };
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
      if (sortKey === "sold") return b.soldQuantity - a.soldQuantity;
      if (sortKey === "graded") return b.gradedFromBox - a.gradedFromBox;
      if (sortKey === "owned") return b.remainingPulledQuantity - a.remainingPulledQuantity;
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
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Offer failed.");
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
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Grading submission failed.");
      alert("Submitted 1 raw copy for grading.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Grading submission failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="page">
      <style>{`
        .page {
          min-height: 100vh;
          background: radial-gradient(circle at top left, rgba(245,158,11,.2), transparent 34%), linear-gradient(180deg,#f8f1e7,#efe2cf);
          font-family: system-ui;
          color: #111827;
        }
        .wrap { max-width: 1280px; margin: 0 auto; padding: 18px 16px 44px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); gap: 12px; margin-top: 18px; }
        .stat, .panel { border: 1px solid #d8cab7; background: rgba(255,255,255,.78); border-radius: 20px; box-shadow: 0 18px 45px rgba(80,49,20,.10); }
        .stat { padding: 14px; }
        .label { color: #6b7280; font-weight: 900; font-size: 12px; text-transform: uppercase; }
        .value { margin-top: 5px; font-weight: 1000; font-size: 23px; }
        .panel { margin-top: 16px; padding: 12px; }
        .showcase {
          margin-top: 18px;
          border: 1px solid #d8cab7;
          border-radius: 24px;
          padding: 16px 16px 20px;
          background:
            radial-gradient(circle at 20% 0%, rgba(245,158,11,.20), transparent 28%),
            linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,251,235,.72));
          box-shadow: 0 22px 54px rgba(80,49,20,.13);
          overflow: hidden;
        }
        .showcaseHeader {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .stands {
          display: grid;
          grid-template-columns: repeat(5, minmax(120px, 1fr));
          gap: 14px;
          align-items: end;
        }
        .standSlot {
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          position: relative;
          padding-top: 4px;
        }
        .topLoader {
          width: min(100%, 160px);
          aspect-ratio: 2.5 / 3.5;
          border-radius: 13px;
          padding: 8px;
          position: relative;
          background:
            linear-gradient(135deg, rgba(255,255,255,.72), rgba(219,234,254,.30)),
            rgba(255,255,255,.34);
          border: 1px solid rgba(148,163,184,.65);
          box-shadow:
            inset 0 0 0 2px rgba(255,255,255,.45),
            0 18px 32px rgba(15,23,42,.18);
          backdrop-filter: blur(5px);
          transform: translateY(2px);
        }
        .topLoader::before {
          content: "";
          position: absolute;
          inset: 5px 7px auto;
          height: 28%;
          border-radius: 10px;
          background: linear-gradient(135deg, rgba(255,255,255,.45), rgba(255,255,255,0));
          pointer-events: none;
          z-index: 2;
        }
        .topLoader::after {
          content: "";
          position: absolute;
          top: 6px;
          right: 9px;
          width: 26px;
          height: 72%;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(255,255,255,.26), rgba(255,255,255,0));
          pointer-events: none;
          z-index: 2;
        }
        .cardImage {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 8px;
          background: #f3f4f6;
          display: block;
          box-shadow: 0 1px 4px rgba(15,23,42,.16);
        }
        .missingCard {
          width: 100%;
          height: 100%;
          border-radius: 8px;
          background: linear-gradient(135deg, #f8fafc, #e5e7eb);
          display: grid;
          place-items: center;
          text-align: center;
          color: #6b7280;
          font-weight: 950;
          font-size: 12px;
          padding: 8px;
        }
        .standBase {
          width: min(86%, 142px);
          height: 21px;
          margin-top: -2px;
          border-radius: 7px 7px 14px 14px;
          background: linear-gradient(180deg, #7c4a1f, #3f2412);
          box-shadow: 0 13px 22px rgba(63,36,18,.24);
          position: relative;
        }
        .standBase::before {
          content: "";
          position: absolute;
          left: 12%;
          right: 12%;
          top: -8px;
          height: 12px;
          border-radius: 7px 7px 2px 2px;
          background: linear-gradient(180deg, #a16207, #5b3416);
        }
        .pullMeta { margin-top: 9px; text-align: center; width: 100%; }
        .pullName {
          font-weight: 1000;
          font-size: 13px;
          line-height: 1.15;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pullValue { margin-top: 3px; color: #92400e; font-weight: 1000; font-size: 13px; }
        .tableWrap { overflow-x: auto; border-radius: 16px; }
        table { width: 100%; border-collapse: separate; border-spacing: 0 8px; min-width: 1080px; }
        th { text-align: left; color: #6b7280; font-size: 12px; text-transform: uppercase; padding: 0 10px; }
        td { background: rgba(255,255,255,.9); border-top: 1px solid #eadcc8; border-bottom: 1px solid #eadcc8; padding: 10px; vertical-align: middle; font-weight: 750; }
        td:first-child { border-left: 1px solid #eadcc8; border-radius: 14px 0 0 14px; }
        td:last-child { border-right: 1px solid #eadcc8; border-radius: 0 14px 14px 0; }
        button, select, .pill {
          border-radius: 999px;
          border: 1px solid #d8cab7;
          padding: 8px 10px;
          font-weight: 950;
          background: #fff;
          color: #111827;
        }
        button { cursor: pointer; }
        button:disabled { opacity: .45; cursor: not-allowed; }
        .primary { background: #111827; color: white; border-color: #111827; }
        .actions { display: flex; gap: 7px; justify-content: flex-end; }
        .mobileCards { display: none; }
        .cardLink {
          color: #111827;
          text-decoration: none;
          font-weight: 1000;
        }
        .cardLink:hover { color: #92400e; text-decoration: underline; }
        .statusStack {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 5px;
        }
        .statusPill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border-radius: 999px;
          padding: 3px 7px;
          font-size: 10px;
          font-weight: 1000;
          border: 1px solid transparent;
          white-space: nowrap;
        }
        .holding { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
        .partial { background: #fffbeb; color: #92400e; border-color: #fde68a; }
        .sold { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
        .graded { background: #f5f3ff; color: #6d28d9; border-color: #ddd6fe; }
        .gradedPartial { background: #fef3c7; color: #7c2d12; border-color: #fbbf24; }
        .gradedSold { background: #d1fae5; color: #047857; border-color: #6ee7b7; }
        .setBadge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 3px 7px;
          background: #f8fafc;
          border: 1px solid #e5e7eb;
          color: #374151;
          font-size: 11px;
          font-weight: 1000;
          max-width: 180px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .moneyGood { color: #166534; font-weight: 1000; }
        .moneyNeutral { color: #111827; font-weight: 1000; }

        @media (max-width: 900px) {
          .stands {
            grid-template-columns: repeat(5, minmax(112px, 1fr));
            overflow-x: auto;
            padding-bottom: 4px;
          }
          .standSlot { min-width: 120px; }
        }

        @media (max-width: 760px) {
          .wrap { padding: 12px 10px 36px; }
          .stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            margin-top: 12px;
          }
          .stat { padding: 10px; border-radius: 16px; }
          .label { font-size: 10px; letter-spacing: .02em; }
          .value { font-size: 18px; margin-top: 3px; }
          h1 { font-size: 28px !important; }

          .desktopTable { display: none; }
          .mobileCards {
            display: grid;
            gap: 7px;
          }
          .cardRow {
            border: 1px solid #eadcc8;
            background: rgba(255,255,255,.92);
            border-radius: 14px;
            padding: 9px 10px;
          }
          .mobileTopLine {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
            align-items: start;
          }
          .mobileName {
            font-size: 15px;
            line-height: 1.1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .mobileSub {
            color: #6b7280;
            font-weight: 750;
            font-size: 11px;
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .mobileValue {
            text-align: right;
            font-size: 15px;
            font-weight: 1000;
            color: #111827;
            white-space: nowrap;
          }
          .mobileMeta {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 6px;
            margin-top: 8px;
          }
          .miniBox {
            border: 1px solid #f0dfc8;
            background: #fffaf2;
            border-radius: 10px;
            padding: 5px 6px;
            min-width: 0;
          }
          .miniBox .label { font-size: 9px; }
          .miniValue {
            font-size: 13px;
            font-weight: 1000;
            margin-top: 1px;
            white-space: nowrap;
          }
          .mobileActions {
            display: grid;
            grid-template-columns: .8fr .9fr .9fr;
            gap: 6px;
            margin-top: 8px;
          }
          .mobileActions a,
          .mobileActions button {
            width: 100%;
            text-align: center;
            font-size: 12px;
            padding: 7px 6px;
            text-decoration: none;
          }

          .panel { padding: 10px; border-radius: 18px; }
          .showcase { padding: 13px 10px 16px; border-radius: 20px; }
          .showcaseHeader { margin-bottom: 10px; }
          .stands {
            grid-template-columns: repeat(5, 122px);
            gap: 12px;
            overflow-x: auto;
            padding: 2px 2px 6px;
          }
          .standSlot { min-width: 122px; }
          .topLoader { width: 116px; padding: 7px; }
          .standBase { width: 104px; height: 18px; }
          .pullName { font-size: 11px; }
          .pullValue { font-size: 12px; }
          .statusStack {
            gap: 4px;
            margin-top: 6px;
          }
          .statusPill {
            font-size: 9px;
            padding: 3px 6px;
          }
          .setBadge {
            max-width: 150px;
            font-size: 10px;
            padding: 2px 6px;
          }
        }

        @media (max-width: 430px) {
          .mobileMeta {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 5px;
          }
          .miniBox {
            padding: 4px 5px;
          }
          .miniValue {
            font-size: 12px;
          }
        }
      `}</style>

      <div className="wrap">
        <Link href="/analytics/boxes" style={{ color: "#7c2d12", fontWeight: 950, textDecoration: "none" }}>
          ← Box Portfolio
        </Link>

        {error ? (
          <div className="panel" style={{ color: "#991b1b", fontWeight: 900 }}>
            {error}
          </div>
        ) : !data ? (
          <div className="panel" style={{ fontWeight: 900 }}>Loading box…</div>
        ) : (
          <>
            <h1 style={{ margin: "10px 0 4px", fontSize: 34, letterSpacing: -1.2 }}>
              Box #{data.box.id}
            </h1>
            <div style={{ color: "#6b7280", fontWeight: 750 }}>{data.box.productName}</div>

            <section className="stats">
              <Stat label="Cost Basis" value={money(data.box.purchasePriceCents)} />
              <Stat label="Inventory" value={money(data.box.remainingInventoryValueCents)} />
              <Stat label="Cash Realized" value={money(data.box.realizedCents)} tone={data.box.realizedCents} />
              <Stat label="Position" value={money(data.box.totalPositionCents)} />
              <Stat label="Net Profit" value={money(data.box.profitCents)} tone={data.box.profitCents} />
              <Stat label="ROI" value={pct(data.box.roiPct)} tone={data.box.profitCents} />
            </section>

            <section className="showcase">
              <div className="showcaseHeader">
                <div>
                  <div style={{ fontSize: 20, fontWeight: 1000 }}>Top Pull Showcase</div>
                  <div style={{ color: "#6b7280", fontWeight: 750, fontSize: 13 }}>
                    Best five cards by raw book value so far.
                  </div>
                </div>
                <div className="pill" style={{ background: "#fffbeb", color: "#92400e" }}>
                  Breaker Stand View
                </div>
              </div>

              {topPulls.length === 0 ? (
                <div style={{ color: "#6b7280", fontWeight: 850 }}>
                  Open tracked packs from this box to fill the stand.
                </div>
              ) : (
                <div className="stands">
                  {topPulls.map((card, index) => (
                    <div className="standSlot" key={card.id}>
                      <div style={{ color: "#92400e", fontWeight: 1000, fontSize: 12, marginBottom: 6 }}>
                        #{index + 1}
                      </div>

                      <Link href={`/cards/${card.id}`} className="topLoader" style={{ display: "block" }}>
                        {card.frontImageUrl ? (
                          <img
                            className="cardImage"
                            src={card.frontImageUrl}
                            alt={`${card.player} #${card.cardNumber}`}
                          />
                        ) : (
                          <div className="missingCard">
                            {card.player}
                            <br />#{card.cardNumber}
                          </div>
                        )}
                      </Link>

                      <div className="standBase" />

                      <div className="pullMeta">
                        <Link href={`/cards/${card.id}`} className="cardLink pullName" title={`${card.player} #${card.cardNumber}`}>
                          {card.player} #{card.cardNumber}
                        </Link>
                        <div className="pullValue">{money(card.bookValueCents)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 1000 }}>Pull Ledger</div>
                  <div style={{ color: "#6b7280", fontWeight: 700, fontSize: 13 }}>
                    Track pulled inventory, sales cash, grading activity, and current position.
                  </div>
                </div>

                <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                  <option value="position">Sort: Total Position</option>
                  <option value="value">Sort: Total Pull Value</option>
                  <option value="cash">Sort: Cash Realized</option>
                  <option value="book">Sort: Card Value</option>
                  <option value="qty">Sort: Quantity Pulled</option>
                  <option value="sold">Sort: Quantity Sold</option>
                  <option value="graded">Sort: Quantity Graded</option>
                  <option value="owned">Sort: Held From Box</option>
                  <option value="player">Sort: Player A-Z</option>
                  <option value="number">Sort: Card #</option>
                  <option value="set">Sort: Product Set</option>
                </select>
              </div>

              <div className="desktopTable tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Card</th>
                      <th>Set</th>
                      <th>Pulled</th>
                      <th>Held</th>
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
                            <div style={{ color: "#6b7280", fontSize: 12 }}>
                              {subtitle(card) || "—"}
                            </div>
                            <div className="statusStack">
                              <span className={`statusPill ${meta.cls}`}>
                                {meta.emoji} {meta.label}
                              </span>
                              {card.bestGrade ? (
                                <span className="statusPill graded">◆ Best {card.bestGrade}</span>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <span className="setBadge">{setLabel(card)}</span>
                          </td>
                          <td>{card.quantityPulled}</td>
                          <td>{card.remainingPulledQuantity}</td>
                          <td>{card.soldQuantity}</td>
                          <td>{card.gradedFromBox}</td>
                          <td className={card.realizedCents > 0 ? "moneyGood" : "moneyNeutral"}>
                            {money(card.realizedCents)}
                          </td>
                          <td>{money(card.totalValueCents)}</td>
                          <td className="moneyNeutral">{money(card.totalPositionCents)}</td>
                          <td>
                            <div className="actions">
                              <button disabled={card.totalOwned <= 0 || busy !== ""} onClick={() => getOffer(card.id)}>
                                Offer
                              </button>
                              <button className="primary" disabled={card.rawOwned <= 0 || busy !== ""} onClick={() => submitToGrading(card.id)}>
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

              <div className="mobileCards">
                {cards.map((card) => {
                  const meta = statusMeta(card.status);

                  return (
                    <div className="cardRow" key={card.id}>
                      <div className="mobileTopLine">
                        <div style={{ minWidth: 0 }}>
                          <Link href={`/cards/${card.id}`} className="cardLink mobileName">
                            {card.player} #{card.cardNumber}
                          </Link>
                          <div className="mobileSub">
                            {setLabel(card)}
                            {subtitle(card) ? ` · ${subtitle(card)}` : ""}
                          </div>
                        </div>
                        <div className="mobileValue">{money(card.totalPositionCents)}</div>
                      </div>

                      <div className="statusStack">
                        <span className={`statusPill ${meta.cls}`}>
                          {meta.emoji} {meta.label}
                        </span>
                        {card.soldQuantity > 0 ? (
                          <span className="statusPill sold">Cash {money(card.realizedCents)}</span>
                        ) : null}
                        {card.gradedFromBox > 0 ? (
                          <span className="statusPill graded">
                            ◆ Graded {card.gradedFromBox}
                            {card.bestGrade ? ` · Best ${card.bestGrade}` : ""}
                          </span>
                        ) : null}
                      </div>

                      <div className="mobileMeta">
                        <Mini label="Pulled" value={String(card.quantityPulled)} />
                        <Mini label="Held" value={String(card.remainingPulledQuantity)} />
                        <Mini label="Sold" value={String(card.soldQuantity)} />
                        <Mini label="Total" value={money(card.totalValueCents)} />
                      </div>

                      <div className="mobileActions">
                        <Link href={`/cards/${card.id}`} className="pill">
                          Details
                        </Link>
                        <button disabled={card.totalOwned <= 0 || busy !== ""} onClick={() => getOffer(card.id)}>
                          Offer
                        </button>
                        <button className="primary" disabled={card.rawOwned <= 0 || busy !== ""} onClick={() => submitToGrading(card.id)}>
                          Grade
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const color = tone === undefined ? "#111827" : tone >= 0 ? "#166534" : "#991b1b";
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="miniBox">
      <div className="label">{label}</div>
      <div className="miniValue">{value}</div>
    </div>
  );
}