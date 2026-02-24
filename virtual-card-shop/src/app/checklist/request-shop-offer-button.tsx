// src/app/checklist/request-shop-offer-button.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ECONOMY_CHANGED_EVENT = "vcs:economy-changed";

function centsToDollars(cents: number | null | undefined) {
  const c = typeof cents === "number" ? cents : 0;
  return (c / 100).toFixed(2);
}

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
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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

      if (!res.ok) throw new Error(j?.error ?? `Offer request failed (${res.status})`);

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
        disabled={!!disabled || loading}
        style={{
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid #ccc",
          background: !!disabled || loading ? "#f2f2f2" : "white",
          fontWeight: 900,
          cursor: !!disabled || loading ? "not-allowed" : "pointer",
        }}
        title="Request a 24-hour offer from the shop for this card"
      >
        {loading ? "Requesting…" : "Request Shop Offer (24h)"}
      </button>

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