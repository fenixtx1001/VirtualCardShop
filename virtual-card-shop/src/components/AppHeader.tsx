"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import AuthButton from "@/components/AuthButton";

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
const RIP_MODE_EVENT = "vcs:rip-mode";

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
  const { data: session, status } = useSession();
  const pathname = usePathname();

  const [eco, setEco] = useState<EconomyState | null>(null);
  const [stats, setStats] = useState<CollectionStats | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [compactRipMode, setCompactRipMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  useEffect(() => {
    function handleRipMode(event: Event) {
      const custom = event as CustomEvent<boolean>;
      setCompactRipMode(Boolean(custom.detail));
    }

    window.addEventListener(RIP_MODE_EVENT, handleRipMode as EventListener);

    return () => {
      window.removeEventListener(RIP_MODE_EVENT, handleRipMode as EventListener);
    };
  }, []);

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

  // Listen for collection changes
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
  }, [compactRipMode, isMobile]);

  const signedInEmail = status === "authenticated" ? (session?.user?.email ?? null) : null;

  const showCompactMobileRipHeader =
    isMobile &&
    pathname?.startsWith("/open-pack/") &&
    compactRipMode;

  if (showCompactMobileRipHeader) {
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
            borderBottom: "1px solid var(--border-2)",
            padding: "10px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(251, 250, 247, 0.94)",
            backdropFilter: "blur(10px)",
            gap: 10,
            boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 950,
                letterSpacing: -0.2,
                whiteSpace: "nowrap",
              }}
            >
              VCS
            </div>

            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              <span style={{ fontWeight: 900, color: "var(--text)" }}>{balanceText}</span>
            </div>

            {eco && !eco.canClaim ? (
              <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                Reward {formatCountdown(eco.msUntilNextClaim)}
              </div>
            ) : eco?.canClaim ? (
              <button
                onClick={claimReward}
                disabled={loading}
                style={{
                  fontSize: 12,
                  padding: "5px 8px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "#fff",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
                title="Claim $10 reward"
              >
                {loading ? "Claiming…" : "Claim $10"}
              </button>
            ) : null}
          </div>

          <Link
            href="/inventory"
            style={{
              fontSize: 12,
              fontWeight: 900,
              textDecoration: "underline",
              whiteSpace: "nowrap",
              color: "var(--text)",
            }}
          >
            Exit Rip →
          </Link>
        </header>

        <div style={{ height: headerHeight }} />
      </>
    );
  }

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
          borderBottom: "1px solid var(--border-2)",
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "rgba(251, 250, 247, 0.85)",
          backdropFilter: "blur(10px)",
          gap: 16,
          boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.3 }}>
            Virtual Card Shop
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              <span style={{ fontWeight: 900, color: "var(--text)" }}>Bank:</span> {balanceText}
            </div>

            <button
              onClick={claimReward}
              disabled={!eco?.canClaim || loading}
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: eco?.canClaim && !loading ? "#fff" : "rgba(255,255,255,0.6)",
                cursor: eco?.canClaim && !loading ? "pointer" : "not-allowed",
                fontWeight: 900,
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
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Next reward in{" "}
                <span style={{ fontWeight: 900, color: "var(--text)" }}>
                  {formatCountdown(eco.msUntilNextClaim)}
                </span>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginLeft: 6 }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                <span style={{ fontWeight: 900, color: "var(--text)" }}>Collection Value:</span>{" "}
                {collectionValueText}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                <span style={{ fontWeight: 900, color: "var(--text)" }}>Cards Owned:</span> {cardsOwnedText}
              </div>
            </div>

            {errorMsg && <div style={{ fontSize: 12, color: "var(--danger)" }}>{errorMsg}</div>}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {signedInEmail ? (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Signed in as <span style={{ fontWeight: 900, color: "var(--text)" }}>{signedInEmail}</span>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Not signed in</div>
            )}

            <AuthButton />
          </div>

          <nav style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "flex-end", fontWeight: 800 }}>
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
            <Link href="/analytics" style={{ textDecoration: "underline" }}>
               Analytics
            </Link>
            <Link href="/showcase" style={{ textDecoration: "underline" }}>
              Showcase
            </Link>
            <Link href="/admin" style={{ textDecoration: "underline" }}>
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <div style={{ height: headerHeight }} />
    </>
  );
}
