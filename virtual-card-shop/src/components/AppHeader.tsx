"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
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

type NavItem = {
  href: string;
  label: string;
};

const ECONOMY_CHANGED_EVENT = "vcs:economy-changed";
const COLLECTION_CHANGED_EVENT = "vcs:collection-changed";
const RIP_MODE_EVENT = "vcs:rip-mode";

const navItems: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/inventory", label: "Inventory" },
  { href: "/collection", label: "Collection" },
  { href: "/collection/slabs", label: "Slabs" },
  { href: "/auctions", label: "Auctions" },
  { href: "/analytics", label: "Analytics" },
  { href: "/showcase", label: "Showcase" },
  { href: "/admin", label: "Admin" },
];

const palette = {
  shell: "rgba(255, 252, 246, 0.88)",
  shellStrong: "rgba(255, 252, 246, 0.96)",
  text: "#17130c",
  muted: "#776d5d",
  faint: "#a79a85",
  border: "rgba(89, 75, 49, 0.16)",
  gold: "#b9933d",
  goldDeep: "#7a5619",
  goldSoft: "rgba(185, 147, 61, 0.13)",
  cream: "#fbf7ef",
  card: "rgba(255,255,255,0.78)",
  shadow: "0 18px 55px rgba(42, 31, 13, 0.12)",
  blueBlack: "#151922",
  danger: "#9f1d1d",
};

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

function isActivePath(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function VcsMark({ size = 42 }: { size?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        display: "grid",
        placeItems: "center",
        position: "relative",
        flex: "0 0 auto",
        background:
          "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(237,226,202,0.9) 48%, rgba(255,255,255,0.96))",
        border: `1px solid ${palette.border}`,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.95), 0 10px 24px rgba(83,61,21,0.12)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 5,
          borderRadius: Math.round(size * 0.24),
          border: "1px solid rgba(185,147,61,0.35)",
          background:
            "linear-gradient(135deg, rgba(185,147,61,0.15), rgba(255,255,255,0.36), rgba(21,25,34,0.06))",
        }}
      />
      <div
        style={{
          position: "relative",
          fontSize: Math.round(size * 0.33),
          fontWeight: 1000,
          letterSpacing: -0.8,
          color: palette.blueBlack,
          lineHeight: 1,
        }}
      >
        VCS
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "gold" | "green";
}) {
  const isGold = tone === "gold";
  const isGreen = tone === "green";

  return (
    <div
      style={{
        border: `1px solid ${isGold ? "rgba(185,147,61,0.34)" : palette.border}`,
        background: isGold
          ? "linear-gradient(135deg, rgba(255,248,229,0.94), rgba(255,255,255,0.72))"
          : isGreen
            ? "linear-gradient(135deg, rgba(239,255,243,0.86), rgba(255,255,255,0.72))"
            : "rgba(255,255,255,0.62)",
        borderRadius: 999,
        padding: "7px 10px",
        display: "inline-flex",
        alignItems: "baseline",
        gap: 6,
        minHeight: 34,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 900,
          color: palette.muted,
          letterSpacing: 0.35,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 950,
          color: isGold ? palette.goldDeep : isGreen ? "#176328" : palette.text,
          letterSpacing: -0.15,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function MobileStatsBar({
  collectionValue,
  cardsOwned,
  eco,
  loading,
  onClaim,
}: {
  collectionValue: string;
  cardsOwned: string;
  eco: EconomyState | null;
  loading: boolean;
  onClaim: () => void;
}) {
  const canClaim = Boolean(eco?.canClaim && !loading);
  const rewardValue = loading
    ? "Claiming…"
    : eco?.canClaim
      ? "Claim $10"
      : eco
        ? formatCountdown(eco.msUntilNextClaim)
        : "—";

  const cellBase: CSSProperties = {
    minWidth: 0,
    minHeight: 36,
    padding: "6px 8px",
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 1,
    background: "transparent",
  };

  const labelStyle: CSSProperties = {
    color: palette.muted,
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 0.45,
    lineHeight: 1,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };

  const valueStyle: CSSProperties = {
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: palette.text,
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: -0.15,
    lineHeight: 1.15,
    whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        marginTop: 10,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 0.9fr) minmax(0, 0.9fr)",
        border: `1px solid ${palette.border}`,
        borderRadius: 15,
        overflow: "hidden",
        background: "rgba(255,255,255,0.62)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.86)",
      }}
    >
      <div style={cellBase}>
        <span style={labelStyle}>Collection</span>
        <span style={{ ...valueStyle, color: palette.goldDeep }}>{collectionValue}</span>
      </div>

      <div
        style={{
          ...cellBase,
          borderLeft: `1px solid ${palette.border}`,
          borderRight: `1px solid ${palette.border}`,
        }}
      >
        <span style={labelStyle}>Cards</span>
        <span style={valueStyle}>{cardsOwned}</span>
      </div>

      <button
        type="button"
        onClick={onClaim}
        disabled={!canClaim}
        title={
          eco?.canClaim
            ? "Claim $10 reward"
            : eco
              ? `Available in ${formatCountdown(eco.msUntilNextClaim)}`
              : "Loading reward"
        }
        style={{
          ...cellBase,
          border: 0,
          color: "inherit",
          cursor: canClaim ? "pointer" : "default",
          fontFamily: "inherit",
          background: canClaim
            ? "linear-gradient(135deg, rgba(239,255,243,0.94), rgba(255,255,255,0.82))"
            : "transparent",
        }}
      >
        <span style={{ ...labelStyle, color: canClaim ? "#347047" : palette.muted }}>
          {canClaim ? "Reward Ready" : "Next"}
        </span>
        <span style={{ ...valueStyle, color: canClaim ? "#176328" : palette.text }}>{rewardValue}</span>
      </button>
    </div>
  );
}

function navLinkStyle(active: boolean): CSSProperties {
  return {
    position: "relative",
    color: active ? palette.text : palette.muted,
    textDecoration: "none",
    fontSize: 13,
    fontWeight: active ? 950 : 820,
    padding: "8px 3px 10px",
    letterSpacing: -0.1,
    whiteSpace: "nowrap",
  };
}

function ActiveUnderline({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <span
      style={{
        position: "absolute",
        left: 3,
        right: 3,
        bottom: 2,
        height: 2,
        borderRadius: 999,
        background: `linear-gradient(90deg, transparent, ${palette.gold}, transparent)`,
      }}
    />
  );
}

function ClaimRewardButton({
  eco,
  loading,
  onClick,
  compact = false,
}: {
  eco: EconomyState | null;
  loading: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const canClaim = Boolean(eco?.canClaim && !loading);

  return (
    <button
      onClick={onClick}
      disabled={!canClaim}
      style={{
        border: `1px solid ${canClaim ? "rgba(185,147,61,0.55)" : palette.border}`,
        background: canClaim
          ? "linear-gradient(135deg, #fff9df, #ffffff 48%, #f1dfaa)"
          : "rgba(255,255,255,0.54)",
        color: canClaim ? palette.goldDeep : palette.muted,
        borderRadius: 999,
        padding: compact ? "7px 10px" : "8px 12px",
        fontSize: compact ? 12 : 13,
        fontWeight: 950,
        cursor: canClaim ? "pointer" : "not-allowed",
        boxShadow: canClaim
          ? "0 10px 22px rgba(185,147,61,0.18), inset 0 1px 0 rgba(255,255,255,0.9)"
          : "inset 0 1px 0 rgba(255,255,255,0.72)",
        whiteSpace: "nowrap",
      }}
      title={
        eco?.canClaim
          ? "Claim $10 reward"
          : eco
            ? `Available in ${formatCountdown(eco.msUntilNextClaim)}`
            : "Loading…"
      }
    >
      {loading ? "Claiming…" : eco?.canClaim ? "Claim $10" : eco ? formatCountdown(eco.msUntilNextClaim) : "Reward"}
    </button>
  );
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const tickRef = useRef<number | null>(null);

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
    if (!isMobile) setMobileMenuOpen(false);
  }, [isMobile]);

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

  useEffect(() => {
    loadEconomy();
    loadCollectionStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => loadEconomy();
    window.addEventListener(ECONOMY_CHANGED_EVENT, handler as EventListener);
    return () => window.removeEventListener(ECONOMY_CHANGED_EVENT, handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => loadCollectionStats();
    window.addEventListener(COLLECTION_CHANGED_EVENT, handler as EventListener);
    return () => window.removeEventListener(COLLECTION_CHANGED_EVENT, handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    if (!eco) return;
    if (eco.canClaim && eco.msUntilNextClaim === 0 && eco.nextRewardAt !== null) {
      loadEconomy();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eco?.canClaim, eco?.msUntilNextClaim]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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
  }, [compactRipMode, isMobile, mobileMenuOpen, eco?.canClaim, eco?.msUntilNextClaim, stats?.cardsOwned, stats?.collectionValueCents]);

  const signedInEmail = status === "authenticated" ? session?.user?.email ?? null : null;
  const showCompactMobileRipHeader = isMobile && pathname?.startsWith("/open-pack/") && compactRipMode;

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
            padding: "9px 12px",
            background: palette.shellStrong,
            backdropFilter: "blur(18px)",
            borderBottom: `1px solid ${palette.border}`,
            boxShadow: "0 10px 30px rgba(34, 27, 16, 0.09)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <VcsMark size={34} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 1000, color: palette.text, letterSpacing: -0.2 }}>
                  VCS Rip
                </div>
                <div style={{ fontSize: 11, color: palette.muted, fontWeight: 820 }}>{balanceText}</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ClaimRewardButton eco={eco} loading={loading} onClick={claimReward} compact />
              <Link
                href="/inventory"
                style={{
                  color: palette.text,
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 950,
                  padding: "7px 9px",
                  borderRadius: 999,
                  border: `1px solid ${palette.border}`,
                  background: "rgba(255,255,255,0.65)",
                  whiteSpace: "nowrap",
                }}
              >
                Exit →
              </Link>
            </div>
          </div>
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
          background:
            "linear-gradient(180deg, rgba(255,252,246,0.96), rgba(255,252,246,0.86))",
          backdropFilter: "blur(18px)",
          borderBottom: `1px solid ${palette.border}`,
          boxShadow: "0 12px 34px rgba(38, 29, 12, 0.08)",
        }}
      >
        <div
          style={{
            height: 3,
            background: `linear-gradient(90deg, transparent, ${palette.gold}, rgba(255,255,255,0.92), ${palette.gold}, transparent)`,
            opacity: 0.88,
          }}
        />

        {isMobile ? (
          <div style={{ padding: "10px 12px 11px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <Link
                href="/"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: palette.text,
                  textDecoration: "none",
                  minWidth: 0,
                }}
              >
                <VcsMark size={38} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 1000,
                      letterSpacing: -0.35,
                      lineHeight: 1.05,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Virtual Card Shop
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      color: palette.goldDeep,
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: 1.35,
                      textTransform: "uppercase",
                    }}
                  >
                    Collector&apos;s Vault
                  </div>
                </div>
              </Link>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
                <div
                  style={{
                    border: `1px solid ${palette.border}`,
                    borderRadius: 999,
                    padding: "7px 9px",
                    background: "rgba(255,255,255,0.68)",
                    fontSize: 12,
                    fontWeight: 950,
                    color: palette.text,
                    whiteSpace: "nowrap",
                  }}
                >
                  {balanceText}
                </div>

                <button
                  type="button"
                  aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                  onClick={() => setMobileMenuOpen((open) => !open)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 14,
                    border: `1px solid ${palette.border}`,
                    background:
                      "linear-gradient(145deg, rgba(255,255,255,0.96), rgba(241,232,214,0.78))",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.92)",
                  }}
                >
                  <span
                    style={{
                      display: "grid",
                      gap: 4,
                      width: 18,
                    }}
                  >
                    <span style={{ height: 2, borderRadius: 99, background: palette.text }} />
                    <span style={{ height: 2, borderRadius: 99, background: palette.text }} />
                    <span style={{ height: 2, borderRadius: 99, background: palette.text }} />
                  </span>
                </button>
              </div>
            </div>

            <MobileStatsBar
              collectionValue={collectionValueText}
              cardsOwned={cardsOwnedText}
              eco={eco}
              loading={loading}
              onClaim={claimReward}
            />

            {errorMsg ? (
              <div style={{ marginTop: 8, color: palette.danger, fontSize: 12, fontWeight: 850 }}>
                {errorMsg}
              </div>
            ) : null}

            {mobileMenuOpen ? (
              <div
                style={{
                  marginTop: 12,
                  border: `1px solid ${palette.border}`,
                  borderRadius: 22,
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(251,247,239,0.94))",
                  boxShadow: palette.shadow,
                  overflow: "hidden",
                }}
              >
                <nav style={{ display: "grid", padding: 8 }}>
                  {navItems.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          color: active ? palette.text : palette.muted,
                          textDecoration: "none",
                          padding: "12px 12px",
                          borderRadius: 15,
                          fontSize: 15,
                          fontWeight: active ? 1000 : 850,
                          background: active ? palette.goldSoft : "transparent",
                        }}
                      >
                        {item.label}
                        {active ? (
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 999,
                              background: palette.gold,
                            }}
                          />
                        ) : null}
                      </Link>
                    );
                  })}
                </nav>

                <div
                  style={{
                    borderTop: `1px solid ${palette.border}`,
                    padding: 12,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: palette.muted,
                          fontSize: 10,
                          fontWeight: 900,
                          textTransform: "uppercase",
                          letterSpacing: 1.2,
                        }}
                      >
                        Account
                      </div>
                      <div
                        style={{
                          marginTop: 2,
                          color: palette.text,
                          fontSize: 12,
                          fontWeight: 850,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {signedInEmail ?? "Not signed in"}
                      </div>
                    </div>
                    <AuthButton />
                  </div>

                  <ClaimRewardButton eco={eco} loading={loading} onClick={claimReward} />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              maxWidth: 1440,
              margin: "0 auto",
              padding: "13px 20px 12px",
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: 22,
              alignItems: "center",
            }}
          >
            <Link
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                color: palette.text,
                textDecoration: "none",
              }}
            >
              <VcsMark size={46} />
              <div>
                <div style={{ fontSize: 19, fontWeight: 1000, letterSpacing: -0.45, lineHeight: 1 }}>
                  Virtual Card Shop
                </div>
                <div
                  style={{
                    marginTop: 4,
                    color: palette.goldDeep,
                    fontSize: 10,
                    fontWeight: 950,
                    letterSpacing: 1.8,
                    textTransform: "uppercase",
                  }}
                >
                  Collector&apos;s Vault
                </div>
              </div>
            </Link>

            <div style={{ display: "grid", gap: 9, minWidth: 0 }}>
              <nav
                style={{
                  display: "flex",
                  gap: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 0,
                  overflowX: "auto",
                }}
              >
                {navItems.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  return (
                    <Link key={item.href} href={item.href} style={navLinkStyle(active)}>
                      {item.label}
                      <ActiveUnderline active={active} />
                    </Link>
                  );
                })}
              </nav>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <StatPill label="Bank" value={balanceText} tone="gold" />
                <StatPill label="Collection" value={collectionValueText} />
                <StatPill label="Cards" value={cardsOwnedText} />
                <StatPill
                  label={eco?.canClaim ? "Reward" : "Next Reward"}
                  value={eco?.canClaim ? "Ready" : eco ? formatCountdown(eco.msUntilNextClaim) : "—"}
                  tone={eco?.canClaim ? "green" : "neutral"}
                />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 9,
                justifyItems: "end",
                minWidth: 190,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <ClaimRewardButton eco={eco} loading={loading} onClick={claimReward} />
                <AuthButton />
              </div>

              <div
                style={{
                  color: errorMsg ? palette.danger : palette.muted,
                  fontSize: 11,
                  fontWeight: 800,
                  maxWidth: 260,
                  textAlign: "right",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={errorMsg || signedInEmail || "Not signed in"}
              >
                {errorMsg || (signedInEmail ? `Signed in as ${signedInEmail}` : "Not signed in")}
              </div>
            </div>
          </div>
        )}
      </header>

      <div style={{ height: headerHeight }} />
    </>
  );
}
