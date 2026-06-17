"use client";

// src/app/analytics/boxes/[boxId]/box-detail-client.tsx
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SortKey =
  | "value"
  | "book"
  | "qty"
  | "player"
  | "number"
  | "owned"
  | "set";

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
  rawOwned: number;
  gradedOwned: number;
  totalOwned: number;
  bookValueCents: number;
  totalValueCents: number;
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

export default function BoxDetailClient({ boxId }: { boxId: string }) {
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("value");
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
      if (sortKey === "book") return b.bookValueCents - a.bookValueCents;
      if (sortKey === "qty") return b.quantityPulled - a.quantityPulled;
      if (sortKey === "owned") return b.totalOwned - a.totalOwned;
      if (sortKey === "player") return a.player.localeCompare(b.player);
      if (sortKey === "number") return a.cardNumber.localeCompare(b.cardNumber, undefined, { numeric: true });
      if (sortKey === "set") return String(a.productSetName ?? "").localeCompare(String(b.productSetName ?? ""));
      return b.totalValueCents - a.totalValueCents;
    });

    return rows;
  }, [data?.cards, sortKey]);

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
        .tableWrap { overflow-x: auto; border-radius: 16px; }
        table { width: 100%; border-collapse: separate; border-spacing: 0 8px; min-width: 980px; }
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
        .gold { background: linear-gradient(135deg,#7c2d12,#f59e0b); color: white; border-color: #b45309; }
        .actions { display: flex; gap: 7px; justify-content: flex-end; }
        .mobileCards { display: none; }
        @media (max-width: 760px) {
          .desktopTable { display: none; }
          .mobileCards { display: grid; gap: 10px; }
          .cardRow {
            border: 1px solid #eadcc8;
            background: rgba(255,255,255,.9);
            border-radius: 18px;
            padding: 12px;
          }
          .actions { justify-content: stretch; }
          .actions button { flex: 1; }
        }
      `}</style>

      <div className="wrap">
        <Link href="/analytics/boxes" style={{ color: "#7c2d12", fontWeight: 950, textDecoration: "none" }}>
          ← Box Portfolio
        </Link>

        {error ? (
          <div className="panel" style={{ color: "#991b1b", fontWeight: 900 }}>{error}</div>
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
              <Stat label="Pull Value" value={money(data.box.totalPullValueCents)} />
              <Stat label="Paper Profit" value={money(data.box.profitCents)} tone={data.box.profitCents} />
              <Stat label="Paper ROI" value={pct(data.box.roiPct)} tone={data.box.profitCents} />
              <Stat label="Packs Opened" value={`${data.box.packsOpened}/${data.box.packsPurchased}`} />
              <Stat label="Cards Pulled" value={`${data.box.totalPulledCards}`} />
            </section>

            <section className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 1000 }}>Pull Ledger</div>
                  <div style={{ color: "#6b7280", fontWeight: 700, fontSize: 13 }}>
                    Sortable card table with direct shop and grading actions.
                  </div>
                </div>

                <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                  <option value="value">Sort: Total Value</option>
                  <option value="book">Sort: Card Value</option>
                  <option value="qty">Sort: Quantity Pulled</option>
                  <option value="owned">Sort: Currently Owned</option>
                  <option value="player">Sort: Player A-Z</option>
                  <option value="number">Sort: Card #</option>
                  <option value="set">Sort: Set/Subtype</option>
                </select>
              </div>

              <div className="desktopTable tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Card</th>
                      <th>Set</th>
                      <th>Qty</th>
                      <th>Owned</th>
                      <th>Raw</th>
                      <th>Graded</th>
                      <th>Card Value</th>
                      <th>Total Value</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map((card) => (
                      <tr key={card.id}>
                        <td>
                          <div style={{ fontWeight: 1000 }}>{card.player} #{card.cardNumber}</div>
                          <div style={{ color: "#6b7280", fontSize: 12 }}>{subtitle(card) || "—"}</div>
                        </td>
                        <td>{card.productSetName ?? "Base"}</td>
                        <td>{card.quantityPulled}</td>
                        <td>{card.totalOwned}</td>
                        <td>{card.rawOwned}</td>
                        <td>{card.gradedOwned}</td>
                        <td>{money(card.bookValueCents)}</td>
                        <td>{money(card.totalValueCents)}</td>
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
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mobileCards">
                {cards.map((card) => (
                  <div className="cardRow" key={card.id}>
                    <div style={{ fontWeight: 1000 }}>{card.player} #{card.cardNumber}</div>
                    <div style={{ color: "#6b7280", fontWeight: 700, fontSize: 13 }}>{subtitle(card) || card.productSetName || "Base"}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginTop: 10 }}>
                      <Mini label="Qty" value={String(card.quantityPulled)} />
                      <Mini label="Owned" value={String(card.totalOwned)} />
                      <Mini label="Card Value" value={money(card.bookValueCents)} />
                      <Mini label="Total" value={money(card.totalValueCents)} />
                    </div>
                    <div className="actions" style={{ marginTop: 10 }}>
                      <button disabled={card.totalOwned <= 0 || busy !== ""} onClick={() => getOffer(card.id)}>Offer</button>
                      <button className="primary" disabled={card.rawOwned <= 0 || busy !== ""} onClick={() => submitToGrading(card.id)}>Grade</button>
                    </div>
                  </div>
                ))}
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
      <div className="value" style={{ color }}>{value}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div style={{ fontWeight: 1000 }}>{value}</div>
    </div>
  );
}