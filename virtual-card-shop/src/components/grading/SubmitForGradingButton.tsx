// src/components/grading/SubmitForGradingButton.tsx
"use client";

import { useMemo, useState } from "react";
import styles from "./SubmitForGradingButton.module.css";
import {
  GRADING_FEE_BPS,
  MIN_GRADING_FEE_CENTS,
  bookValueToCents,
  calculateGradingFeeCents,
} from "@/lib/grading";

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
  const rawBookValueCents = bookValueToCents(bookValue);
  const feePerCardCents = calculateGradingFeeCents(rawBookValueCents);

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
    return <div className={styles.empty}>No raw copies available to grade.</div>;
  }

  return (
    <section className={styles.box} aria-label="Submit for VCS grading">
      <div className={styles.head}>
        <div>
          <span className={styles.eyebrow}>THE GRADING DESK</span>
          <h3 className={styles.title}>Submit for Grading</h3>
          <p className={styles.subtitle}>Raw copies available: {maxQty}</p>
        </div>
        <div>
          <span className={styles.eyebrow}>ESTIMATED FEE</span>
          <div className={styles.fee}>{formatDollarsFromCents(fee.totalFeeCents)}</div>
        </div>
      </div>
      <div className={styles.form}>
        <label>Quantity
          <input type="number" min={1} max={maxQty} inputMode="numeric"
            value={clampedQuantity} disabled={submitting}
            onChange={event => setQuantity(Number(event.target.value))} />
        </label>
        <button type="button" onClick={submitForGrading} disabled={disabled}>
          {submitting ? "Submitting…" : "Submit for Grading →"}
        </button>
      </div>
      <p className={styles.muted}>
        Fee: {(GRADING_FEE_BPS / 100).toFixed(0)}% of raw value
        {" · "}minimum {formatDollarsFromCents(MIN_GRADING_FEE_CENTS)} per card.
        Grades stay sealed until you choose to reveal them.
      </p>
      {message && <div role={isError ? "alert" : "status"}
        className={styles.message + (isError ? " " + styles.error : "")}>
        {message}
      </div>}
    </section>
  );
}
