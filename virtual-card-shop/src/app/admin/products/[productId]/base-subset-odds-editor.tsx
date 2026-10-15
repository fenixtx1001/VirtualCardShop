"use client";

import { useEffect, useMemo, useState } from "react";

type Subset = { subset: string | null; count: number };
type BaseOddsData = {
  ok: boolean;
  productId: string;
  released: boolean;
  baseSetId: string | null;
  baseSetName: string;
  subsets: Subset[];
  configEnabled: boolean;
  fallbackSubset: string | null;
  oddsBySubset: Record<string, number>;
  otherHitGroups: number;
  canConfigure: boolean;
  reason: string | null;
};
const sectionStyle: React.CSSProperties = {
  marginTop: 24,
  padding: "18px 20px",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  background: "#f8fafc",
  color: "#0f172a",
  maxWidth: 880,
};
const inputStyle: React.CSSProperties = {
  width: 102,
  maxWidth: "100%",
  padding: "9px 10px",
  background: "#fff",
  color: "#0f172a",
  border: "1px solid #94a3b8",
  borderRadius: 8,
  fontSize: 14,
};
const buttonStyle: React.CSSProperties = {
  padding: "10px 16px",
  border: "1px solid #334155",
  background: "#172033",
  color: "#fff",
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
};

function parseOdds(input: string): number | null {
  const raw = input.trim();
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const odds = Number(raw);
  return Number.isSafeInteger(odds) && odds <= 1_000_000 ? odds : null;
}

export default function BaseSubsetOddsEditor({ productId }: { productId: string }) {
  const [data, setData] = useState<BaseOddsData | null>(null);
  const [common, setCommon] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function hydrate(snapshot: BaseOddsData) {
    setData(snapshot);
    setCommon(snapshot.fallbackSubset ?? snapshot.subsets[0]?.subset ?? "");
    setValues(Object.fromEntries(
      snapshot.subsets.map(row => [
        row.subset ?? "",
        snapshot.oddsBySubset[row.subset ?? ""]?.toString() ?? "",
      ])
    ));
  }

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setMessage("");
    fetch("/api/admin/products/" + encodeURIComponent(productId) + "/base-subset-odds", {
      cache: "no-store",
      signal: controller.signal,
    }).then(async response => {
      const result = await response.json() as BaseOddsData & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to load Base subset odds");
      if (live) hydrate(result);
    }).catch(err => {
      if (live && !controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Unable to load Base subset odds");
      }
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; controller.abort(); };
  }, [productId]);

  const remaining = useMemo(
    () => (data?.subsets ?? []).filter(row => row.subset !== common),
    [data, common]
  );
  const totalCards = (data?.subsets ?? []).reduce((sum, row) => sum + row.count, 0);
  const invalid = !data?.canConfigure || remaining.some(
    row => parseOdds(values[row.subset ?? ""] ?? "") === null
  );

  async function submit(mode: "save" | "reset") {
    if (!data?.baseSetId) return;
    if (mode === "save" && invalid) {
      setError("Choose a common pool and enter valid 1-in-N odds for every other Base subset.");
      return;
    }
    if (mode === "reset" &&
        !window.confirm("Restore ordinary equal Base odds for this product?")) {
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const oddsBySubset: Record<string, number> = {};
      for (const row of remaining) {
        oddsBySubset[row.subset!] = parseOdds(values[row.subset!] ?? "")!;
      }
      const response = await fetch(
        "/api/admin/products/" + encodeURIComponent(productId) + "/base-subset-odds",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "reset" ? { mode } : {
              mode: "save",
              baseSetId: data.baseSetId,
              fallbackSubset: common,
              oddsBySubset,
            }
          ),
        }
      );
      const result = await response.json() as BaseOddsData & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save Base subset odds");
      hydrate(result);
      setMessage(mode === "reset"
        ? "Uniform Base odds restored."
        : "Base subset odds saved. Future pack draws use the updated rates.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save Base odds");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={sectionStyle} aria-label="Base subset odds">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 19, lineHeight: 1.25, margin: 0, fontWeight: 800 }}>
            Base Subset Odds
          </h2>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "#475569", margin: "6px 0 0" }}>
            Optional pack rarity within one complete Base checklist. Completion and prestige do not change.
          </p>
        </div>
        <span style={{
          color: "#334155", background: "#e2e8f0",
          borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 700,
        }}>
          {loading ? "Loading" : data?.configEnabled ? "Custom odds configured" : "Standard Base odds"}
        </span>
      </div>

      {loading && <p style={{ fontSize: 14 }}>Loading Base subsets…</p>}
      {error && <p role="alert" style={{
        fontSize: 13, marginTop: 12, padding: 10,
        background: "#fef2f2", border: "1px solid #fca5a5",
        borderRadius: 8, color: "#991b1b",
      }}>{error}</p>}
      {message && <p role="status" style={{
        fontSize: 13, marginTop: 12, padding: 10,
        background: "#ecfdf5", border: "1px solid #6ee7b7",
        borderRadius: 8, color: "#065f46",
      }}>{message}</p>}

      {!loading && data && <>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap",
          gap: 6, margin: "16px 0 10px", fontSize: 13, color: "#475569" }}>
          <span><strong>{data.baseSetName}</strong> · {totalCards.toLocaleString()} cards</span>
          <span>{data.subsets.length} {data.subsets.length === 1 ? "subset" : "subsets"}</span>
        </div>

        {data.canConfigure ? (
          <>
            <div style={{
              border: "1px solid #cbd5e1", background: "#fff",
              borderRadius: 10, overflowX: "auto",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 430, fontSize: 14 }}>
                <thead style={{ background: "#f1f5f9", color: "#334155" }}>
                  <tr>
                    <th style={{ padding: "11px 12px", textAlign: "left" }}>Base subset</th>
                    <th style={{ padding: "11px 12px", textAlign: "right" }}>Cards</th>
                    <th style={{ padding: "11px 12px", textAlign: "left" }}>Pull frequency</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subsets.map((row, index) => {
                    const subset = row.subset!;
                    const isCommon = subset === common;
                    return (
                      <tr key={subset} style={{ borderTop: index ? "1px solid #e2e8f0" : undefined }}>
                        <td style={{ padding: "9px 12px" }}>
                          <div style={{ fontWeight: 650 }}>{subset}</div>
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "#475569" }}>
                          {row.count.toLocaleString()}
                        </td>
                        <td style={{ padding: "9px 12px" }}>
                          {isCommon ? (
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>
                              Common pool · fills remaining slots
                            </span>
                          ) : (
                            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: "#64748b" }}>1 in</span>
                              <input
                                type="number" min="1" max="1000000" step="1"
                                inputMode="numeric"
                                aria-label={subset + " odds per pack"}
                                value={values[subset] ?? ""}
                                placeholder="e.g. 24"
                                onChange={e => setValues(prev => ({ ...prev, [subset]: e.target.value }))}
                                disabled={saving}
                                style={inputStyle}
                              />
                              <span style={{ fontSize: 12, color: "#64748b" }}>packs</span>
                            </label>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
              <label htmlFor="base-common-pool" style={{ fontWeight: 650, fontSize: 13 }}>
                Common subset
              </label>
              <select
                id="base-common-pool"
                value={common}
                disabled={saving}
                onChange={e => setCommon(e.target.value)}
                style={{ ...inputStyle, width: "auto", minWidth: 144 }}
              >
                {data.subsets.map(row => (
                  <option key={row.subset!} value={row.subset!}>{row.subset}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={saving || invalid}
                onClick={() => void submit("save")}
                style={{ ...buttonStyle, opacity: saving || invalid ? 0.5 : 1,
                  cursor: saving || invalid ? "not-allowed" : "pointer" }}
              >
                {saving ? "Saving…" : "Save Base Odds"}
              </button>
              {data.configEnabled && data.otherHitGroups === 0 &&
                <button
                  type="button"
                  onClick={() => void submit("reset")}
                  disabled={saving}
                  style={{
                    ...buttonStyle, background: "#fff", color: "#334155",
                    borderColor: "#cbd5e1",
                  }}
                >
                  Restore Equal Odds
                </button>
              }
            </div>
            <p style={{ margin: "14px 0 0", fontSize: 12, lineHeight: 1.7, color: "#64748b" }}>
              The common subset fills ordinary pack slots. Each other subset has an independent
              1-in-N pack hit chance, with one card chosen uniformly from that subset.
              Insert and parallel ProductSet odds are managed separately.
              {data.otherHitGroups > 0 && (
                <> This product also has {data.otherHitGroups} existing non-Base rarity rules,
                  which this editor preserves without changing.</>
              )}
              {data.released && (
                <> This product is released: saving changes future pack draws.</>
              )}
            </p>
          </>
        ) : (
          <div style={{
            background: "#fff", border: "1px dashed #cbd5e1",
            borderRadius: 10, padding: "14px 16px", fontSize: 13,
            lineHeight: 1.6, color: "#475569",
          }}>
            {data.reason ?? "Subset odds are not available for this Base set."}
            <div style={{ marginTop: 5 }}>
              Existing Base cards continue to use equal selection odds.
            </div>
          </div>
        )}
      </>}
    </section>
  );
}
