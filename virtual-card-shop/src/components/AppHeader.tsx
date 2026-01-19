"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type EconomyState = {
  balanceCents: number;
  canClaim: boolean;
  nextRewardAt: string | null;
  msUntilNextClaim: number;
};

const ECONOMY_CHANGED_EVENT = "vcs:economy-changed";

function formatDollars(cents: number) {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function AppHeader() {
  const [eco, setEco] = useState<EconomyState | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const tickRef = useRef<number | null>(null);

  async function loadEconomy() {
    try {
      setErrorMsg(null);
      const res = await fetch("/api/economy", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load economy (${res.status})`);
      const data = (await res.json()) as EconomyState;
      setEco(data);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Failed to load economy");
    }
  }

  async function claimReward() {
    try {
      setLoading(true);
      setErrorMsg(null);

      const res = await fetch("/api/economy/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        let msg = `Claim failed (${res.status})`;
        try {
          const maybe = await res.json();
          if (maybe?.error) msg = String(maybe.error);
        } catch {
          // ignore
        }
        setErrorMsg(msg);
        await loadEconomy();
        return;
      }

      const data = (await res.json()) as EconomyState;
      setEco(data);

      // Optional: tell the rest of the app economy changed
      window.dispatchEvent(new CustomEvent(ECONOMY_CHANGED_EVENT));
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Claim failed");
    } finally {
      setLoading(false);
    }
  }

  // Initial load
  useEffect(() => {
    loadEconomy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for economy changes triggered elsewhere (e.g., shop purchase)
  useEffect(() => {
    const handler = () => {
      loadEconomy();
    };
    window.addEventListener(ECONOMY_CHANGED_EVENT, handler as EventListener);
    return () => window.removeEventListener(ECONOMY_CHANGED_EVENT, handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Local countdown tick
  useEffect(() => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }

    if (!eco) return;

    tickRef.current = window.setInterval(() => {
      setEco((prev) => {
        if (!prev) return prev;
        if (prev.canClaim) return prev;

        const nextMs = Math.max(0, prev.msUntilNextClaim - 1000);
        const canClaimNow = nextMs === 0;

        return {
          ...prev,
          msUntilNextClaim: nextMs,
          canClaim: canClaimNow ? true : prev.canClaim,
        };
      });
    }, 1000);

    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [eco?.canClaim, eco?.msUntilNextClaim]);

  // If countdown hits 0 locally, refresh once to stay authoritative
  useEffect(() => {
    if (!eco) return;
    if (eco.canClaim && eco.msUntilNextClaim === 0 && eco.nextRewardAt !== null) {
      loadEconomy();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eco?.canClaim, eco?.msUntilNextClaim]);

  const balanceText = useMemo(() => {
    if (!eco) return "—";
    return formatDollars(eco.balanceCents);
  }, [eco]);

  return (
    <header
      style={{
        borderBottom: "1px solid #ddd",
        padding: "12px 16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "#fafafa",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Virtual Card Shop</div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 700 }}>Bank:</span> {balanceText}
          </div>

          <button
            onClick={claimReward}
            disabled={!eco?.canClaim || loading}
            style={{
              fontSize: 12,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: eco?.canClaim && !loading ? "white" : "#f2f2f2",
              cursor: eco?.canClaim && !loading ? "pointer" : "not-allowed",
              fontWeight: 700,
            }}
            title={
              eco?.canClaim
                ? "Claim $10 reward"
                : eco
                ? `Available in ${formatCountdown(eco.msUntilNextClaim)}`
                : "Loading…"
            }
          >
            {loading ? "Claiming…" : "Claim $10"}
          </button>

          {eco && !eco.canClaim && (
            <div style={{ fontSize: 12, color: "#444" }}>
              Next reward in{" "}
              <span style={{ fontWeight: 700 }}>{formatCountdown(eco.msUntilNextClaim)}</span>
            </div>
          )}

          {errorMsg && <div style={{ fontSize: 12, color: "#b00020" }}>{errorMsg}</div>}
        </div>
      </div>

      <nav style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <Link href="/" style={{ textDecoration: "underline" }}>
          Home
        </Link>
        <Link href="/shop" style={{ textDecoration: "underline" }}>
          Shop
        </Link>
        <Link href="/inventory" style={{ textDecoration: "underline" }}>
          Inventory
        </Link>
        <Link href="/collection" style={{ textDecoration: "underline" }}>
          Collection
        </Link>
        <Link href="/admin" style={{ textDecoration: "underline" }}>
          Admin
        </Link>
      </nav>
    </header>
  );
}
