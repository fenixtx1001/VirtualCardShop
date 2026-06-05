// src/components/grading/SubmitForGradingButton.tsx
"use client";

import { useMemo, useState } from "react";

type SubmitForGradingButtonProps = {
  cardId: number;
  rawQuantity: number;
  bookValue: number | null | undefined;
  player?: string | null;
  cardNumber?: string | null;
  onSubmitted?: () => void | Promise<void>;
};

function safeNum(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatDollarsFromCents(cents: number) {
  const safe = Number.isFinite(cents) ? cents : 0;

  return (safe / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function calculateEstimatedFeeCents(bookValue: number | null | undefined, quantity: number) {
  const rawBookValue = safeNum(bookValue, 0);
  const rawBookValueCents = Math.max(0, Math.round(rawBookValue * 100));
  const feePerCardCents = Math.max(200, Math.round(rawBookValueCents * 0.15));

  return {
    rawBookValueCents,
    feePerCardCents,
    totalFeeCents: feePerCardCents * quantity,
  };
}

export default function SubmitForGradingButton({
  cardId,
  rawQuantity,
  bookValue,
  player,
  cardNumber,
  onSubmitted,
}: SubmitForGradingButtonProps) {
  const maxQty = Math.max(0, Math.floor(safeNum(rawQuantity, 0)));
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const clampedQuantity = Math.max(1, Math.min(maxQty || 1, Math.floor(safeNum(quantity, 1))));

  const fee = useMemo(() => {
    return calculateEstimatedFeeCents(bookValue, clampedQuantity);
  }, [bookValue, clampedQuantity]);

  const disabled = submitting || !Number.isInteger(cardId) || cardId <= 0 || maxQty <= 0;

  async function submitForGrading() {
    if (disabled) return;

    const confirmed = window.confirm(
      [
        `Submit ${clampedQuantity} raw cop${clampedQuantity === 1 ? "y" : "ies"} for VCS grading?`,
        "",
        `${cardNumber ? `#${cardNumber} ` : ""}${player ?? "Selected card"}`,
        `Estimated grading fee: ${formatDollarsFromCents(fee.totalFeeCents)}`,
        "",
        "Grades are rolled now but hidden until the order is ready.",
      ].join("\n")
    );

    if (!confirmed) return;

    setSubmitting(true);
    setMessage(null);
    setIsError(false);

    try {
      const res = await fetch("/api/grading/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          cardId,
          quantity: clampedQuantity,
        }),
      });

      const raw = await res.text();

      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Grading submit returned non-JSON (${res.status}): ${raw.slice(0, 160)}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Failed to submit for grading (${res.status})`);
      }

      setMessage(
        `Submitted for grading. Fee paid: ${formatDollarsFromCents(
          safeNum(json.totalFeeCents, fee.totalFeeCents)
        )}.`
      );
      setIsError(false);

      await onSubmitted?.();
    } catch (e: any) {
      setMessage(e?.message ?? "Failed to submit for grading");
      setIsError(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (maxQty <= 0) {
    return (
      <div
        style={{
          border: "1px solid #ddd",
          background: "#f7f7f7",
          borderRadius: 12,
          padding: 10,
          color: "#666",
          fontWeight: 800,
          fontSize: 13,
        }}
      >
        No raw copies available to grade.
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid #d9e4f5",
        background: "#f4f8ff",
        borderRadius: 12,
        padding: 10,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 950, color: "#16477d" }}>VCS Grading</div>
          <div style={{ color: "#335", fontSize: 12, fontWeight: 800 }}>
            Raw available: {maxQty} • Est. fee: {formatDollarsFromCents(fee.totalFeeCents)}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, fontWeight: 900, color: "#333" }}>
            Qty{" "}
            <input
              type="number"
              min={1}
              max={maxQty}
              value={clampedQuantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              disabled={submitting}
              style={{
                width: 64,
                border: "1px solid #bbb",
                borderRadius: 8,
                padding: "6px 8px",
                fontWeight: 900,
              }}
            />
          </label>

          <button
            type="button"
            onClick={submitForGrading}
            disabled={disabled}
            style={{
              border: "1px solid #16477d",
              background: disabled ? "#d9e4f5" : "#16477d",
              color: disabled ? "#557" : "#fff",
              borderRadius: 10,
              padding: "8px 10px",
              fontWeight: 950,
              cursor: disabled ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {submitting ? "Submitting…" : "Submit for Grading"}
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#445", fontWeight: 750 }}>
        Fee is 15% of raw value with a $2 minimum. Grade reveal timing depends on card gradeability.
      </div>

      {message ? (
        <div
          style={{
            border: `1px solid ${isError ? "#f3b7b7" : "#b8d8bd"}`,
            background: isError ? "#fff1f1" : "#f0fff3",
            color: isError ? "#7a1f1f" : "#185c24",
            borderRadius: 10,
            padding: 8,
            fontSize: 12,
            fontWeight: 850,
          }}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}