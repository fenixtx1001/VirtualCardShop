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
  email: string;
  image: string | null;
};

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
};

type SortKey = "cardNumber" | "owned" | "qty" | "player" | "team" | "subset" | "variant";
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
  return u.email;
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

  // ✅ NEW: per-row offer request UI state
  const [offerMsg, setOfferMsg] = useState<string | null>(null);
  const [offerErr, setOfferErr] = useState<string | null>(null);
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
    setOfferErr(null);
    setOfferMsg(null);
    load({ page: 1, sortKey: "cardNumber", sortDir: "asc" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function onChangeProductSet(nextId: string) {
    setSelectedProductSetId(nextId);
    setPage(1);
    setJumpTo("");
    setOfferErr(null);
    setOfferMsg(null);
    load({ productSetId: nextId, page: 1 });
  }

  function onChangeSelectedUser(nextId: string) {
    setSelectedUserId(nextId);
    setPage(1);
    setJumpTo("");
    setOfferErr(null);
    setOfferMsg(null);
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
      if (nextKey === "owned" || nextKey === "qty") nextDir = "desc";
      else nextDir = "asc";
    }

    setSortKey(nextKey);
    setSortDir(nextDir);
    setPage(1);
    setJumpTo("");

    load({ sortKey: nextKey, sortDir: nextDir, page: 1 });
  }

  // ✅ NEW: request offer directly from checklist row
  async function requestOfferForCard(cardId: number) {
    if (compareMode) {
      setOfferErr("Switch Viewing to Me to request shop offers.");
      setOfferMsg(null);
      return;
    }

    setOfferingCardId(cardId);
    setOfferErr(null);
    setOfferMsg(null);

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
        throw new Error(`Non-JSON from offer (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Offer request failed (${res.status})`);

      const reused = Boolean(j?.reused);
      setOfferMsg(reused ? "Offer already active for that card (reused)." : "Offer created (24h).");
    } catch (e: any) {
      setOfferErr(e?.message ?? "Offer request failed");
    } finally {
      setOfferingCardId(null);
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

  const actionBtnStyle: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid #ccc",
    background: "white",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Link href={`/collection/${encodeURIComponent(productId)}`} style={{ textDecoration: "underline", fontWeight: 800 }}>
          ← Back to Set
        </Link>

        <div style={{ fontWeight: 900, fontSize: 22 }}>Checklist: {productId}</div>

        <button onClick={() => load()} style={{ padding: "6px 10px" }}>
          Refresh
        </button>

        <Link href="/collection" style={{ textDecoration: "underline", fontWeight: 800 }}>
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

      {offerErr ? (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99", borderRadius: 12 }}>
          {offerErr}
        </div>
      ) : null}

      {offerMsg ? (
        <div style={{ marginBottom: 12, padding: 10, background: "#efe", border: "1px solid #9f9", borderRadius: 12 }}>
          {offerMsg}{" "}
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
          <div style={{ fontWeight: 900, marginBottom: 8 }}>
            Complete: {data.percentComplete.toFixed(1)}% ({data.uniqueOwned}/{data.totalCards} unique)
          </div>

          {/* Value summary */}
          <div
            style={{
              marginBottom: 12,
              padding: 10,
              border: "1px solid #eee",
              background: "#fafafa",
              borderRadius: 12,
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              alignItems: "center",
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

          {rows.length === 0 && (
            <div style={{ padding: 10, border: "1px solid #ddd", background: "#fffdf2" }}>
              Checklist loaded but returned 0 rows. This usually means the product set has no cards.
            </div>
          )}

          <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
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
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 800 }}>{r.ownedQty ?? 0}</td>

                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <Link href={`/cards/${encodeURIComponent(String(r.cardId))}`} style={{ textDecoration: "underline", fontWeight: 900 }}>
                            Details
                          </Link>

                          <button
                            onClick={() => requestOfferForCard(r.cardId)}
                            disabled={compareMode || offeringCardId === r.cardId}
                            title={compareMode ? "Switch Viewing to Me to request offers." : "Request a 24h shop offer for this card."}
                            style={{
                              ...actionBtnStyle,
                              opacity: compareMode || offeringCardId === r.cardId ? 0.55 : 1,
                              cursor: compareMode || offeringCardId === r.cardId ? "not-allowed" : "pointer",
                            }}
                          >
                            {offeringCardId === r.cardId ? "Requesting…" : "Get Offer (24h)"}
                          </button>
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