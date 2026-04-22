"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TierValue =
  | "COMMON"
  | "SEMI_STAR"
  | "UNLISTED_STAR"
  | "STAR_1"
  | "STAR_2"
  | "STAR_3"
  | "";

type PlayerTierRow = {
  id: number;
  sport: string | null;
  canonicalName: string;
  normalizedName: string;
  tier:
    | "COMMON"
    | "SEMI_STAR"
    | "UNLISTED_STAR"
    | "STAR_1"
    | "STAR_2"
    | "STAR_3"
    | null;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type SportsSummaryRow = {
  sport: string | null;
  count: number;
};

type PlayerTierResponse = {
  ok: boolean;
  rows: PlayerTierRow[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  sports?: SportsSummaryRow[];
  error?: string;
};

const TIER_OPTIONS: Array<{ value: TierValue; label: string }> = [
  { value: "", label: "Unassigned" },
  { value: "COMMON", label: "Common" },
  { value: "SEMI_STAR", label: "Semi-Star" },
  { value: "UNLISTED_STAR", label: "Unlisted Star" },
  { value: "STAR_1", label: "Star Tier 1" },
  { value: "STAR_2", label: "Star Tier 2" },
  { value: "STAR_3", label: "Star Tier 3" },
];

function prettyTier(tier: PlayerTierRow["tier"]) {
  switch (tier) {
    case "COMMON":
      return "Common";
    case "SEMI_STAR":
      return "Semi-Star";
    case "UNLISTED_STAR":
      return "Unlisted Star";
    case "STAR_1":
      return "Star Tier 1";
    case "STAR_2":
      return "Star Tier 2";
    case "STAR_3":
      return "Star Tier 3";
    default:
      return "Unassigned";
  }
}

function normalizeSport(v: string | null | undefined) {
  const s = (v ?? "").trim();
  return s || "Unknown";
}

type DraftRow = {
  canonicalName: string;
  sport: string;
  tier: TierValue;
  notes: string;
};

export default function PlayerTiersClient() {
  const [rows, setRows] = useState<PlayerTierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [sportFilter, setSportFilter] = useState("ALL");
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [sportsSummary, setSportsSummary] = useState<SportsSummaryRow[]>([]);

  const [drafts, setDrafts] = useState<Record<number, DraftRow>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  async function load(nextPage = page, nextPageSize = pageSize) {
    setLoading(true);
    setErr(null);
    setOkMsg(null);

    try {
      const qs = new URLSearchParams();
      if (query.trim()) qs.set("q", query.trim());
      if (sportFilter !== "ALL") qs.set("sport", sportFilter);
      if (onlyUnassigned) qs.set("onlyUnassigned", "true");
      qs.set("page", String(nextPage));
      qs.set("pageSize", String(nextPageSize));

      const res = await fetch(`/api/player-tiers?${qs.toString()}`, {
        cache: "no-store",
      });

      const raw = await res.text();
      let j: PlayerTierResponse | any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Player tiers returned non-JSON (${res.status})`);
      }

      if (!res.ok || !j?.ok) throw new Error(j?.error ?? `Failed to load (${res.status})`);

      const nextRows = Array.isArray(j?.rows) ? (j.rows as PlayerTierRow[]) : [];
      setRows(nextRows);

      const nextDrafts: Record<number, DraftRow> = {};
      for (const r of nextRows) {
        nextDrafts[r.id] = {
          canonicalName: r.canonicalName ?? "",
          sport: r.sport ?? "",
          tier: (r.tier ?? "") as TierValue,
          notes: r.notes ?? "",
        };
      }
      setDrafts(nextDrafts);

      setPage(j?.pagination?.page ?? nextPage);
      setPageSize(j?.pagination?.pageSize ?? nextPageSize);
      setTotal(j?.pagination?.total ?? 0);
      setTotalPages(j?.pagination?.totalPages ?? 1);
      setSportsSummary(Array.isArray(j?.sports) ? j.sports : []);
    } catch (e: any) {
      setRows([]);
      setDrafts({});
      setErr(e?.message ?? "Failed to load player repository");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sports = useMemo(() => {
    return sportsSummary.map((s) => normalizeSport(s.sport));
  }, [sportsSummary]);

  function patchDraft(id: number, patch: Partial<DraftRow>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        canonicalName: prev[id]?.canonicalName ?? "",
        sport: prev[id]?.sport ?? "",
        tier: prev[id]?.tier ?? "",
        notes: prev[id]?.notes ?? "",
        ...patch,
      },
    }));
  }

  async function saveRow(row: PlayerTierRow) {
    const d = drafts[row.id];
    if (!d) return;

    setSavingId(row.id);
    setErr(null);
    setOkMsg(null);

    try {
      const res = await fetch(`/api/player-tiers/${encodeURIComponent(String(row.id))}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonicalName: d.canonicalName,
          sport: d.sport.trim() || null,
          tier: d.tier || null,
          notes: d.notes.trim() || null,
        }),
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Save returned non-JSON (${res.status})`);
      }

      if (!res.ok || !j?.ok) throw new Error(j?.error ?? `Save failed (${res.status})`);

      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                canonicalName: j.row.canonicalName,
                normalizedName: j.row.normalizedName,
                sport: j.row.sport,
                tier: j.row.tier,
                notes: j.row.notes,
                updatedAt: j.row.updatedAt,
              }
            : r
        )
      );

      setDrafts((prev) => ({
        ...prev,
        [row.id]: {
          canonicalName: j.row.canonicalName ?? "",
          sport: j.row.sport ?? "",
          tier: (j.row.tier ?? "") as TierValue,
          notes: j.row.notes ?? "",
        },
      }));

      setOkMsg(`Saved ${j.row.canonicalName}`);
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  async function rebuildRepository() {
    setRebuilding(true);
    setErr(null);
    setOkMsg(null);

    try {
      const res = await fetch("/api/player-tiers/rebuild", {
        method: "POST",
      });

      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Rebuild returned non-JSON (${res.status})`);
      }

      if (!res.ok || !j?.ok) throw new Error(j?.error ?? `Rebuild failed (${res.status})`);

      setOkMsg(
        `Repository rebuilt. Scanned ${j?.summary?.scannedDistinctPlayers ?? 0} distinct players • inserted ${j?.summary?.insertedProfiles ?? 0} • unassigned ${j?.summary?.unassignedProfiles ?? 0}.`
      );

      await load(1, pageSize);
    } catch (e: any) {
      setErr(e?.message ?? "Rebuild failed");
    } finally {
      setRebuilding(false);
    }
  }

  function applyFilters() {
    load(1, pageSize);
  }

  function resetFilters() {
    setQuery("");
    setSportFilter("ALL");
    setOnlyUnassigned(true);
    load(1, pageSize);
  }

  function goPrev() {
    if (page <= 1) return;
    load(page - 1, pageSize);
  }

  function goNext() {
    if (page >= totalPages) return;
    load(page + 1, pageSize);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 32, marginBottom: 8 }}>Admin: Player Repository / Tiers</h1>
          <p style={{ marginTop: 0, maxWidth: 900 }}>
            Assign player tiers here. Product Set pricing tools use these tiers plus the Product Set’s tier default
            prices to fill or overwrite card book values.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/admin" style={{ textDecoration: "underline" }}>
              ← Back to Admin
            </Link>
            <Link href="/admin/product-sets" style={{ textDecoration: "underline" }}>
              Admin: Product Sets
            </Link>
          </div>
        </div>

        <button
          onClick={rebuildRepository}
          disabled={rebuilding || loading}
          style={{ padding: "10px 14px", fontWeight: 800 }}
        >
          {rebuilding ? "Rebuilding…" : "Refresh / Rebuild Repository"}
        </button>
      </div>

      <hr style={{ margin: "18px 0" }} />

      {err ? (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>{err}</div>
      ) : null}

      {okMsg ? (
        <div style={{ marginBottom: 12, padding: 10, background: "#efe", border: "1px solid #9f9" }}>{okMsg}</div>
      ) : null}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "end",
          border: "1px solid #ddd",
          background: "#fafafa",
          padding: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontWeight: 700 }}>Search</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Player name"
            style={{ padding: 8, width: 260 }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontWeight: 700 }}>Sport</label>
          <select
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
            style={{ padding: 8, width: 180 }}
          >
            <option value="ALL">All</option>
            {sports.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8 }}>
          <input
            type="checkbox"
            checked={onlyUnassigned}
            onChange={(e) => setOnlyUnassigned(e.target.checked)}
          />
          <span style={{ fontWeight: 700 }}>Unassigned only</span>
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontWeight: 700 }}>Rows / page</label>
          <select
            value={pageSize}
            onChange={(e) => {
              const next = Number(e.target.value);
              setPageSize(Number.isFinite(next) ? next : 100);
            }}
            style={{ padding: 8, width: 140 }}
          >
            {[50, 100, 200, 500].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <button onClick={applyFilters} disabled={loading || rebuilding} style={{ padding: "10px 12px", fontWeight: 800 }}>
          Apply Filters
        </button>

        <button
          onClick={resetFilters}
          disabled={loading || rebuilding}
          style={{ padding: "10px 12px" }}
        >
          Reset
        </button>

        <div style={{ marginLeft: "auto", fontSize: 13 }}>
          Showing page <b>{page}</b> of <b>{totalPages}</b> • total <b>{total}</b> players
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, color: "#555" }}>
          Loaded <b>{rows.length}</b> row{rows.length === 1 ? "" : "s"} on this page
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={goPrev} disabled={loading || rebuilding || page <= 1} style={{ padding: "8px 12px" }}>
            ← Prev
          </button>
          <button onClick={goNext} disabled={loading || rebuilding || page >= totalPages} style={{ padding: "8px 12px" }}>
            Next →
          </button>
        </div>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead style={{ background: "#f7f7f7" }}>
              <tr>
                {["ID", "Player", "Sport", "Tier", "Notes", "Normalized", "Actions"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: 8,
                      borderBottom: "1px solid #ddd",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, idx) => {
                const d = drafts[row.id];
                const saving = savingId === row.id;
                const zebra = idx % 2 === 0 ? "#fff" : "#fcfcfc";

                return (
                  <tr key={row.id} style={{ background: zebra }}>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee", width: 70 }}>{row.id}</td>

                    <td style={{ padding: 8, borderBottom: "1px solid #eee", minWidth: 240 }}>
                      <input
                        value={d?.canonicalName ?? row.canonicalName}
                        onChange={(e) => patchDraft(row.id, { canonicalName: e.target.value })}
                        style={{ width: "100%", padding: 6 }}
                      />
                    </td>

                    <td style={{ padding: 8, borderBottom: "1px solid #eee", minWidth: 140 }}>
                      <input
                        value={d?.sport ?? row.sport ?? ""}
                        onChange={(e) => patchDraft(row.id, { sport: e.target.value })}
                        placeholder="Unknown"
                        style={{ width: "100%", padding: 6 }}
                      />
                    </td>

                    <td style={{ padding: 8, borderBottom: "1px solid #eee", minWidth: 180 }}>
                      <select
                        value={d?.tier ?? (row.tier ?? "")}
                        onChange={(e) => patchDraft(row.id, { tier: e.target.value as TierValue })}
                        style={{ width: "100%", padding: 6 }}
                      >
                        {TIER_OPTIONS.map((opt) => (
                          <option key={opt.value || "UNASSIGNED"} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <div style={{ marginTop: 6, fontSize: 12, color: "#666", fontWeight: 700 }}>
                        Current: {prettyTier(row.tier)}
                      </div>
                    </td>

                    <td style={{ padding: 8, borderBottom: "1px solid #eee", minWidth: 220 }}>
                      <input
                        value={d?.notes ?? row.notes ?? ""}
                        onChange={(e) => patchDraft(row.id, { notes: e.target.value })}
                        placeholder="Optional notes"
                        style={{ width: "100%", padding: 6 }}
                      />
                    </td>

                    <td style={{ padding: 8, borderBottom: "1px solid #eee", minWidth: 220, fontSize: 12, color: "#666" }}>
                      {row.normalizedName}
                    </td>

                    <td style={{ padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => saveRow(row)}
                        disabled={saving || rebuilding || loading}
                        style={{ padding: "6px 10px", fontWeight: 800 }}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 12 }}>
                    No players match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          marginTop: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, color: "#555" }}>
          Showing page <b>{page}</b> of <b>{totalPages}</b>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={goPrev} disabled={loading || rebuilding || page <= 1} style={{ padding: "8px 12px" }}>
            ← Prev
          </button>
          <button onClick={goNext} disabled={loading || rebuilding || page >= totalPages} style={{ padding: "8px 12px" }}>
            Next →
          </button>
        </div>
      </div>
    </main>
  );
}