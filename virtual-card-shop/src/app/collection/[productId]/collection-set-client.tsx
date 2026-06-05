// src/app/collection/[productId]/collection-set-client.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SubmitForGradingButton from "@/components/grading/SubmitForGradingButton";

type ProductSetOption = {
  id: string;
  isBase: boolean;
  name: string | null;
};

type GradeBreakdownRow = {
  grade: number;
  label: string;
  quantity: number;
};

type CardRow = {
  cardId: number;
  cardNumber: string;
  player: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  isInsert: boolean;
  quantity: number;
  rawQuantity?: number;
  gradedQuantity?: number;
  pendingGradingQuantity?: number;
  highestGrade?: number | null;
  gradeBreakdown?: GradeBreakdownRow[];
  bookValue: number | null;
  frontImageUrl: string | null;
  backImageUrl: string | null;
};

type ApiResponse = {
  ok: boolean;
  productId: string;
  productSetId: string;
  productSetIsBase: boolean;
  productSets: ProductSetOption[];
  uniqueOwned: number;
  totalCards: number;
  percentComplete: number;
  totalQty: number;
  totalRawQty?: number;
  totalGradedQty?: number;
  totalPendingGradingQty?: number;
  cards: CardRow[];
};

function fmtMoney(v: number | null | undefined) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return `$${n.toFixed(2)}`;
}

function safeNum(v: any, fallback = 0) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function parseCardNo(raw: string | null | undefined) {
  const s = (raw ?? "").trim();
  const lower = s.toLowerCase();

  const m = lower.match(/(\d+)/);
  if (!m || m.index == null) return { n: Number.POSITIVE_INFINITY, suf: lower, raw: lower };

  const numStr = m[1];
  const n = parseInt(numStr, 10);
  const suffixRaw = lower.slice(m.index + numStr.length);
  const suf = suffixRaw.replace(/[^a-z0-9]+/g, "");

  return { n: Number.isFinite(n) ? n : Number.POSITIVE_INFINITY, suf, raw: lower };
}

function cardNoCompare(aNo: string, bNo: string) {
  const a = parseCardNo(aNo);
  const b = parseCardNo(bNo);
  if (a.n !== b.n) return a.n - b.n;
  if (a.suf !== b.suf) return a.suf.localeCompare(b.suf);
  return a.raw.localeCompare(b.raw);
}

function formatSetLabel(ps: ProductSetOption) {
  const base = ps.name?.trim() ? ps.name.trim() : ps.id;
  return ps.isBase ? `Base — ${base}` : `Insert — ${base}`;
}

function gradeLabel(grade: number) {
  return grade === 0 ? "Raw" : `VCS ${grade}`;
}

function normalizeBreakdown(card: CardRow | null | undefined): GradeBreakdownRow[] {
  if (!card) return [];

  const breakdown = Array.isArray(card.gradeBreakdown) ? card.gradeBreakdown : [];

  if (breakdown.length > 0) {
    return [...breakdown].sort((a, b) => {
      const av = a.grade === 0 ? -1 : a.grade;
      const bv = b.grade === 0 ? -1 : b.grade;
      return av - bv;
    });
  }

  return [{ grade: 0, label: "Raw", quantity: safeNum(card.quantity) }];
}

function getRawQuantity(card: CardRow | null | undefined) {
  if (!card) return 0;

  if (typeof card.rawQuantity === "number" && Number.isFinite(card.rawQuantity)) {
    return Math.max(0, Math.floor(card.rawQuantity));
  }

  const rawBreakdown = normalizeBreakdown(card).find((row) => row.grade === 0);
  if (rawBreakdown) return Math.max(0, Math.floor(safeNum(rawBreakdown.quantity)));

  return Math.max(0, Math.floor(safeNum(card.quantity)));
}

function getPendingQuantity(card: CardRow | null | undefined) {
  if (!card) return 0;
  return Math.max(0, Math.floor(safeNum(card.pendingGradingQuantity)));
}

function GradePill({ grade, quantity }: { grade: number; quantity: number }) {
  const isRaw = grade === 0;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 8px",
        borderRadius: 999,
        border: "1px solid #ddd",
        background: isRaw ? "#f7f7f7" : "#eef6ff",
        color: isRaw ? "#333" : "#16477d",
        fontSize: 12,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
      title={`${gradeLabel(grade)} quantity`}
    >
      {gradeLabel(grade)} <span style={{ color: "#555" }}>×{quantity}</span>
    </span>
  );
}

function PendingPill({ quantity }: { quantity: number }) {
  if (quantity <= 0) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 8px",
        borderRadius: 999,
        border: "1px solid #f0d28a",
        background: "#fff8e8",
        color: "#7a5200",
        fontSize: 12,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
      title="Submitted to VCS grading but not revealed yet"
    >
      Pending VCS <span style={{ color: "#7a5200" }}>×{quantity}</span>
    </span>
  );
}

export default function CollectionSetClient({ productId }: { productId: string }) {
  if (!productId) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui" }}>
        <div style={{ padding: 12, background: "#fee", border: "1px solid #f99" }}>
          Missing productId
        </div>
      </div>
    );
  }

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedProductSetId, setSelectedProductSetId] = useState<string>("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showBack, setShowBack] = useState(false);

  async function load(explicitProductSetId?: string) {
    setLoading(true);
    setErr(null);

    try {
      const qs = new URLSearchParams();
      const psid = (explicitProductSetId ?? selectedProductSetId).trim();
      if (psid) qs.set("productSetId", psid);

      const url =
        `/api/collection/product/${encodeURIComponent(productId)}` +
        (qs.toString() ? `?${qs.toString()}` : "");

      const res = await fetch(url, { cache: "no-store" });
      const raw = await res.text();

      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Set returned non-JSON (${res.status}): ${raw.slice(0, 180)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      const next = j as ApiResponse;
      setData(next);

      if (!selectedProductSetId && next?.productSetId) {
        setSelectedProductSetId(next.productSetId);
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load set");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const productSetsSorted = useMemo(() => {
    const arr = data?.productSets ?? [];
    return [...arr].sort((a, b) => Number(b.isBase) - Number(a.isBase));
  }, [data]);

  const cards = useMemo(() => {
    const arr = data?.cards ?? [];
    return [...arr].sort((a, b) => cardNoCompare(a.cardNumber, b.cardNumber));
  }, [data]);

  useEffect(() => {
    if (!cards.length) {
      setSelectedId(null);
      return;
    }

    setSelectedId((prev) => {
      const stillExists = cards.some((c) => c.cardId === prev);
      return stillExists ? prev : cards[0].cardId;
    });

    setShowBack(false);
  }, [cards]);

  const selected = useMemo(() => {
    if (!cards.length) return null;
    return cards.find((c) => c.cardId === selectedId) ?? cards[0];
  }, [cards, selectedId]);

  const selectedBreakdown = useMemo(() => normalizeBreakdown(selected), [selected]);

  const selectedRawQuantity = useMemo(() => getRawQuantity(selected), [selected]);
  const selectedPendingQuantity = useMemo(() => getPendingQuantity(selected), [selected]);

  const imageUrl = useMemo(() => {
    if (!selected) return null;
    if (showBack) return selected.backImageUrl ?? selected.frontImageUrl ?? null;
    return selected.frontImageUrl ?? selected.backImageUrl ?? null;
  }, [selected, showBack]);

  function selectCard(id: number) {
    setSelectedId(id);
    setShowBack(false);
  }

  const pct = safeNum(data?.percentComplete, 0);
  const totalRawQty = safeNum(data?.totalRawQty, cards.reduce((sum, c) => sum + safeNum(c.rawQuantity), 0));
  const totalGradedQty = safeNum(data?.totalGradedQty, cards.reduce((sum, c) => sum + safeNum(c.gradedQuantity), 0));
  const totalPendingGradingQty = safeNum(
    data?.totalPendingGradingQty,
    cards.reduce((sum, c) => sum + safeNum(c.pendingGradingQuantity), 0)
  );

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <Link href="/collection" style={{ textDecoration: "underline", fontWeight: 700 }}>
          ← Back to Collection
        </Link>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>{productId}</h1>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={() => load()} style={{ padding: "8px 12px" }}>
          Refresh
        </button>

        <Link
          href={`/checklist/${encodeURIComponent(productId)}`}
          style={{ textDecoration: "underline", fontWeight: 800 }}
        >
          Checklist →
        </Link>

        <Link href="/grading" style={{ textDecoration: "underline", fontWeight: 800 }}>
          Grading Orders →
        </Link>
      </div>

      <hr style={{ margin: "14px 0" }} />

      {data?.productSets?.length ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ fontWeight: 900 }}>Viewing:</div>
          <select
            value={selectedProductSetId}
            onChange={(e) => {
              const nextId = e.target.value;
              setSelectedProductSetId(nextId);
              load(nextId);
            }}
            style={{
              padding: "8px 10px",
              border: "1px solid #ddd",
              borderRadius: 10,
              minWidth: 320,
              fontWeight: 700,
            }}
          >
            {productSetsSorted.map((ps) => (
              <option key={ps.id} value={ps.id}>
                {formatSetLabel(ps)}
              </option>
            ))}
          </select>

          <div style={{ color: "#666", fontWeight: 700 }}>
            {data.productSetIsBase ? "Base set completion" : "Insert set completion"}
          </div>
        </div>
      ) : null}

      {err && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {err}
        </div>
      )}

      {loading ? (
        <div>Loading…</div>
      ) : !data ? (
        <div>No data.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Complete</div>
              <div style={{ fontWeight: 900 }}>{pct.toFixed(1)}%</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Unique Owned</div>
              <div style={{ fontWeight: 900 }}>{safeNum(data.uniqueOwned)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Total Cards</div>
              <div style={{ fontWeight: 900 }}>{safeNum(data.totalCards)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Total Qty</div>
              <div style={{ fontWeight: 900 }}>{safeNum(data.totalQty)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Raw</div>
              <div style={{ fontWeight: 900 }}>{totalRawQty}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Pending VCS</div>
              <div style={{ fontWeight: 900 }}>{totalPendingGradingQty}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Graded</div>
              <div style={{ fontWeight: 900 }}>{totalGradedQty}</div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              alignItems: "start",
            }}
          >
            <div style={{ border: "1px solid #ddd", padding: 12, minHeight: 520 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, gap: 10 }}>
                <div style={{ fontWeight: 900 }}>
                  #{selected?.cardNumber ?? "—"} — {selected?.player ?? "—"}
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  Click card to flip ({showBack ? "Back" : "Front"})
                </div>
              </div>

              <div onClick={() => setShowBack((v) => !v)} style={{ cursor: "pointer", display: "grid", placeItems: "center" }}>
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Card"
                    style={{
                      width: "100%",
                      maxWidth: 520,
                      border: "1px solid #ddd",
                      background: "#fff",
                    }}
                  />
                ) : (
                  <div style={{ width: "100%", padding: 18, border: "1px solid #ddd" }}>
                    (No image for this card yet)
                  </div>
                )}
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 8, fontSize: 14 }}>
                <div>
                  <b>Total Qty:</b> {selected?.quantity ?? 0}
                </div>
                <div>
                  <b>Raw:</b> {selectedRawQuantity}{" "}
                  <b style={{ marginLeft: 10 }}>Pending VCS:</b> {selectedPendingQuantity}{" "}
                  <b style={{ marginLeft: 10 }}>Graded:</b> {safeNum(selected?.gradedQuantity)}
                </div>
                <div>
                  <b>Book:</b> {fmtMoney(selected?.bookValue)}
                </div>

                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Ownership Breakdown</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {selectedBreakdown.map((g) => (
                      <GradePill key={g.grade} grade={g.grade} quantity={g.quantity} />
                    ))}
                    <PendingPill quantity={selectedPendingQuantity} />
                  </div>
                </div>

                {selected ? (
                  <SubmitForGradingButton
                    cardId={selected.cardId}
                    rawQuantity={selectedRawQuantity}
                    bookValue={selected.bookValue}
                    player={selected.player}
                    cardNumber={selected.cardNumber}
                    onSubmitted={() => load()}
                  />
                ) : null}

                {safeNum(selected?.gradedQuantity) > 0 ? (
                  <div style={{ color: "#16477d", fontWeight: 800 }}>
                    Highest VCS Grade: {selected?.highestGrade ?? "—"}
                  </div>
                ) : null}

                <div style={{ color: "#444" }}>
                  {selected?.team ?? "—"}
                  {selected?.subset ? ` • ${selected.subset}` : ""}
                  {selected?.variant ? ` • ${selected.variant}` : ""}
                  {data.productSetIsBase ? " • Base" : " • Insert"}
                </div>
              </div>
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                height: 620,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: 10, borderBottom: "1px solid #ddd", background: "#f7f7f7", fontWeight: 900 }}>
                Your Cards (click a row)
              </div>

              <div style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: "#fff" }}>
                    <tr>
                      {["#", "Player", "Qty", "Raw", "Pending", "Best", "Book"].map((h) => (
                        <th key={h} style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map((c, idx) => {
                      const active = c.cardId === selected?.cardId;
                      const hasGrade = safeNum(c.gradedQuantity) > 0;
                      return (
                        <tr
                          key={c.cardId}
                          onClick={() => selectCard(c.cardId)}
                          style={{
                            cursor: "pointer",
                            background: active ? "#eef6ff" : idx % 2 === 0 ? "#fff" : "#fcfcfc",
                          }}
                        >
                          <td style={{ padding: 10, fontWeight: 800 }}>{c.cardNumber}</td>
                          <td style={{ padding: 10 }}>
                            <div style={{ fontWeight: 800 }}>{c.player}</div>
                            <div style={{ fontSize: 12, color: "#666" }}>
                              {c.team ?? "—"}
                              {c.subset ? ` • ${c.subset}` : ""}
                              {c.variant ? ` • ${c.variant}` : ""}
                              {!data.productSetIsBase ? " • Insert" : ""}
                            </div>
                          </td>
                          <td style={{ padding: 10, fontWeight: 800 }}>{c.quantity}</td>
                          <td style={{ padding: 10, fontWeight: 800 }}>{getRawQuantity(c)}</td>
                          <td style={{ padding: 10, fontWeight: 800, color: getPendingQuantity(c) > 0 ? "#7a5200" : "#777" }}>
                            {getPendingQuantity(c)}
                          </td>
                          <td style={{ padding: 10, fontWeight: 900, color: hasGrade ? "#16477d" : "#777" }}>
                            {hasGrade ? `VCS ${c.highestGrade}` : "Raw"}
                          </td>
                          <td style={{ padding: 10 }}>{fmtMoney(c.bookValue)}</td>
                        </tr>
                      );
                    })}

                    {cards.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: 12 }}>
                          No cards owned in this product set yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}