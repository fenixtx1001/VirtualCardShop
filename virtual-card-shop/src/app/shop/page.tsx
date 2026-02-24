// src/app/shop/page.tsx
"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { YourCardsPicker } from "./your-cards-picker";

const ECONOMY_CHANGED_EVENT = "vcs:economy-changed";

type ProductRow = {
  id: string;
  year: number | null;
  brand: string | null;
  sport: string | null;
  packPriceCents: number;
  packsPerBox: number | null;
  boxPriceCents: number | null;

  packImageUrl: string | null;
  boxImageUrl: string | null;

  displayBoxImageUrl?: string | null;

  debug?: {
    hasPackImage?: boolean;
    hasBoxImage?: boolean;
    displayBoxFrom?: string;
  };

  productSetsCount: number;
  released?: boolean;
};

type SortKey = "name" | "year_desc" | "price_asc" | "price_desc";

type OfferCard = {
  id: number;
  player: string;
  cardNumber: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  bookValue: number;
  frontImageUrl: string | null;
  productSetId: string | null;
};

type ShopOfferRow = {
  id: number;
  userId: string;
  cardId: number;
  offerBps: number;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedQty?: number | null;
  acceptedTotalCents?: number | null;
  card?: OfferCard;
};

type ShopInventoryRow = {
  cardId: number;
  quantity: number;
  updatedAt?: string;
  card: OfferCard;
};

function centsToDollars(cents: number | null | undefined) {
  const c = typeof cents === "number" ? cents : 0;
  return (c / 100).toFixed(2);
}

function safeImgSrc(url: string | null | undefined) {
  const u = (url ?? "").trim();
  return u.length ? u : null;
}

function formatFriendlyProductName(productId: string) {
  const s = String(productId || "").trim();
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function Thumb({
  src,
  label,
  size = 190,
}: {
  src: string | null;
  label: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return (
      <div
        title={`${label} image not set (or blocked)`}
        style={{
          width: size,
          height: size,
          border: "1px dashed #bbb",
          borderRadius: 14,
          display: "grid",
          placeItems: "center",
          fontSize: 12,
          color: "#777",
          background: "#fafafa",
          padding: 10,
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        No {label}
        <br />
        image
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${label} image`}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        border: "1px solid #ddd",
        borderRadius: 14,
        background: "white",
        display: "block",
      }}
    />
  );
}

function computeBoxPriceCents(packPriceCents: number, packsPerBox: number) {
  return Math.round(packPriceCents * packsPerBox * 0.75);
}

function pctBpsToText(bps: number) {
  const pct = bps / 100;
  return `${pct.toFixed(2)}%`;
}

function fmtOfferLine(o: ShopOfferRow) {
  const player = o.card?.player ?? `Card #${o.cardId}`;
  const num = o.card?.cardNumber ? ` #${o.card.cardNumber}` : "";
  return `${player}${num}`;
}

function tabBtnStyle(active: boolean): CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ccc",
    background: active ? "#111" : "white",
    color: active ? "white" : "#111",
    fontWeight: 900,
    cursor: "pointer",
  };
}

/** ---------------------------
 *  SEALED TAB (existing UI)
 *  ------------------------- */
function SealedShopTab() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [qty, setQty] = useState<Record<string, number>>({});
  const [buyingKey, setBuyingKey] = useState<string | null>(null);

  const [msg, setMsg] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [sport, setSport] = useState<string>("all");
  const [year, setYear] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("name");

  async function load() {
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/shop/products", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Failed to load (${res.status})`);

      const incoming = Array.isArray(j) ? (j as ProductRow[]) : [];
      const normalized = incoming.map((p: any) => ({
        ...p,
        released: typeof p?.released === "boolean" ? p.released : false,
      })) as ProductRow[];

      setRows(normalized.filter((p) => p.released === true));
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load shop");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function buy(productId: string, kind: "pack" | "box") {
    const quantity = Math.max(1, Math.floor(qty[`${productId}:${kind}`] ?? 1));
    const key = `${productId}:${kind}`;
    setBuyingKey(key);
    setErr(null);
    setMsg(null);

    try {
      const res = await fetch("/api/shop/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, kind, quantity }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Non-JSON from buy (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Buy failed (${res.status})`);

      setMsg(`Bought ${kind} x${quantity} for $${centsToDollars(j.costCents)}. Packs added: ${j.packsAdded}.`);

      window.dispatchEvent(new CustomEvent(ECONOMY_CHANGED_EVENT));
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Buy failed");
    } finally {
      setBuyingKey(null);
    }
  }

  const sportOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.sport) set.add(r.sport);
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    for (const r of rows) if (typeof r.year === "number") set.add(r.year);
    const years = Array.from(set).sort((a, b) => b - a);
    return ["all", ...years.map(String)];
  }, [rows]);

  const filteredSorted = useMemo(() => {
    const query = q.trim().toLowerCase();

    let out = rows.filter((r) => {
      if (r.released !== true) return false;

      if (sport !== "all" && (r.sport ?? "") !== sport) return false;
      if (year !== "all" && String(r.year ?? "") !== year) return false;

      if (!query) return true;

      const friendly = formatFriendlyProductName(r.id);

      const hay = [r.id, friendly, r.brand ?? "", r.sport ?? "", r.year ?? ""].join(" ").toLowerCase();

      return hay.includes(query);
    });

    out.sort((a, b) => {
      if (sort === "name") return formatFriendlyProductName(a.id).localeCompare(formatFriendlyProductName(b.id));
      if (sort === "year_desc") return (b.year ?? 0) - (a.year ?? 0);
      if (sort === "price_asc") return (a.packPriceCents ?? 0) - (b.packPriceCents ?? 0);
      if (sort === "price_desc") return (b.packPriceCents ?? 0) - (a.packPriceCents ?? 0);
      return 0;
    });

    return out;
  }, [rows, q, sport, year, sort]);

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 900, marginTop: 0, marginBottom: 6 }}>Shop</h1>
          <div style={{ color: "#444" }}>
            Buy packs or discounted boxes. Boxes are priced at packPrice × packsPerBox × 0.75.
          </div>
        </div>

        <button
          onClick={load}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "white",
            fontWeight: 800,
          }}
        >
          Refresh
        </button>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 14,
          background: "#fafafa",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search (name, brand, sport, year)…"
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ccc",
            minWidth: 240,
          }}
        />

        <select
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ccc" }}
        >
          {sportOptions.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All sports" : s}
            </option>
          ))}
        </select>

        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ccc" }}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y === "all" ? "All years" : y}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ccc" }}
        >
          <option value="name">Sort: Name</option>
          <option value="year_desc">Sort: Year (new → old)</option>
          <option value="price_asc">Sort: Pack Price (low → high)</option>
          <option value="price_desc">Sort: Pack Price (high → low)</option>
        </select>

        <div style={{ marginLeft: "auto", fontSize: 12, color: "#444" }}>
          Showing <span style={{ fontWeight: 900 }}>{filteredSorted.length}</span> / {rows.length}
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {err ? (
        <div style={{ marginBottom: 12, padding: 12, background: "#fee", border: "1px solid #f99", borderRadius: 12 }}>
          {err}
        </div>
      ) : null}

      {msg ? (
        <div style={{ marginBottom: 12, padding: 12, background: "#efe", border: "1px solid #9f9", borderRadius: 12 }}>
          {msg}
        </div>
      ) : null}

      {loading ? (
        <div>Loading…</div>
      ) : filteredSorted.length === 0 ? (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12 }}>
          No matching products. Try clearing filters.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
          {filteredSorted.map((p) => {
            const packKey = `${p.id}:pack`;
            const boxKey = `${p.id}:box`;
            const packBuying = buyingKey === packKey;
            const boxBuying = buyingKey === boxKey;

            const displayName = formatFriendlyProductName(p.id);

            const boxOnlySrc = safeImgSrc(p.displayBoxImageUrl ?? p.boxImageUrl ?? p.packImageUrl);

            const derivedBox =
              p.packsPerBox && p.packsPerBox > 0 ? computeBoxPriceCents(p.packPriceCents, p.packsPerBox) : null;

            const boxPriceCents = p.boxPriceCents ?? derivedBox;

            return (
              <div
                key={p.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 16,
                  background: "white",
                  overflow: "hidden",
                  boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ padding: 14, borderBottom: "1px solid #eee", background: "#fafafa" }}>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>{displayName}</div>
                  <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                    {(p.year ?? "—")} • {(p.brand ?? "—")} • {(p.sport ?? "—")} • Product Sets: {p.productSetsCount}
                  </div>
                </div>

                <div style={{ padding: 14, display: "flex", justifyContent: "center" }}>
                  <Thumb src={boxOnlySrc} label="Box" size={190} />
                </div>

                <div style={{ padding: "0 14px 10px", fontSize: 11, color: "#666" }}>
                  {boxOnlySrc ? (
                    <>
                      Image source:{" "}
                      <span style={{ fontWeight: 800 }}>{p.debug?.displayBoxFrom ?? "displayBoxImageUrl/box/pack"}</span>{" "}
                      •{" "}
                      <a href={boxOnlySrc} target="_blank" rel="noreferrer">
                        Open image
                      </a>
                    </>
                  ) : (
                    <>
                      No image URL found (boxImageUrl and packImageUrl are empty).{" "}
                      <span style={{ fontWeight: 800 }}>
                        (hasBox={String(!!p.boxImageUrl)}, hasPack={String(!!p.packImageUrl)})
                      </span>
                    </>
                  )}
                </div>

                <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#333" }}>Pack</div>

                    <div style={{ fontSize: 12 }}>
                      <span style={{ fontWeight: 900 }}>Price:</span> ${centsToDollars(p.packPriceCents)}
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        value={String(qty[packKey] ?? 1)}
                        onChange={(e) => setQty((prev) => ({ ...prev, [packKey]: Number(e.target.value) }))}
                        style={{ width: 70, padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
                      />
                      <button
                        onClick={() => buy(p.id, "pack")}
                        disabled={packBuying}
                        style={{
                          flex: 1,
                          padding: "9px 10px",
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          background: packBuying ? "#f2f2f2" : "white",
                          fontWeight: 900,
                          cursor: packBuying ? "not-allowed" : "pointer",
                        }}
                      >
                        {packBuying ? "Buying…" : "Buy Pack(s)"}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#333" }}>Box</div>

                    <div style={{ fontSize: 12 }}>
                      <span style={{ fontWeight: 900 }}>Price:</span>{" "}
                      {boxPriceCents === null ? "—" : `$${centsToDollars(boxPriceCents)}`}
                      <span style={{ color: "#666" }}>{p.packsPerBox ? ` • ${p.packsPerBox} packs/box` : ""}</span>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        value={String(qty[boxKey] ?? 1)}
                        onChange={(e) => setQty((prev) => ({ ...prev, [boxKey]: Number(e.target.value) }))}
                        style={{ width: 70, padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
                      />
                      <button
                        onClick={() => buy(p.id, "box")}
                        disabled={boxBuying}
                        style={{
                          flex: 1,
                          padding: "9px 10px",
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          background: boxBuying ? "#f2f2f2" : "white",
                          fontWeight: 900,
                          cursor: boxBuying ? "not-allowed" : "pointer",
                        }}
                      >
                        {boxBuying ? "Buying…" : "Buy Box(es)"}
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: 14,
                    borderTop: "1px solid #eee",
                    background: "#fcfcfc",
                    fontSize: 12,
                    color: "#555",
                  }}
                >
                  Images: use your own uploads (recommended). External sites may block hotlinking.
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** ---------------------------
 *  SINGLES TAB (new UI)
 *  ------------------------- */
function SinglesShopTab() {
  const [offers, setOffers] = useState<ShopOfferRow[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersErr, setOffersErr] = useState<string | null>(null);
  const [offersMsg, setOffersMsg] = useState<string | null>(null);

  const [requestCardId, setRequestCardId] = useState<string>("");
  const [requesting, setRequesting] = useState(false);

  const [sellQty, setSellQty] = useState<Record<number, number>>({});
  const [sellingOfferId, setSellingOfferId] = useState<number | null>(null);

  const [invRows, setInvRows] = useState<ShopInventoryRow[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [invErr, setInvErr] = useState<string | null>(null);

  const [invQ, setInvQ] = useState("");
  const [invPage, setInvPage] = useState(1);
  const [invTotalPages, setInvTotalPages] = useState(1);

  const [buyQty, setBuyQty] = useState<Record<number, number>>({});
  const [buyingCardId, setBuyingCardId] = useState<number | null>(null);

  async function loadOffers() {
    setOffersLoading(true);
    setOffersErr(null);
    setOffersMsg(null);
    try {
      const res = await fetch("/api/shop/singles/offers", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Failed to load offers (${res.status})`);
      setOffers(Array.isArray(j?.offers) ? (j.offers as ShopOfferRow[]) : []);
    } catch (e: any) {
      setOffersErr(e?.message ?? "Failed to load offers");
    } finally {
      setOffersLoading(false);
    }
  }

  async function loadInventory(page = invPage, q = invQ) {
    setInvLoading(true);
    setInvErr(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      params.set("page", String(page));
      params.set("pageSize", "30");

      const res = await fetch(`/api/shop/singles/inventory?${params.toString()}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Failed to load inventory (${res.status})`);

      setInvRows(Array.isArray(j?.rows) ? (j.rows as ShopInventoryRow[]) : []);
      setInvTotalPages(typeof j?.totalPages === "number" ? j.totalPages : 1);
      setInvPage(typeof j?.page === "number" ? j.page : page);
    } catch (e: any) {
      setInvErr(e?.message ?? "Failed to load shop inventory");
    } finally {
      setInvLoading(false);
    }
  }

  useEffect(() => {
    loadOffers();
    loadInventory(1, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestOffer() {
    const cardId = Number(requestCardId);
    if (!Number.isFinite(cardId) || cardId <= 0) {
      setOffersErr("Enter a valid Card ID.");
      return;
    }

    setRequesting(true);
    setOffersErr(null);
    setOffersMsg(null);

    try {
      const res = await fetch("/api/shop/singles/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Non-JSON from offers (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Offer request failed (${res.status})`);

      setOffersMsg(j?.reused ? "Offer already active for that card (reused)." : "Offer created.");
      setRequestCardId("");
      await loadOffers();
    } catch (e: any) {
      setOffersErr(e?.message ?? "Offer request failed");
    } finally {
      setRequesting(false);
    }
  }

  async function sellOffer(offerId: number) {
    const q = Math.max(1, Math.floor(sellQty[offerId] ?? 1));
    setSellingOfferId(offerId);
    setOffersErr(null);
    setOffersMsg(null);

    try {
      const res = await fetch("/api/shop/singles/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, quantity: q }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Non-JSON from sell (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Sell failed (${res.status})`);

      setOffersMsg(`Sold x${j.quantity} for $${centsToDollars(j.totalCents)} @ ${pctBpsToText(j.offerBps)}.`);
      window.dispatchEvent(new CustomEvent(ECONOMY_CHANGED_EVENT));
      await loadOffers();
      await loadInventory(invPage, invQ);
    } catch (e: any) {
      setOffersErr(e?.message ?? "Sell failed");
    } finally {
      setSellingOfferId(null);
    }
  }

  async function buySingle(cardId: number) {
    const q = Math.max(1, Math.floor(buyQty[cardId] ?? 1));
    setBuyingCardId(cardId);
    setInvErr(null);
    setOffersMsg(null);

    try {
      const res = await fetch("/api/shop/singles/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, quantity: q }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Non-JSON from buy single (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Buy failed (${res.status})`);

      setOffersMsg(`Bought x${j.quantity} for $${centsToDollars(j.totalCents)}.`);
      window.dispatchEvent(new CustomEvent(ECONOMY_CHANGED_EVENT));
      await loadInventory(invPage, invQ);
    } catch (e: any) {
      setInvErr(e?.message ?? "Buy failed");
    } finally {
      setBuyingCardId(null);
    }
  }

  const activeCount = offers.length;

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 6px" }}>Singles</h2>
      <div style={{ color: "#444", marginBottom: 12 }}>
        Sell cards to the shop via 24h offers (max <b>15 active offers</b>). Buy singles from shop inventory at{" "}
        <b>100% book</b>.
      </div>

      {offersErr ? (
        <div style={{ marginBottom: 12, padding: 12, background: "#fee", border: "1px solid #f99", borderRadius: 12 }}>
          {offersErr}
        </div>
      ) : null}

      {offersMsg ? (
        <div style={{ marginBottom: 12, padding: 12, background: "#efe", border: "1px solid #9f9", borderRadius: 12 }}>
          {offersMsg}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        {/* Request offer */}
        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12, background: "#fafafa" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Request an offer</div>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>
            Current active offers: <b>{activeCount}</b> / 15
          </div>

          {/* ✅ NEW: picker */}
          <YourCardsPicker
            onPick={(id) => {
              setRequestCardId(String(id));
              setOffersMsg(`Selected Card ID ${id}. Now click “Get Offer (24h)”.`);
              setOffersErr(null);
            }}
            disabled={requesting}
          />

          <div style={{ height: 10 }} />

          {/* Keep manual input as fallback */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={requestCardId}
              onChange={(e) => setRequestCardId(e.target.value)}
              placeholder="Card ID (auto-filled above, or type manually)"
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ccc", width: 320 }}
            />
            <button
              onClick={requestOffer}
              disabled={requesting}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: requesting ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: requesting ? "not-allowed" : "pointer",
              }}
            >
              {requesting ? "Requesting…" : "Get Offer (24h)"}
            </button>

            <button
              onClick={loadOffers}
              disabled={offersLoading}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: offersLoading ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: offersLoading ? "not-allowed" : "pointer",
              }}
            >
              {offersLoading ? "Loading…" : "Refresh Offers"}
            </button>
          </div>

          <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
            Tip: search your collection above (player/team/set), click “Use this card →”, then request the offer.
          </div>
        </div>

        {/* Active offers list */}
        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontWeight: 900 }}>Active Offers</div>
            <div style={{ fontSize: 12, color: "#666" }}>
              Offers expire automatically. Accepting any quantity closes the offer immediately.
            </div>
          </div>

          {offersLoading ? (
            <div style={{ marginTop: 10 }}>Loading offers…</div>
          ) : offers.length === 0 ? (
            <div style={{ marginTop: 10, padding: 12, background: "#fafafa", borderRadius: 12, border: "1px solid #eee" }}>
              No active offers. Request one above.
            </div>
          ) : (
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {offers.map((o) => {
                const img = safeImgSrc(o.card?.frontImageUrl ?? null);
                const exp = new Date(o.expiresAt);
                const now = new Date();
                const minsLeft = Math.max(0, Math.floor((exp.getTime() - now.getTime()) / 60000));
                const hoursLeft = Math.floor(minsLeft / 60);
                const remMins = minsLeft % 60;

                return (
                  <div
                    key={o.id}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 14,
                      padding: 12,
                      background: "#fcfcfc",
                      display: "grid",
                      gridTemplateColumns: "64px 1fr",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 12,
                        overflow: "hidden",
                        border: "1px solid #ddd",
                        background: "white",
                      }}
                    >
                      {img ? (
                        <img src={img} alt="Card" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontSize: 11, color: "#777" }}>
                          No image
                        </div>
                      )}
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 900 }}>{fmtOfferLine(o)}</div>
                        <div style={{ fontSize: 12, color: "#555" }}>
                          Offer: <b>{pctBpsToText(o.offerBps)}</b>{" "}
                          {o.card ? (
                            <>
                              • Book: <b>${Number(o.card.bookValue ?? 0).toFixed(2)}</b>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div style={{ fontSize: 12, color: "#666" }}>
                        Expires in <b>{hoursLeft}h {remMins}m</b> • Offer ID: {o.id} • Card ID: {o.cardId}
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          value={String(sellQty[o.id] ?? 1)}
                          onChange={(e) => setSellQty((prev) => ({ ...prev, [o.id]: Number(e.target.value) }))}
                          style={{ width: 80, padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
                        />
                        <button
                          onClick={() => sellOffer(o.id)}
                          disabled={sellingOfferId === o.id}
                          style={{
                            padding: "9px 10px",
                            borderRadius: 10,
                            border: "1px solid #ccc",
                            background: sellingOfferId === o.id ? "#f2f2f2" : "white",
                            fontWeight: 900,
                            cursor: sellingOfferId === o.id ? "not-allowed" : "pointer",
                          }}
                        >
                          {sellingOfferId === o.id ? "Selling…" : "Sell to Shop"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Shop inventory */}
        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Shop Inventory (Singles)</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={invQ}
              onChange={(e) => setInvQ(e.target.value)}
              placeholder="Search shop inventory (player, team, card #, subset)…"
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ccc", minWidth: 320 }}
            />
            <button
              onClick={() => loadInventory(1, invQ)}
              disabled={invLoading}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: invLoading ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: invLoading ? "not-allowed" : "pointer",
              }}
            >
              {invLoading ? "Searching…" : "Search"}
            </button>

            <div style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>
              Page <b>{invPage}</b> / {invTotalPages}
            </div>

            <button
              onClick={() => {
                const next = Math.max(1, invPage - 1);
                loadInventory(next, invQ);
              }}
              disabled={invLoading || invPage <= 1}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: invLoading || invPage <= 1 ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: invLoading || invPage <= 1 ? "not-allowed" : "pointer",
              }}
            >
              Prev
            </button>

            <button
              onClick={() => {
                const next = Math.min(invTotalPages, invPage + 1);
                loadInventory(next, invQ);
              }}
              disabled={invLoading || invPage >= invTotalPages}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: invLoading || invPage >= invTotalPages ? "#f2f2f2" : "white",
                fontWeight: 900,
                cursor: invLoading || invPage >= invTotalPages ? "not-allowed" : "pointer",
              }}
            >
              Next
            </button>
          </div>

          {invErr ? (
            <div style={{ marginTop: 12, padding: 12, background: "#fee", border: "1px solid #f99", borderRadius: 12 }}>
              {invErr}
            </div>
          ) : null}

          {invLoading ? (
            <div style={{ marginTop: 12 }}>Loading inventory…</div>
          ) : invRows.length === 0 ? (
            <div style={{ marginTop: 12, padding: 12, background: "#fafafa", borderRadius: 12, border: "1px solid #eee" }}>
              No shop inventory found.
            </div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {invRows.map((r) => {
                const img = safeImgSrc(r.card?.frontImageUrl ?? null);
                const priceCents = Math.round((Number(r.card.bookValue ?? 0) || 0) * 100);

                return (
                  <div
                    key={r.cardId}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 14,
                      padding: 12,
                      background: "#fcfcfc",
                      display: "grid",
                      gridTemplateColumns: "64px 1fr",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 12,
                        overflow: "hidden",
                        border: "1px solid #ddd",
                        background: "white",
                      }}
                    >
                      {img ? (
                        <img src={img} alt="Card" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontSize: 11, color: "#777" }}>
                          No image
                        </div>
                      )}
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 900 }}>
                          {r.card.player} {r.card.cardNumber ? `#${r.card.cardNumber}` : ""}{" "}
                          <span style={{ fontWeight: 600, color: "#666" }}>({r.quantity} in stock)</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#555" }}>
                          Price: <b>${centsToDollars(priceCents)}</b> • Card ID: {r.cardId}
                        </div>
                      </div>

                      <div style={{ fontSize: 12, color: "#666" }}>
                        {[r.card.team, r.card.subset, r.card.variant].filter(Boolean).join(" • ") || "—"}
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          value={String(buyQty[r.cardId] ?? 1)}
                          onChange={(e) => setBuyQty((prev) => ({ ...prev, [r.cardId]: Number(e.target.value) }))}
                          style={{ width: 80, padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
                        />
                        <button
                          onClick={() => buySingle(r.cardId)}
                          disabled={buyingCardId === r.cardId}
                          style={{
                            padding: "9px 10px",
                            borderRadius: 10,
                            border: "1px solid #ccc",
                            background: buyingCardId === r.cardId ? "#f2f2f2" : "white",
                            fontWeight: 900,
                            cursor: buyingCardId === r.cardId ? "not-allowed" : "pointer",
                          }}
                        >
                          {buyingCardId === r.cardId ? "Buying…" : "Buy"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** ---------------------------
 *  PAGE WITH TABS
 *  ------------------------- */
type ShopTab = "sealed" | "singles";

export default function ShopPage() {
  const [tab, setTab] = useState<ShopTab>("sealed");

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={() => setTab("sealed")} style={tabBtnStyle(tab === "sealed")}>
          Sealed (Packs/Boxes)
        </button>
        <button onClick={() => setTab("singles")} style={tabBtnStyle(tab === "singles")}>
          Singles
        </button>

        <div style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>
          Tip: Singles offers expire in 24 hours. Accepting closes the offer immediately.
        </div>
      </div>

      {tab === "sealed" ? <SealedShopTab /> : <SinglesShopTab />}
    </div>
  );
}