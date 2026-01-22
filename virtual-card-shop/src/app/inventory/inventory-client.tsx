"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type InventoryRow = {
  productId: string;
  packsOwned: number;
  product: {
    id: string;
    packPriceCents: number | null;
    packsPerBox: number | null;
    packImageUrl: string | null;
    boxImageUrl: string | null;
  };
};

type MeResponse = {
  user: { balanceCents: number; nextRewardAt: string | null };
  inventory: InventoryRow[];
};

function centsToDollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function msToClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  const hh = Math.floor(mm / 60);
  const m2 = mm % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hh > 0 ? `${hh}:${pad(m2)}:${pad(ss)}` : `${m2}:${pad(ss)}`;
}

export default function InventoryClient() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [now, setNow] = useState(Date.now());

  async function load() {
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const j = (await res.json()) as MeResponse;
      setData(j);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load");
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const nextRewardAtMs = useMemo(() => {
    if (!data?.user?.nextRewardAt) return 0;
    return new Date(data.user.nextRewardAt).getTime();
  }, [data]);

  const canClaim = !nextRewardAtMs || now >= nextRewardAtMs;
  const remainingMs = nextRewardAtMs ? Math.max(0, nextRewardAtMs - now) : 0;

  async function claim() {
    setClaiming(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/economy/claim", { method: "POST" });
      const raw = await res.text();
      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Claim returned non-JSON (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Claim failed (${res.status})`);
      setMsg("Claimed $10!");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Claim failed");
    } finally {
      setClaiming(false);
    }
  }

  const rows = data?.inventory ?? [];
  const sorted = useMemo(() => [...rows].sort((a, b) => a.productId.localeCompare(b.productId)), [rows]);

  const thStyle: React.CSSProperties = { textAlign: "left", padding: 8, borderBottom: "1px solid #ddd", whiteSpace: "nowrap" };
  const tdStyle: React.CSSProperties = { padding: 8, borderBottom: "1px solid #eee" };

  return (
    <main>
      <h1 style={{ fontSize: 32, fontWeight: 900, margin: "6px 0 10px" }}>Inventory</h1>

      {err && <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>{err}</div>}
      {msg && <div style={{ marginBottom: 12, padding: 10, background: "#efe", border: "1px solid #9f9" }}>{msg}</div>}

      {!data ? (
        <div>Loading…</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ fontWeight: 800 }}>Balance: ${centsToDollars(data.user.balanceCents ?? 0)}</div>

            <div style={{ fontWeight: 700 }}>
              Reward:{" "}
              {canClaim ? (
                <span style={{ color: "green" }}>Available</span>
              ) : (
                <span>Next in {msToClock(remainingMs)}</span>
              )}
            </div>

            <button onClick={claim} disabled={!canClaim || claiming} style={{ padding: "8px 12px" }}>
              {claiming ? "Claiming…" : "Claim $10"}
            </button>

            <Link href="/shop" style={{ textDecoration: "underline", fontWeight: 700 }}>
              Go to Shop →
            </Link>
          </div>

          <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f7f7f7", zIndex: 2 }}>
                <tr>
                  {["Product", "Packs Owned", "Pack", "Box", "Action"].map((h) => (
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {sorted.map((r, idx) => {
                  const openHref = `/open-pack/${encodeURIComponent(r.productId)}`;
                  const canOpen = (r.packsOwned ?? 0) > 0;

                  return (
                    <tr key={r.productId} style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>{r.productId}</td>
                      <td style={tdStyle}>{r.packsOwned}</td>

                      <td style={tdStyle}>
                        {r.product.packImageUrl ? (
                          <img
                            src={r.product.packImageUrl}
                            alt="Pack"
                            style={{ width: 48, height: 64, objectFit: "cover", border: "1px solid #eee" }}
                          />
                        ) : (
                          "—"
                        )}
                      </td>

                      <td style={tdStyle}>
                        {r.product.boxImageUrl ? (
                          <img
                            src={r.product.boxImageUrl}
                            alt="Box"
                            style={{ width: 64, height: 48, objectFit: "cover", border: "1px solid #eee" }}
                          />
                        ) : (
                          "—"
                        )}
                      </td>

                      <td style={tdStyle}>
                        {canOpen ? (
                          <Link href={openHref} style={{ textDecoration: "underline", fontWeight: 800 }}>
                            Open Pack
                          </Link>
                        ) : (
                          <span style={{ color: "#666" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 12 }}>
                      No unopened packs yet. Buy something in the Shop.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
