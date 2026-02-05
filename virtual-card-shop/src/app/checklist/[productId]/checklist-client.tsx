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

  // Selected user's qty (i.e., whose collection we're viewing)
  ownedQty: number;

  // Only present when comparing another user (selectedUserId !== me)
  myOwnedQty?: number;
};

type ChecklistResponse = {
  ok: boolean;

  // identity + mode (from API)
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

  // ✅ NEW: set value totals (whole productSet)
  setTotalBookValue: number;
  setOwnedBookValue: number;
  setMissingBookValue: number;
  setOwnedValuePercent: number;
  mySetOwnedBookValue?: number | null;

  // pagination
  page: number;
  pageSize: number;
  totalPages: number;

  rows: ChecklistRow[];
};

// --- Card number-aware sorting (ignores any prefix)
function parseCardNo(raw: string | null | undefined) {
  const s = (raw ?? "").trim();
  const lower = s.toLowerCase();

  const m = lower.match(/(\d+)/);

  if (!m || m.index == null) {
    return {
      hasNum: false,
      n: Number.POSITIVE_INFINITY,
      suf: lower,
      raw: lower,
    };
  }

  const numStr = m[1];
  const n = parseInt(numStr, 10);

  const end = (m.index ?? 0) + numStr.length;
  const suffixRaw = lower.slice(end);

  const suf = suffixRaw.replace(/[^a-z0-9]+/g, "");

  return {
    hasNum: Number.isFinite(n),
    n: Number.isFinite(n) ? n : Number.POSITIVE_INFINITY,
    suf,
    raw: lower,
  };
}

function cardNoCompare(aNo: string, bNo: string) {
  const a = parseCardNo(aNo);
  const b = parseCardNo(bNo);

  if (a.n !== b.n) return a.n - b.n;
  if (a.suf !== b.suf) return a.suf.localeCompare(b.suf);
  return a.raw.localeCompare(b.raw);
}

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

export default function ChecklistClient({ productId }: { productId: string }) {
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ProductSet dropdown state
  const [selectedProductSetId, setSelectedProductSetId] = useState<string>("");

  // Compare dropdown state (selected user)
  // Empty string means "Me" (we omit selectedUserId from query)
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // Pagination state
  const [page, setPage] = useState<number>(1);
  const pageSize = 100; // lock to 100 for now
  const [jumpTo, setJumpTo] = useState<string>("");

  // Users list for dropdown
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState<boolean>(false);

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

  async function load(opts?: { productSetId?: string; selectedUserId?: string; page?: number }) {
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

      const url =
        `/api/checklist/${encodeURIComponent(productId)}` +
        (qs.toString() ? `?${qs.toString()}` : "");

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

      if (!selectedProductSetId && next?.productSetId) {
        setSelectedProductSetId(next.productSetId);
      }

      if (typeof next?.page === "number") {
        setPage(next.page);
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load checklist");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    load({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function onChangeProductSet(nextId: string) {
    setSelectedProductSetId(nextId);
    setPage(1);
    setJumpTo("");
    load({ productSetId: nextId, page: 1 });
  }

  function onChangeSelectedUser(nextId: string) {
    setSelectedUserId(nextId);
    setPage(1);
    setJumpTo("");
    load({ selectedUserId: nextId, page: 1 });
  }

  const sorted = useMemo(() => {
    const rows = data?.rows ?? [];
    return [...rows].sort((a, b) => cardNoCompare(a.cardNumber, b.cardNumber));
  }, [data]);

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

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Link
          href={`/collection/${encodeURIComponent(productId)}`}
          style={{ textDecoration: "underline", fontWeight: 800 }}
        >
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
        {/* User dropdown (compare mode) */}
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

            <div style={{ color: "#666", fontWeight: 700 }}>
              {data.productSetIsBase ? "Base set completion" : "Insert set completion"}
            </div>
          </div>
        ) : null}

        {/* Pagination controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
          <button
            onClick={goPrev}
            disabled={!canPrev || loading}
            style={{ padding: "6px 10px", opacity: !canPrev || loading ? 0.5 : 1 }}
          >
            ← Prev
          </button>

          <div style={{ fontWeight: 900, whiteSpace: "nowrap" }}>
            Page {data?.page ?? 1} of {totalPages}
          </div>

          <button
            onClick={goNext}
            disabled={!canNext || loading}
            style={{ padding: "6px 10px", opacity: !canNext || loading ? 0.5 : 1 }}
          >
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
            Small dot in <span style={{ fontWeight: 900 }}>Me</span> column means{" "}
            <span style={{ fontWeight: 900 }}>you</span> own it.
          </span>
        </div>
      ) : null}

      {err && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {err}
        </div>
      )}

      {loading ? (
        <div>Loading…</div>
      ) : !data ? (
        <div>No data.</div>
      ) : (
        <>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>
            Complete: {data.percentComplete.toFixed(1)}% ({data.uniqueOwned}/{data.totalCards} unique)
          </div>

          {/* ✅ NEW: value summary */}
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
              Value Complete:{" "}
              <span style={{ fontWeight: 900 }}>{(data.setOwnedValuePercent ?? 0).toFixed(1)}%</span>
            </div>

            {compareMode && data.mySetOwnedBookValue != null ? (
              <div>
                My Owned Value:{" "}
                <span style={{ fontWeight: 900 }}>{money(data.mySetOwnedBookValue)}</span>
              </div>
            ) : null}
          </div>

          {sorted.length === 0 && (
            <div style={{ padding: 10, border: "1px solid #ddd", background: "#fffdf2" }}>
              Checklist loaded but returned 0 rows. This usually means the product set has no cards.
            </div>
          )}

          <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
                <tr>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}>
                    Owned
                  </th>

                  {compareMode ? (
                    <th
                      style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}
                      title="You own this card"
                    >
                      Me
                    </th>
                  ) : null}

                  {["#", "Player", "Team", "Subset", "Variant", "Type", "Qty", "Details"].map((h) => (
                    <th
                      key={h}
                      style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {sorted.map((r, idx) => {
                  const owned = (r.ownedQty ?? 0) > 0;
                  const myOwned = (r.myOwnedQty ?? 0) > 0;

                  return (
                    <tr key={r.cardId} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {owned ? "✅" : "⬜"}
                      </td>

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

                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {r.cardNumber}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.player}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.team ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.subset ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.variant ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                        {r.isInsert ? "Insert" : "Base"}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 800 }}>
                        {r.ownedQty ?? 0}
                      </td>

                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                        <Link
                          href={`/cards/${encodeURIComponent(String(r.cardId))}`}
                          style={{ textDecoration: "underline", fontWeight: 900 }}
                        >
                          Details
                        </Link>
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
