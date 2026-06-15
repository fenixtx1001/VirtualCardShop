// src/app/cards/[cardId]/card-detail-client.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SubmitForGradingButton from "@/components/grading/SubmitForGradingButton";
import VcsSlab from "@/components/grading/VcsSlab";

type GradeBreakdownRow = {
  grade: number;
  label: string;
  quantity: number;
  valueCents: number;
};

type SlabRow = {
  grade: number;
  label: string;
  quantity: number;
  valueCents: number;
};

type OwnerRow = {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;

  quantity: number;

  rawQuantity?: number;
  gradedQuantity?: number;
  pendingGradingQuantity?: number;
  totalQuantity?: number;
  totalValueCents?: number;
  gradeBreakdown?: GradeBreakdownRow[];
  slabs?: SlabRow[];
};

type CardDetailResponse = {
  ok: boolean;

  card: {
    id: number;
    player: string;
    cardNumber: string;
    team: string | null;
    subset: string | null;
    variant: string | null;
    bookValue: number;

    gradeability?: "COMMON" | "GREAT" | "ICONIC";
    gradeabilityLabel?: string;

    productId: string | null;
    productYear: number | null;
    productBrand: string | null;
    productSport: string | null;

    productSetId: string | null;
    productSetName: string | null;
    productSetIsBase: boolean | null;

    frontImageUrl: string | null;
    backImageUrl: string | null;
  };

  population: {
    uniqueOwners: number;
    totalOwned: number;
    totalOwnedIncludingPending?: number;
    raw?: number;
    graded?: number;
    pendingGrading?: number;
    totalValueCents?: number;
  };

  myOwnership?: OwnerRow | null;
  owners: OwnerRow[];
};

type ImageSide = "front" | "back";
type ViewMode = "card" | "slab";

function safeUrl(u: string | null | undefined) {
  const s = (u ?? "").trim();
  return s.length ? s : null;
}

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

function formatBookValue(v: number | null | undefined) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return `$${n.toFixed(2)}`;
}

function formatProductName(card: CardDetailResponse["card"]) {
  const year = card.productYear;
  const brand = card.productBrand?.trim();

  if (year && brand) return `${year} ${brand}`;
  if (brand) return brand;
  if (card.productId) return card.productId.replaceAll("_", " ");
  return "—";
}

function getGradeSortValue(grade: number) {
  return grade === 0 ? -1 : grade;
}

function normalizeBreakdown(owner: OwnerRow | null | undefined): GradeBreakdownRow[] {
  if (!owner) return [];

  const rows = Array.isArray(owner.gradeBreakdown) ? owner.gradeBreakdown : [];

  return [...rows].sort((a, b) => getGradeSortValue(a.grade) - getGradeSortValue(b.grade));
}

function normalizeSlabs(owner: OwnerRow | null | undefined): SlabRow[] {
  if (!owner) return [];

  const rows = Array.isArray(owner.slabs) ? owner.slabs : [];

  return [...rows].sort((a, b) => b.grade - a.grade);
}

function GradePill({ row }: { row: GradeBreakdownRow }) {
  const isRaw = row.grade === 0;

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
      title={`${row.label} quantity`}
    >
      {row.label}
      <span style={{ color: "#555" }}>×{row.quantity}</span>
      <span style={{ color: "#555" }}>{formatDollarsFromCents(row.valueCents)}</span>
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
      Pending VCS ×{quantity}
    </span>
  );
}

export default function CardDetailClient({ cardId }: { cardId: number }) {
  const [data, setData] = useState<CardDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [side, setSide] = useState<ImageSide>("front");
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [selectedSlabIndex, setSelectedSlabIndex] = useState(0);

  const [imgErrorFront, setImgErrorFront] = useState(false);
  const [imgErrorBack, setImgErrorBack] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`/api/cards/${encodeURIComponent(String(cardId))}/population`, {
        cache: "no-store",
      });

      const raw = await res.text();

      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Card detail returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      setData(j as CardDetailResponse);

      setImgErrorFront(false);
      setImgErrorBack(false);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load card detail");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const c = data?.card;

  const setLabel = c
    ? c.productSetName?.trim()
      ? c.productSetName.trim()
      : c.productSetIsBase == null
        ? "—"
        : c.productSetIsBase
          ? "Base"
          : "Insert"
    : "";

  const setTypePrefix =
    c?.productSetIsBase == null ? "" : c.productSetIsBase ? "Base — " : "Insert — ";

  const slabSetName = c
    ? [c.productYear, c.productBrand, setLabel].filter(Boolean).join(" ")
    : "";

  const frontUrl = useMemo(() => safeUrl(c?.frontImageUrl), [c?.frontImageUrl]);
  const backUrl = useMemo(() => safeUrl(c?.backImageUrl), [c?.backImageUrl]);

  const myOwnership = data?.myOwnership ?? null;
  const myOwnershipBreakdown = useMemo(() => normalizeBreakdown(myOwnership), [myOwnership]);
  const myOwnershipSlabs = useMemo(() => normalizeSlabs(myOwnership), [myOwnership]);

  useEffect(() => {
    if (side === "back" && !backUrl) setSide("front");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backUrl]);

  useEffect(() => {
    setSelectedSlabIndex((prev) => {
      if (myOwnershipSlabs.length === 0) return 0;
      return Math.max(0, Math.min(prev, myOwnershipSlabs.length - 1));
    });

    if (myOwnershipSlabs.length === 0 && viewMode === "slab") {
      setViewMode("card");
    }
  }, [myOwnershipSlabs.length, viewMode]);

  const showFront = side === "front";
  const activeUrl = showFront ? frontUrl : backUrl;
  const activeErrored = showFront ? imgErrorFront : imgErrorBack;

  const hasAnyImage = Boolean(frontUrl || backUrl);
  const selectedSlab = myOwnershipSlabs[selectedSlabIndex] ?? myOwnershipSlabs[0] ?? null;

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/collection" style={{ textDecoration: "underline", fontWeight: 800 }}>
          ← Collection
        </Link>

        <div style={{ fontWeight: 900, fontSize: 24 }}>Card Details</div>

        <button onClick={load} disabled={loading} style={{ padding: "6px 10px" }}>
          Refresh
        </button>
      </div>

      <hr style={{ margin: "14px 0" }} />

      {err && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99" }}>
          {err}
        </div>
      )}

      {loading ? (
        <div>Loading…</div>
      ) : !data || !c ? (
        <div>No data.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 340px", minWidth: 320 }}>
              <div style={{ fontSize: 22, fontWeight: 1000 }}>{c.player}</div>
              <div style={{ marginTop: 6, fontWeight: 800 }}>
                Card #{c.cardNumber} {c.team ? `• ${c.team}` : ""}
              </div>

              <div style={{ marginTop: 10, color: "#444" }}>
                <div>
                  <span style={{ fontWeight: 900 }}>Product:</span>{" "}
                  {formatProductName(c)} {c.productYear != null ? `(${c.productYear})` : ""}
                </div>
                <div>
                  <span style={{ fontWeight: 900 }}>Set:</span> {setTypePrefix}
                  {setLabel}
                </div>
                <div>
                  <span style={{ fontWeight: 900 }}>Subset/Variant:</span> {c.subset ?? "—"} /{" "}
                  {c.variant ?? "—"}
                </div>
                <div>
                  <span style={{ fontWeight: 900 }}>Book value:</span> {formatBookValue(c.bookValue)}
                </div>
                <div>
                  <span style={{ fontWeight: 900 }}>Gradeability:</span>{" "}
                  {c.gradeabilityLabel ?? c.gradeability ?? "Common"}
                </div>
              </div>

              {myOwnership ? (
                <div
                  style={{
                    marginTop: 14,
                    border: "1px solid #ddd",
                    borderRadius: 14,
                    padding: 12,
                    background: "#fff",
                  }}
                >
                  <div style={{ fontWeight: 1000, marginBottom: 8 }}>Your Ownership</div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#666", fontWeight: 800 }}>Raw</div>
                      <div style={{ fontSize: 20, fontWeight: 1000 }}>
                        {safeNum(myOwnership.rawQuantity)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#666", fontWeight: 800 }}>Pending VCS</div>
                      <div style={{ fontSize: 20, fontWeight: 1000 }}>
                        {safeNum(myOwnership.pendingGradingQuantity)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#666", fontWeight: 800 }}>Graded</div>
                      <div style={{ fontSize: 20, fontWeight: 1000 }}>
                        {safeNum(myOwnership.gradedQuantity)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#666", fontWeight: 800 }}>Total</div>
                      <div style={{ fontSize: 20, fontWeight: 1000 }}>
                        {safeNum(myOwnership.totalQuantity, myOwnership.quantity)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {myOwnershipBreakdown.map((row) => (
                      <GradePill key={row.grade} row={row} />
                    ))}
                    <PendingPill quantity={safeNum(myOwnership.pendingGradingQuantity)} />
                  </div>

                  <div style={{ marginTop: 8, color: "#16477d", fontWeight: 950, fontSize: 13 }}>
                    Total value including pending:{" "}
                    {formatDollarsFromCents(safeNum(myOwnership.totalValueCents))}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <SubmitForGradingButton
                      cardId={c.id}
                      rawQuantity={safeNum(myOwnership.rawQuantity)}
                      bookValue={c.bookValue}
                      player={c.player}
                      cardNumber={c.cardNumber}
                      onSubmitted={load}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ flex: "1 1 390px", minWidth: 320 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 18, fontWeight: 1000 }}>
                  {viewMode === "slab" ? "VCS slab" : "Card images"}
                </div>

                <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
                  <button
                    onClick={() => setViewMode("card")}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      fontWeight: 900,
                      background: viewMode === "card" ? "#eef6ff" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    Card
                  </button>

                  <button
                    onClick={() => setViewMode("slab")}
                    disabled={myOwnershipSlabs.length === 0}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      fontWeight: 900,
                      opacity: myOwnershipSlabs.length === 0 ? 0.5 : 1,
                      background: viewMode === "slab" ? "#eef6ff" : "#fff",
                      cursor: myOwnershipSlabs.length === 0 ? "not-allowed" : "pointer",
                    }}
                    title={myOwnershipSlabs.length === 0 ? "No revealed graded copies yet" : "View VCS slab"}
                  >
                    Slab
                  </button>

                  {viewMode === "card" && hasAnyImage ? (
                    <>
                      <button
                        onClick={() => setSide("front")}
                        disabled={!frontUrl}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          fontWeight: 900,
                          opacity: !frontUrl ? 0.5 : 1,
                          background: side === "front" ? "#eef6ff" : "#fff",
                          cursor: !frontUrl ? "not-allowed" : "pointer",
                        }}
                        title={!frontUrl ? "No front image available" : "Front"}
                      >
                        Front
                      </button>
                      <button
                        onClick={() => setSide("back")}
                        disabled={!backUrl}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          fontWeight: 900,
                          opacity: !backUrl ? 0.5 : 1,
                          background: side === "back" ? "#eef6ff" : "#fff",
                          cursor: !backUrl ? "not-allowed" : "pointer",
                        }}
                        title={!backUrl ? "No back image available" : "Back"}
                      >
                        Back
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {viewMode === "slab" && selectedSlab ? (
                <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
                  {myOwnershipSlabs.length > 1 ? (
                    <select
                      value={selectedSlabIndex}
                      onChange={(e) => setSelectedSlabIndex(Number(e.target.value))}
                      style={{
                        width: "100%",
                        maxWidth: 390,
                        padding: "8px 10px",
                        border: "1px solid #ddd",
                        borderRadius: 10,
                        fontWeight: 900,
                      }}
                    >
                      {myOwnershipSlabs.map((slab, idx) => (
                        <option key={`${slab.grade}-${idx}`} value={idx}>
                          {slab.label} ×{slab.quantity}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  <VcsSlab
                    player={c.player}
                    cardNumber={c.cardNumber}
                    setName={slabSetName}
                    team={c.team}
                    grade={selectedSlab.grade}
                    gradeability={c.gradeability}
                    gradeabilityLabel={c.gradeabilityLabel}
                    valueCents={selectedSlab.valueCents}
                    quantity={selectedSlab.quantity}
                    imageUrl={frontUrl}
                  />
                </div>
              ) : !hasAnyImage ? (
                <div
                  style={{
                    border: "1px dashed #ccc",
                    borderRadius: 14,
                    padding: 16,
                    color: "#666",
                    background: "#fafafa",
                  }}
                >
                  No images uploaded for this card yet.
                </div>
              ) : activeUrl && !activeErrored ? (
                <div
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 14,
                    padding: 10,
                    background: "#fff",
                  }}
                >
                  <img
                    src={activeUrl}
                    alt={showFront ? "Front of card" : "Back of card"}
                    style={{
                      width: "100%",
                      maxWidth: 520,
                      height: "auto",
                      display: "block",
                      borderRadius: 10,
                      border: "1px solid #eee",
                      objectFit: "contain",
                    }}
                    onError={() => {
                      if (showFront) setImgErrorFront(true);
                      else setImgErrorBack(true);
                    }}
                  />

                  <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ color: "#666", fontWeight: 800 }}>
                      Showing: {showFront ? "Front" : "Back"}
                    </div>
                    <a
                      href={activeUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ marginLeft: "auto", textDecoration: "underline", fontWeight: 900 }}
                    >
                      Open image
                    </a>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    border: "1px dashed #ccc",
                    borderRadius: 14,
                    padding: 16,
                    color: "#666",
                    background: "#fafafa",
                  }}
                >
                  Image failed to load. (Broken URL or blocked host)
                </div>
              )}
            </div>

            <div style={{ flex: "1 1 340px", minWidth: 320 }}>
              <div style={{ fontSize: 18, fontWeight: 1000, marginBottom: 10 }}>
                Population report
              </div>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, minWidth: 150 }}>
                  <div style={{ color: "#666", fontWeight: 800 }}>Unique owners</div>
                  <div style={{ fontSize: 22, fontWeight: 1000 }}>{data.population.uniqueOwners}</div>
                </div>

                <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, minWidth: 150 }}>
                  <div style={{ color: "#666", fontWeight: 800 }}>Total owned</div>
                  <div style={{ fontSize: 22, fontWeight: 1000 }}>{data.population.totalOwned}</div>
                </div>

                <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, minWidth: 150 }}>
                  <div style={{ color: "#666", fontWeight: 800 }}>Incl. pending</div>
                  <div style={{ fontSize: 22, fontWeight: 1000 }}>
                    {safeNum(data.population.totalOwnedIncludingPending, data.population.totalOwned)}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 5, color: "#444", fontWeight: 800 }}>
                <div>Raw: {safeNum(data.population.raw)}</div>
                <div>Pending VCS: {safeNum(data.population.pendingGrading)}</div>
                <div>Graded: {safeNum(data.population.graded)}</div>
                <div>
                  Total value incl. pending:{" "}
                  {formatDollarsFromCents(safeNum(data.population.totalValueCents))}
                </div>
              </div>
            </div>
          </div>

          <hr style={{ margin: "16px 0" }} />

          <div style={{ fontWeight: 1000, marginBottom: 10 }}>Owners</div>

          {data.owners.length === 0 ? (
            <div style={{ color: "#666" }}>No one owns this yet.</div>
          ) : (
            <div style={{ overflowX: "auto", border: "1px solid #ddd" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
                  <tr>
                    {["User", "Email", "Raw", "Pending", "Graded", "Total", "Breakdown", "Value"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: 8,
                          borderBottom: "1px solid #ddd",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.owners.map((o, idx) => (
                    <tr
                      key={`${o.userId}-${idx}`}
                      style={{ background: idx % 2 === 0 ? "#fff" : "#fcfcfc" }}
                    >
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {o.name?.trim() ? o.name.trim() : o.email ?? o.userId}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{o.email ?? "—"}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {safeNum(o.rawQuantity)}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {safeNum(o.pendingGradingQuantity)}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {safeNum(o.gradedQuantity)}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {safeNum(o.totalQuantity, o.quantity)}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {normalizeBreakdown(o).map((row) => (
                            <GradePill key={row.grade} row={row} />
                          ))}
                          <PendingPill quantity={safeNum(o.pendingGradingQuantity)} />
                        </div>
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee", fontWeight: 900 }}>
                        {formatDollarsFromCents(safeNum(o.totalValueCents))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}