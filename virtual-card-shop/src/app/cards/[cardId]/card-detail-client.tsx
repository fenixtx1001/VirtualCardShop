"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type OwnerRow = {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  quantity: number;
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
  };

  owners: OwnerRow[];
};

type ImageSide = "front" | "back";

function safeUrl(u: string | null | undefined) {
  const s = (u ?? "").trim();
  return s.length ? s : null;
}

export default function CardDetailClient({ cardId }: { cardId: number }) {
  const [data, setData] = useState<CardDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [side, setSide] = useState<ImageSide>("front");
  const [imgErrorFront, setImgErrorFront] = useState(false);
  const [imgErrorBack, setImgErrorBack] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(
        `/api/cards/${encodeURIComponent(String(cardId))}/population`,
        { cache: "no-store" }
      );

      const raw = await res.text();

      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(
          `Card detail returned non-JSON (${res.status}): ${raw.slice(0, 140)}`
        );
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      setData(j as CardDetailResponse);

      // Reset image errors whenever we reload new data
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

  const frontUrl = useMemo(() => safeUrl(c?.frontImageUrl), [c?.frontImageUrl]);
  const backUrl = useMemo(() => safeUrl(c?.backImageUrl), [c?.backImageUrl]);

  // If the user selects Back but there is no back image, snap back to Front.
  useEffect(() => {
    if (side === "back" && !backUrl) setSide("front");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backUrl]);

  const showFront = side === "front";
  const activeUrl = showFront ? frontUrl : backUrl;
  const activeErrored = showFront ? imgErrorFront : imgErrorBack;

  const hasAnyImage = Boolean(frontUrl || backUrl);

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
          {/* Top row: Card info + Image + Population */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {/* Left: Card identity */}
            <div style={{ flex: "1 1 340px", minWidth: 320 }}>
              <div style={{ fontSize: 22, fontWeight: 1000 }}>{c.player}</div>
              <div style={{ marginTop: 6, fontWeight: 800 }}>
                Card #{c.cardNumber} {c.team ? `• ${c.team}` : ""}
              </div>

              <div style={{ marginTop: 10, color: "#444" }}>
                <div>
                  <span style={{ fontWeight: 900 }}>Product:</span>{" "}
                  {c.productId ?? "—"} {c.productYear != null ? `(${c.productYear})` : ""}
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
                  <span style={{ fontWeight: 900 }}>Book value:</span> $
                  {Number(c.bookValue ?? 0).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Middle: Images */}
            <div style={{ flex: "1 1 360px", minWidth: 320 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 18, fontWeight: 1000 }}>Card images</div>

                {hasAnyImage ? (
                  <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
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
                      }}
                      title={!backUrl ? "No back image available" : "Back"}
                    >
                      Back
                    </button>
                  </div>
                ) : null}
              </div>

              {!hasAnyImage ? (
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

            {/* Right: Population */}
            <div style={{ flex: "1 1 340px", minWidth: 320 }}>
              <div style={{ fontSize: 18, fontWeight: 1000, marginBottom: 10 }}>
                Population report
              </div>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, minWidth: 160 }}>
                  <div style={{ color: "#666", fontWeight: 800 }}>Unique owners</div>
                  <div style={{ fontSize: 22, fontWeight: 1000 }}>{data.population.uniqueOwners}</div>
                </div>

                <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, minWidth: 160 }}>
                  <div style={{ color: "#666", fontWeight: 800 }}>Total owned</div>
                  <div style={{ fontSize: 22, fontWeight: 1000 }}>{data.population.totalOwned}</div>
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
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: "#f7f7f7" }}>
                  <tr>
                    {["User", "Email", "Qty"].map((h) => (
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
                        {o.quantity}
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
