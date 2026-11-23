"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

type EconomyState = {
  balanceCents: number;
  canClaim: boolean;
  nextRewardAt: string | null;
  msUntilNextClaim: number;
};

const ECONOMY_CHANGED_EVENT = "vcs:economy-changed";

function countdown(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
}

/**
 * Same GET and POST endpoints as the collector header, but without mounting
 * collector stats, menu, or reward polling while an admin is working.
 */
export default function AdminRewardClaim() {
  const { status } = useSession();
  const [economy, setEconomy] = useState<EconomyState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/economy", { cache: "no-store" });
      if (!res.ok) throw new Error("Reward status unavailable");
      const data = (await res.json()) as EconomyState;
      setEconomy(data);
      setNow(Date.now());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reward status unavailable");
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    void refresh();
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onEconomyChange = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(ECONOMY_CHANGED_EVENT, onEconomyChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(ECONOMY_CHANGED_EVENT, onEconomyChange);
    };
  }, [status, refresh]);

  useEffect(() => {
    if (status !== "authenticated" || !economy || economy.canClaim) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status, economy]);

  const remainingMs = useMemo(() => {
    if (!economy || economy.canClaim) return 0;
    if (!economy.nextRewardAt) return economy.msUntilNextClaim;
    const deadline = Date.parse(economy.nextRewardAt);
    return Number.isFinite(deadline) ? Math.max(0, deadline - now) : economy.msUntilNextClaim;
  }, [economy, now]);

  const ready = status === "authenticated" && !!economy && (economy.canClaim || remainingMs <= 0);

  async function claim() {
    if (!ready || claiming) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch("/api/economy/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Claim failed");
      if (!data || typeof data.canClaim !== "boolean") throw new Error("Unexpected reward response");
      setEconomy(data as EconomyState);
      setNow(Date.now());
      // Keep other mounted features in sync with the same event as the Shop.
      window.dispatchEvent(new CustomEvent(ECONOMY_CHANGED_EVENT, {
        detail: { cashOnly: true, headerAlreadyUpdated: true },
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Claim failed");
      await refresh();
    } finally {
      setClaiming(false);
    }
  }

  const balance = economy
    ? (economy.balanceCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })
    : "—";

  return (
    <div className="vcs-admin-reward" aria-label="VCS 30-minute collecting reward">
      <span className="vcs-admin-reward-balance" title="VCS cash balance">{balance}</span>
      <button
        type="button"
        className={"vcs-admin-reward-button" + (ready ? " is-ready" : "")}
        onClick={claim}
        disabled={!ready || claiming}
        aria-label={ready ? "Claim your $10 VCS reward" : "Next $10 reward" }
        title={ready ? "Claim your $10 reward" : economy ? "Next $10 reward in " + countdown(remainingMs) : "Loading reward status"}
      >
        {claiming ? "Claiming…" : status !== "authenticated" ? "Sign in" : !economy ? "Reward —" : ready ? "Claim $10" : countdown(remainingMs)}
      </button>
      {error ? <span className="vcs-admin-reward-error" role="alert" title={error}>Reward unavailable</span> : null}
    </div>
  );
}
