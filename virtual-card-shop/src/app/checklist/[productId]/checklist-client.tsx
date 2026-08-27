"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ProductSetOption = {
  id: string;
  isBase: boolean;
  name: string | null;
};

type UserOption = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

type OfferStatus =
  | { state: "AVAILABLE" }
  | { state: "ACTIVE"; offerId: number; expiresAt: string }
  | { state: "LOCKED"; lockedUntil: string };

type ChecklistRow = {
  cardId: number;
  cardNumber: string;
  player: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  isInsert: boolean;
  bookValue: number | null;

  ownedQty: number;
  myOwnedQty?: number;
  offerStatus?: OfferStatus;
};

type SortKey = "cardNumber" | "owned" | "qty" | "player" | "team" | "subset" | "variant" | "bookValue";
type SortDir = "asc" | "desc";

type ChecklistResponse = {
  ok: boolean;

  currentUserId: string;
  selectedUserId: string;
  isCompareMode: boolean;

  productId: string;

  productSetId: string;
  productSetIsBase: boolean;
  productSets: ProductSetOption[];

  totalCards: number;
  uniqueOwned: number;
  percentComplete: number;

  setTotalBookValue: number;
  setOwnedBookValue: number;
  setMissingBookValue: number;
  setOwnedValuePercent: number;
  mySetOwnedBookValue?: number | null;

  page: number;
  pageSize: number;
  totalPages: number;

  sortKey?: SortKey;
  sortDir?: SortDir;

  rows: ChecklistRow[];
};

function formatSetLabel(ps: ProductSetOption) {
  const base = ps.name?.trim() ? ps.name!.trim() : ps.id;
  return ps.isBase ? `Base — ${base}` : `Insert — ${base}`;
}

function formatUserLabel(u: UserOption) {
  const name = (u.name ?? "").trim();
  if (name) return name;
  return u.email ?? "Unknown user";
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function money(v: any) {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return `$${safe.toFixed(2)}`;
}

function sortIcon(active: boolean, dir: SortDir) {
  if (!active) return "";
  return dir === "asc" ? " ▲" : " ▼";
}
function friendlyTitle(raw: string | null | undefined) {
  const decoded = decodeURIComponent(String(raw ?? "").trim());
  return decoded
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function smallMeta(parts: Array<string | null | undefined>) {
  const clean = parts.map((p) => String(p ?? "").trim()).filter(Boolean);
  return clean.length ? clean.join(" • ") : "—";
}

function compactTimeUntil(iso: string | null | undefined) {
  if (!iso) return "soon";
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "soon";

  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= 24) return `${Math.ceil(hours / 24)}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

const ECONOMY_CHANGED_EVENT = "vcs:economy-changed";

export default function ChecklistClient({ productId }: { productId: string }) {
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ProductSet dropdown state
  const [selectedProductSetId, setSelectedProductSetId] = useState<string>("");

  // Compare dropdown state
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // Pagination state
  const [page, setPage] = useState<number>(1);
  const pageSize = 100;
  const [jumpTo, setJumpTo] = useState<string>("");

  // ✅ NEW: sort state (server-side)
  const [sortKey, setSortKey] = useState<SortKey>("cardNumber");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Users list for dropdown
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState<boolean>(false);

  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [auctioningCardId, setAuctioningCardId] = useState<number | null>(null);
  const [offeringCardId, setOfferingCardId] = useState<number | null>(null);

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const raw = await res.text();

      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Users returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      const list = (j?.users ?? []) as UserOption[];
      setUsers(list);
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }

  async function load(opts?: {
    productSetId?: string;
    selectedUserId?: string;
    page?: number;
    sortKey?: SortKey;
    sortDir?: SortDir;
  }) {
    setLoading(true);
    setErr(null);

    try {
      const qs = new URLSearchParams();

      const psid = (opts?.productSetId ?? selectedProductSetId).trim();
      if (psid) qs.set("productSetId", psid);

      const suid = (opts?.selectedUserId ?? selectedUserId).trim();
      if (suid) qs.set("selectedUserId", suid);

      const nextPage = opts?.page ?? page;
      qs.set("page", String(nextPage));
      qs.set("pageSize", String(pageSize));

      // ✅ NEW: sort params
      const sk = (opts?.sortKey ?? sortKey) as SortKey;
      const sd = (opts?.sortDir ?? sortDir) as SortDir;
      qs.set("sortKey", sk);
      qs.set("sortDir", sd);

      const url = `/api/checklist/${encodeURIComponent(productId)}` + (qs.toString() ? `?${qs.toString()}` : "");

      const res = await fetch(url, { cache: "no-store" });
      const raw = await res.text();

      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Checklist returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      const next = j as ChecklistResponse;
      setData(next);

      // keep dropdown default in sync
      if (!selectedProductSetId && next?.productSetId) {
        setSelectedProductSetId(next.productSetId);
      }

      // keep pagination in sync (API may clamp)
      if (typeof next?.page === "number") {
        setPage(next.page);
      }

      // keep sort in sync (API echoes it)
      if (next?.sortKey) setSortKey(next.sortKey);
      if (next?.sortDir) setSortDir(next.sortDir);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load checklist");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // reset to defaults when switching products
    setSelectedProductSetId("");
    setSelectedUserId("");
    setPage(1);
    setJumpTo("");
    setSortKey("cardNumber");
    setSortDir("asc");
    setActionErr(null);
    setActionMsg(null);
    load({ page: 1, sortKey: "cardNumber", sortDir: "asc" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function onChangeProductSet(nextId: string) {
    setSelectedProductSetId(nextId);
    setPage(1);
    setJumpTo("");
    setActionErr(null);
    setActionMsg(null);
    load({ productSetId: nextId, page: 1 });
  }

  function onChangeSelectedUser(nextId: string) {
    setSelectedUserId(nextId);
    setPage(1);
    setJumpTo("");
    setActionErr(null);
    setActionMsg(null);
    load({ selectedUserId: nextId, page: 1 });
  }

  const productSetsSorted = useMemo(() => {
    const arr = data?.productSets ?? [];
    return [...arr].sort((a, b) => Number(b.isBase) - Number(a.isBase));
  }, [data]);

  const compareMode = Boolean(data?.isCompareMode);

  const totalPages = data?.totalPages ?? 1;
  const canPrev = (data?.page ?? 1) > 1;
  const canNext = (data?.page ?? 1) < totalPages;

  function goPrev() {
    if (!canPrev) return;
    const next = (data?.page ?? 1) - 1;
    setPage(next);
    load({ page: next });
  }

  function goNext() {
    if (!canNext) return;
    const next = (data?.page ?? 1) + 1;
    setPage(next);
    load({ page: next });
  }

  function doJump() {
    const n = clampInt(parseInt(jumpTo || "1", 10) || 1, 1, totalPages);
    setPage(n);
    load({ page: n });
  }

  // ✅ NEW: header click handler (server-side sort)
  function onSort(nextKey: SortKey) {
    const isSame = nextKey === sortKey;

    let nextDir: SortDir;
    if (isSame) {
      nextDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      // sensible defaults
      if (nextKey === "owned" || nextKey === "qty" || nextKey === "bookValue") nextDir = "desc";
      else nextDir = "asc";
    }

    setSortKey(nextKey);
    setSortDir(nextDir);
    setPage(1);
    setJumpTo("");

    load({ sortKey: nextKey, sortDir: nextDir, page: 1 });
  }

  async function requestOfferForCard(cardId: number) {
    if (compareMode) {
      setActionErr("Switch Viewing to Me to request shop offers.");
      setActionMsg(null);
      return;
    }

    if (!Number.isFinite(cardId) || cardId <= 0) {
      setActionErr("Invalid cardId.");
      setActionMsg(null);
      return;
    }

    setOfferingCardId(cardId);
    setActionErr(null);
    setActionMsg(null);

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
        throw new Error(`Non-JSON from shop offer (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Offer request failed (${res.status})`);

      setActionMsg(j?.reused ? "Shop offer already active." : "Shop offer created. Open the Shop Singles tab to accept or reject it.");
      window.dispatchEvent(new CustomEvent(ECONOMY_CHANGED_EVENT));
      load();
    } catch (e: any) {
      setActionErr(e?.message ?? "Offer request failed");
    } finally {
      setOfferingCardId(null);
    }
  }

  async function createAuctionForCard(cardId: number) {
    if (compareMode) {
      setActionErr("Switch Viewing to Me to create auctions.");
      setActionMsg(null);
      return;
    }

    if (!Number.isFinite(cardId) || cardId <= 0) {
      setActionErr("Invalid cardId.");
      setActionMsg(null);
      return;
    }

    setAuctioningCardId(cardId);
    setActionErr(null);
    setActionMsg(null);

    try {
      const res = await fetch("/api/auctions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, grade: 0 }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Non-JSON from auction create (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Auction create failed (${res.status})`);

      setActionMsg("Auction created. One raw copy is now locked until the auction is collected or ends.");
      load();
    } catch (e: any) {
      setActionErr(e?.message ?? "Auction create failed");
    } finally {
      setAuctioningCardId(null);
    }
  }

  const rows = data?.rows ?? [];

  const thClickable: React.CSSProperties = {
    textAlign: "left",
    padding: 8,
    borderBottom: "1px solid #ddd",
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
  };

  const thPlain: React.CSSProperties = {
    textAlign: "left",
    padding: 8,
    borderBottom: "1px solid #ddd",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ padding: 16, maxWidth: 1280, margin: "0 auto" }}>
      <style jsx>{`
        .checklistActions {
          display: flex;
          gap: 6px;
          align-items: center;
          flex-wrap: nowrap;
          white-space: nowrap;
        }

        @media (max-width: 760px) {
          .checklistDesktopOptional {
            display: none;
          }

          .checklistActions {
            gap: 4px;
          }
        }
      `}</style>

      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Link href={`/collection/${encodeURIComponent(productId)}`} className="vcs-back-link">
          ← Back to Set
        </Link>

        <div style={{ fontWeight: 950, fontSize: 22 }}>{friendlyTitle(productId)}</div>

        <button onClick={() => load()} className="vcs-button vcs-button-soft vcs-button-compact">
          Refresh
        </button>

        <Link href="/collection" className="vcs-button vcs-button-secondary vcs-button-compact">
          Collection →
        </Link>
      </div>

      <hr style={{ margin: "14px 0" }} />

      {/* Controls row */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        {/* User dropdown */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontWeight: 900 }}>Viewing:</div>
          <select
            value={selectedUserId}
            onChange={(e) => onChangeSelectedUser(e.target.value)}
            style={{
              padding: "8px 10px",
              border: "1px solid #ddd",
              borderRadius: 10,
              minWidth: 220,
              fontWeight: 800,
            }}
          >
            <option value="">Me</option>
            {usersLoading
              ? null
              : users
                  .filter((u) => u.id !== data?.currentUserId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {formatUserLabel(u)}
                    </option>
                  ))}
          </select>
        </div>

        {/* ProductSet dropdown */}
        {data?.productSets?.length ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ fontWeight: 900 }}>Set:</div>
            <select
              value={selectedProductSetId}
              onChange={(e) => onChangeProductSet(e.target.value)}
              style={{
                padding: "8px 10px",
                border: "1px solid #ddd",
                borderRadius: 10,
                minWidth: 280,
                fontWeight: 800,
              }}
            >
              {productSetsSorted.map((ps) => (
                <option key={ps.id} value={ps.id}>
                  {formatSetLabel(ps)}
                </option>
              ))}
            </select>

            <div style={{ color: "#666", fontWeight: 700 }}>{data.productSetIsBase ? "Base set completion" : "Insert set completion"}</div>
          </div>
        ) : null}

        {/* Pagination controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
          <button onClick={goPrev} disabled={!canPrev || loading} style={{ padding: "6px 10px", opacity: !canPrev || loading ? 0.5 : 1 }}>
            ← Prev
          </button>

          <div style={{ fontWeight: 900, whiteSpace: "nowrap" }}>
            Page {data?.page ?? 1} of {totalPages}
          </div>

          <button onClick={goNext} disabled={!canNext || loading} style={{ padding: "6px 10px", opacity: !canNext || loading ? 0.5 : 1 }}>
            Next →
          </button>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              value={jumpTo}
              onChange={(e) => setJumpTo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doJump();
              }}
              placeholder="Jump"
              inputMode="numeric"
              style={{
                width: 80,
                padding: "6px 8px",
                border: "1px solid #ddd",
                borderRadius: 10,
                fontWeight: 800,
              }}
            />
            <button onClick={doJump} disabled={loading} style={{ padding: "6px 10px" }}>
              Go
            </button>
          </div>
        </div>
      </div>

      {compareMode ? (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            border: "1px solid #d9e6ff",
            background: "#f5f9ff",
            borderRadius: 12,
            fontWeight: 800,
          }}
        >
          Primary checks show <span style={{ fontWeight: 900 }}>their</span> collection.
          <span style={{ marginLeft: 10 }}>
            Small dot in <span style={{ fontWeight: 900 }}>Me</span> column means <span style={{ fontWeight: 900 }}>you</span> own it.
          </span>
          <span style={{ marginLeft: 10, color: "#444" }}>
            (Shop offers are disabled in compare mode.)
          </span>
        </div>
      ) : null}

      {actionErr ? (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99", borderRadius: 12 }}>
          {actionErr}
        </div>
      ) : null}

      {actionMsg ? (
        <div style={{ marginBottom: 12, padding: 10, background: "#efe", border: "1px solid #9f9", borderRadius: 12 }}>
          {actionMsg}{" "}
          <Link href="/shop" style={{ textDecoration: "underline", fontWeight: 900 }}>
            Open Shop →
          </Link>
        </div>
      ) : null}

      {err && <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>{err}</div>}

      {loading ? (
        <div>Loading…</div>
      ) : !data ? (
        <div>No data.</div>
      ) : (
        <>
          <div
            style={{
              marginBottom: 14,
              padding: 14,
              border: "1px solid #e5e7eb",
              background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
              borderRadius: 16,
              boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 950, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
              Checklist progress
            </div>
            <div style={{ fontWeight: 950, fontSize: 24, marginBottom: 10 }}>
              {data.percentComplete.toFixed(1)}% Complete <span style={{ color: "#64748b", fontSize: 16 }}>({data.uniqueOwned}/{data.totalCards} unique)</span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 10,
                fontWeight: 800,
              }}
            >
            <div>
              Set Value: <span style={{ fontWeight: 900 }}>{money(data.setTotalBookValue)}</span>
            </div>
            <div>
              Owned Value: <span style={{ fontWeight: 900 }}>{money(data.setOwnedBookValue)}</span>
            </div>
            <div>
              Missing Value: <span style={{ fontWeight: 900 }}>{money(data.setMissingBookValue)}</span>
            </div>
            <div>
              Value Complete: <span style={{ fontWeight: 900 }}>{(data.setOwnedValuePercent ?? 0).toFixed(1)}%</span>
            </div>

            {compareMode && data.mySetOwnedBookValue != null ? (
              <div>
                My Owned Value: <span style={{ fontWeight: 900 }}>{money(data.mySetOwnedBookValue)}</span>
              </div>
            ) : null}
            </div>
          </div>

          {rows.length === 0 && (
            <div style={{ padding: 10, border: "1px solid #ddd", background: "#fffdf2" }}>
              Checklist loaded but returned 0 rows. This usually means the product set has no cards.
            </div>
          )}

          <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 16, boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)", background: "white" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f8fafc", zIndex: 1 }}>
                <tr>
                  <th style={thClickable} onClick={() => onSort("owned")} title="Sort by Owned (whole set, then paged)">
                    Owned{sortIcon(sortKey === "owned", sortDir)}
                  </th>

                  {compareMode ? (
                    <th style={thPlain} title="You own this card">
                      Me
                    </th>
                  ) : null}

                  <th style={thClickable} onClick={() => onSort("cardNumber")} title="Sort by Card Number">
                    #{sortIcon(sortKey === "cardNumber", sortDir)}
                  </th>

                  <th style={thClickable} onClick={() => onSort("player")} title="Sort by Player">
                    Player{sortIcon(sortKey === "player", sortDir)}
                  </th>

                  <th style={thClickable} onClick={() => onSort("team")} title="Sort by Team">
                    Team{sortIcon(sortKey === "team", sortDir)}
                  </th>

                  <th style={thClickable} onClick={() => onSort("subset")} title="Sort by Subset">
                    Subset{sortIcon(sortKey === "subset", sortDir)}
                  </th>

                  <th style={thClickable} onClick={() => onSort("variant")} title="Sort by Variant">
                    Variant{sortIcon(sortKey === "variant", sortDir)}
                  </th>

                  <th style={thPlain}>Type</th>

                  <th style={thClickable} onClick={() => onSort("bookValue")} title="Sort by Value">
                    Value{sortIcon(sortKey === "bookValue", sortDir)}
                  </th>

                  <th style={thClickable} onClick={() => onSort("qty")} title="Sort by Qty (whole set, then paged)">
                    Qty{sortIcon(sortKey === "qty", sortDir)}
                  </th>

                  <th style={thPlain}>Details</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r, idx) => {
                  const owned = (r.ownedQty ?? 0) > 0;
                  const myOwned = (r.myOwnedQty ?? 0) > 0;

                  return (
                    <tr key={r.cardId} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>{owned ? "✅" : "⬜"}</td>

                      {compareMode ? (
                        <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                          {myOwned ? (
                            <span
                              title="You own this"
                              style={{
                                display: "inline-block",
                                width: 10,
                                height: 10,
                                borderRadius: 999,
                                background: "#2b6cb0",
                              }}
                            />
                          ) : (
                            <span style={{ display: "inline-block", width: 10, height: 10 }} />
                          )}
                        </td>
                      ) : null}

                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>{r.cardNumber}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.player}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.team ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.subset ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.variant ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.isInsert ? "Insert" : "Base"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900, whiteSpace: "nowrap" }}>{money(r.bookValue)}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>{r.ownedQty ?? 0}</td>

                      <td style={{ padding: 6, borderBottom: "1px solid #eee" }}>
                        <div className="checklistActions">
                          <Link
                            href={`/cards/${encodeURIComponent(String(r.cardId))}`}
                            className="vcs-button vcs-button-soft vcs-button-compact"
                          >
                            Details
                          </Link>

                          {!compareMode && owned ? (() => {
                            const status = r.offerStatus ?? { state: "AVAILABLE" as const };
                            const isActive = status.state === "ACTIVE";
                            const isLocked = status.state === "LOCKED";
                            const disabledOffer = offeringCardId === r.cardId || isActive || isLocked;
                            const label =
                              offeringCardId === r.cardId
                                ? "Offering…"
                                : isActive
                                  ? "Offer Active"
                                  : isLocked
                                    ? `Offer ${compactTimeUntil(status.lockedUntil)}`
                                    : "Offer";

                            return (
                              <button
                                onClick={() => requestOfferForCard(r.cardId)}
                                disabled={disabledOffer}
                                title={
                                  isActive
                                    ? "An active shop offer already exists for this card."
                                    : isLocked
                                      ? `Shop offer available in ${compactTimeUntil(status.lockedUntil)}.`
                                      : "Request a 24-hour shop offer for this card."
                                }
                                className="vcs-button vcs-button-secondary vcs-button-compact"
                                style={{
                                  minWidth: 62,
                                  opacity: disabledOffer ? 0.58 : 1,
                                  background: disabledOffer ? "#f3f4f6" : undefined,
                                  cursor: disabledOffer ? "not-allowed" : "pointer",
                                }}
                              >
                                {label}
                              </button>
                            );
                          })() : null}

                          {!compareMode && owned ? (
                            <button
                              onClick={() => createAuctionForCard(r.cardId)}
                              disabled={auctioningCardId === r.cardId}
                              title="Create a 24-hour auction for one raw copy of this card."
                              className="vcs-button vcs-button-secondary vcs-button-compact"
                              style={{
                                opacity: auctioningCardId === r.cardId ? 0.55 : 1,
                                cursor: auctioningCardId === r.cardId ? "not-allowed" : "pointer",
                              }}
                            >
                              {auctioningCardId === r.cardId ? "Creating…" : "Auction"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}