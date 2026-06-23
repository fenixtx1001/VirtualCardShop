// src/app/checklist/request-shop-offer-button.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const ECONOMY_CHANGED_EVENT = "vcs:economy-changed";

function centsToDollars(cents: number | null | undefined) {
  const c = typeof cents === "number" ? cents : 0;
  return (c / 100).toFixed(2);
}

function formatTimeRemaining(untilIso: string | null | undefined) {
  if (!untilIso) return null;

  const until = new Date(untilIso).getTime();
  if (!Number.isFinite(until)) return null;

  const ms = until - Date.now();
  if (ms <= 0) return "soon";

  const totalMinutes = Math.ceil(ms / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= 24) return "24h";
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${Math.max(1, minutes)}m`;
}

type OfferStatus = {
  ok: boolean;
  cardId?: number;
  available?: boolean;
  reason?: "ACTIVE_OFFER" | "LOCKED" | "NO_OWNERSHIP" | "NO_BOOK_VALUE" | "CARD_NOT_FOUND" | string;
  message?: string;
  lockedUntil?: string | null;
  activeOffer?: {
    id: number;
    offerBps: number;
    createdAt: string;
    expiresAt: string;
  } | null;
};

export function RequestShopOfferButton({
  cardId,
  disabled,
  className,
}: {
  cardId: number;
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [status, setStatus] = useState<OfferStatus | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function loadStatus() {
    if (!Number.isFinite(cardId) || cardId <= 0) return;

    setCheckingStatus(true);
    try {
      const res = await fetch(`/api/shop/singles/offers?cardId=${encodeURIComponent(String(cardId))}`, {
        cache: "no-store",
      });

      const raw = await res.text();
      let j: OfferStatus = { ok: false };
      try {
        j = raw ? JSON.parse(raw) : { ok: false };
      } catch {
        throw new Error(`Non-JSON from offer status (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(j?.message ?? `Offer status failed (${res.status})`);
      setStatus(j);
    } catch {
      // Status is helpful UX, but should not block the button if the check fails.
      setStatus(null);
    } finally {
      setCheckingStatus(false);
    }
  }

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  useEffect(() => {
    if (!status?.lockedUntil) return;
    const timer = window.setInterval(() => setNowTick((x) => x + 1), 30 * 1000);
    return () => window.clearInterval(timer);
  }, [status?.lockedUntil]);

  const lockoutRemaining = useMemo(() => {
    // nowTick intentionally forces refresh every 30 seconds.
    void nowTick;
    return formatTimeRemaining(status?.lockedUntil);
  }, [status?.lockedUntil, nowTick]);

  const statusDisabled = status?.available === false && (status.reason === "ACTIVE_OFFER" || status.reason === "LOCKED");
  const hardDisabled = !!disabled || loading || checkingStatus || statusDisabled;

  const buttonText = (() => {
    if (loading) return "Requesting…";
    if (checkingStatus) return "Checking offer status…";
    if (status?.reason === "ACTIVE_OFFER") return "Offer Already Active";
    if (status?.reason === "LOCKED") return `Available in ${lockoutRemaining ?? "24h"}`;
    return "Request Shop Offer (24h)";
  })();

  const helperText = (() => {
    if (status?.reason === "ACTIVE_OFFER") return "You already have an active shop offer for this card.";
    if (status?.reason === "LOCKED") return status.message ?? "The shop recently quoted this card. Try again later.";
    return null;
  })();

  async function requestOffer() {
    if (!Number.isFinite(cardId) || cardId <= 0) {
      setErr("Invalid cardId.");
      return;
    }

    setLoading(true);
    setErr(null);
    setMsg(null);

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
        throw new Error(`Non-JSON from offers (${res.status}): ${raw.slice(0, 120)}`);
      }

      if (!res.ok) {
        if (j?.lockedUntil) {
          setStatus({
            ok: true,
            cardId,
            available: false,
            reason: "LOCKED",
            message: j?.error ?? "The shop recently quoted this card. Try again later.",
            lockedUntil: j.lockedUntil,
            activeOffer: null,
          });
        }
        throw new Error(j?.error ?? `Offer request failed (${res.status})`);
      }

      const offer = j?.offer;
      const reused = !!j?.reused;

      if (offer?.offerBps != null && offer?.card?.bookValue != null) {
        const pct = (Number(offer.offerBps) / 100).toFixed(2);
        const bookCents = Math.round((Number(offer.card.bookValue) || 0) * 100);
        const offerCentsEach = Math.round((bookCents * Number(offer.offerBps)) / 10000);

        setMsg(
          reused
            ? `Offer already active: ${pct}% (≈ $${centsToDollars(offerCentsEach)} each).`
            : `Offer created: ${pct}% (≈ $${centsToDollars(offerCentsEach)} each).`
        );
      } else {
        setMsg(reused ? "Offer already active (reused)." : "Offer created.");
      }

      setStatus({
        ok: true,
        cardId,
        available: false,
        reason: "ACTIVE_OFFER",
        message: "You already have an active shop offer for this card.",
        lockedUntil: null,
        activeOffer: offer
          ? {
              id: Number(offer.id),
              offerBps: Number(offer.offerBps),
              createdAt: String(offer.createdAt),
              expiresAt: String(offer.expiresAt),
            }
          : null,
      });

      window.dispatchEvent(new CustomEvent(ECONOMY_CHANGED_EVENT));

      // Send them straight to the Singles tab
      router.push("/shop?tab=singles");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Offer request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className} style={{ display: "grid", gap: 8 }}>
      <button
        onClick={requestOffer}
        disabled={hardDisabled}
        style={{
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid #ccc",
          background: hardDisabled ? "#f2f2f2" : "white",
          color: hardDisabled ? "#666" : "#111",
          fontWeight: 900,
          cursor: hardDisabled ? "not-allowed" : "pointer",
        }}
        title={helperText ?? "Request a 24-hour offer from the shop for this card"}
      >
        {buttonText}
      </button>

      {helperText ? <div style={{ fontSize: 12, color: "#666", lineHeight: 1.35 }}>{helperText}</div> : null}

      {err ? (
        <div style={{ padding: 10, borderRadius: 12, background: "#fee", border: "1px solid #f99", fontSize: 12 }}>
          {err}
        </div>
      ) : null}

      {msg ? (
        <div style={{ padding: 10, borderRadius: 12, background: "#efe", border: "1px solid #9f9", fontSize: 12 }}>
          {msg}
        </div>
      ) : null}
    </div>
  );
}
