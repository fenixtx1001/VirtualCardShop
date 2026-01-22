"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type EconomyState = {
  balanceCents: number;
  canClaim: boolean;
  nextRewardAt: string | null;
  msUntilNextClaim: number;
};

type CollectionStats = {
  ok: boolean;
  cardsOwned: number;
  collectionValueCents: number;
};

const ECONOMY_CHANGED_EVENT = "vcs:economy-changed";
const COLLECTION_CHANGED_EVENT = "vcs:collection-changed";

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
  const [stats, setStats] = useState<CollectionStats | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const tickRef = useRef<number | null>(null);

  // Sticky spacer support
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

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

  async function loadCollectionStats() {
    try {
      const res = await fetch("/api/collection/stats", { cache: "no-store" });
      if (!res.ok) {
        setStats(null);
        return;
      }
      const data = (await res.json()) as CollectionStats;
      setStats(data);
    } catch {
      setStats(null);
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
    loadCollectionStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for economy changes triggered elsewhere
  useEffect(() => {
    const handler = () => loadEconomy();
    window.addEventListener(ECONOMY_CHANGED_EVENT, handler as EventListener);
    return () => window.removeEventListener(ECONOMY_CHANGED_EVENT, handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for collection changes (we’ll dispatch this after pack opens later)
  useEffect(() => {
    const handler = () => loadCollectionStats();
    window.addEventListener(COLLECTION_CHANGED_EVENT, handler as EventListener);
    return () => window.removeEventListener(COLLECTION_CHANGED_EVENT, handler as EventListener);
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

  const collectionValueText = useMemo(() => {
    if (!stats) return "—";
    return formatDollars(stats.collectionValueCents ?? 0);
  }, [stats]);

  const cardsOwnedText = useMemo(() => {
    if (!stats) return "—";
    return (stats.cardsOwned ?? 0).toLocaleString();
  }, [stats]);

  // Measure header height so content never slides underneath
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const measure = () => setHeaderHeight(el.offsetHeight);
    measure();

    window.addEventListener("resize", measure);
    const t = window.setTimeout(measure, 50);

    return () => {
      window.removeEventListener("resize", measure);
      window.clearTimeout(t);
    };
  }, []);

  return (
    <>
      <header
        ref={(node) => {
          headerRef.current = node;
        }}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1000,
          borderBottom: "1px solid #e7e3dc",
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#fbfaf7",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.3 }}>Virtual Card Shop</div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 800 }}>Bank:</span> {balanceText}
            </div>

            <button
              onClick={claimReward}
              disabled={!eco?.canClaim || loading}
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #d7d2c8",
                background: eco?.canClaim && !loading ? "white" : "#f2efe9",
                cursor: eco?.canClaim && !loading ? "pointer" : "not-allowed",
                fontWeight: 800,
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
                Next reward in <span style={{ fontWeight: 800 }}>{formatCountdown(eco.msUntilNextClaim)}</span>
              </div>
            )}

            {/* Collector pride stats */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginLeft: 6 }}>
              <div style={{ fontSize: 12, color: "#444" }}>
                <span style={{ fontWeight: 800 }}>Collection Value:</span> {collectionValueText}
              </div>
              <div style={{ fontSize: 12, color: "#444" }}>
                <span style={{ fontWeight: 800 }}>Cards Owned:</span> {cardsOwnedText}
              </div>
            </div>

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

      <div style={{ height: headerHeight }} />
    </>
  );
}
