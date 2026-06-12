"use client";

import { useEffect, useMemo, useState } from "react";

type ImageGap = "front" | "back" | "either";

type AdminCard = {
  id: number;
  cardNumber: string;
  player: string;
  team: string | null;
  position?: string | null;
  subset: string | null;
  variant: string | null;
  bookValue: number;
  quantityOwned: number;
  frontImageUrl: string | null;
  backImageUrl: string | null;
  productSet: {
    id: number | string;
    name: string | null;
    product: {
      id?: number | string;
      year: number | null;
      brand: string | null;
      sport?: string | null;
    } | null;
  } | null;
  set?: {
    id: number | string;
    year: number | null;
    brand: string | null;
    sport: string | null;
  } | null;
};

type DraftCard = {
  cardNumber: string;
  player: string;
  team: string;
  position: string;
  subset: string;
  variant: string;
  bookValue: string;
  frontImageUrl: string;
  backImageUrl: string;
};

function formatMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `$${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
}

function makeDraft(card: AdminCard): DraftCard {
  return {
    cardNumber: card.cardNumber ?? "",
    player: card.player ?? "",
    team: card.team ?? "",
    position: card.position ?? "",
    subset: card.subset ?? "",
    variant: card.variant ?? "",
    bookValue: String(card.bookValue ?? ""),
    frontImageUrl: card.frontImageUrl ?? "",
    backImageUrl: card.backImageUrl ?? "",
  };
}

function smallInputStyle(width = 130): React.CSSProperties {
  return {
    width,
    padding: "7px 8px",
    border: "1px solid #ccc",
    borderRadius: 8,
    fontSize: 13,
  };
}

function DropImageBox({
  label,
  imageUrl,
  uploading,
  onUrlChange,
  onUpload,
}: {
  label: string;
  imageUrl: string;
  uploading: boolean;
  onUrlChange: (url: string) => void;
  onUpload: (file: File) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 210 }}>
      <b style={{ fontSize: 12 }}>{label}</b>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={label}
            style={{
              width: 48,
              height: 66,
              objectFit: "cover",
              borderRadius: 6,
              border: "1px solid #ddd",
              background: "#eee",
            }}
          />
        ) : (
          <div
            style={{
              width: 48,
              height: 66,
              borderRadius: 6,
              border: "1px solid #ddd",
              background: "#eee",
              display: "grid",
              placeItems: "center",
              color: "#777",
              fontSize: 10,
              textAlign: "center",
            }}
          >
            No image
          </div>
        )}

        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) onUpload(file);
          }}
          style={{
            width: 145,
            minHeight: 58,
            border: "1px dashed #aaa",
            borderRadius: 8,
            padding: 8,
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            background: uploading ? "#fef3c7" : "#fafafa",
            fontSize: 12,
            textAlign: "center",
          }}
        >
          {uploading ? "Uploading..." : "Drag/drop or click"}
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              if (file) onUpload(file);
            }}
          />
        </label>
      </div>

      <input
        value={imageUrl}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="Image URL"
        style={{
          width: 210,
          padding: "6px 8px",
          border: "1px solid #ccc",
          borderRadius: 8,
          fontSize: 11,
        }}
      />

      {imageUrl ? (
        <a href={imageUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
          Preview
        </a>
      ) : null}
    </div>
  );
}

export default function ImageBackfillQueuePage() {
  const [search, setSearch] = useState("");
  const [imageGap, setImageGap] = useState<ImageGap>("front");
  const [limit, setLimit] = useState("50");
  const [cards, setCards] = useState<AdminCard[]>([]);
  const [drafts, setDrafts] = useState<Record<number, DraftCard>>({});
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [rowStatus, setRowStatus] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const totalPriority = useMemo(() => {
    return cards.reduce(
      (sum, card) => sum + Number(card.bookValue ?? 0) * Number(card.quantityOwned ?? 0),
      0
    );
  }, [cards]);

  function patchDraft(cardId: number, patch: Partial<DraftCard>) {
    setDrafts((prev) => ({
      ...prev,
      [cardId]: {
        ...prev[cardId],
        ...patch,
      },
    }));
  }

  async function loadCards() {
    setLoading(true);
    setError("");
    setMessage("");
    setHasSearched(true);

    try {
      const params = new URLSearchParams();
      params.set("imageGap", imageGap);
      params.set("limit", limit);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/admin/cards/image-backfill?${params.toString()}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to load image backfill queue");
      }

      const nextCards: AdminCard[] = data.cards ?? [];
      setCards(nextCards);

      const nextDrafts: Record<number, DraftCard> = {};
      for (const card of nextCards) {
        nextDrafts[card.id] = makeDraft(card);
      }

      setDrafts(nextDrafts);
      setRowStatus({});
      setMessage(`Loaded ${nextCards.length} cards.`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load image backfill queue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function autosaveImageUrl(cardId: number, side: "front" | "back", url: string) {
    setRowStatus((prev) => ({ ...prev, [cardId]: `Saving ${side} image...` }));

    const payload = side === "front" ? { frontImageUrl: url } : { backImageUrl: url };

    const res = await fetch(`/api/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error ?? `Failed to save ${side} image`);
    }

    setCards((prev) =>
      prev.map((card) =>
        card.id === cardId
          ? {
              ...card,
              ...data.card,
            }
          : card
      )
    );

    setDrafts((prev) => {
      const existing = prev[cardId];
      if (!existing) return prev;

      return {
        ...prev,
        [cardId]: {
          ...existing,
          frontImageUrl: data.card.frontImageUrl ?? existing.frontImageUrl,
          backImageUrl: data.card.backImageUrl ?? existing.backImageUrl,
        },
      };
    });

    setRowStatus((prev) => ({ ...prev, [cardId]: `Saved ${side} image.` }));
  }

  async function uploadImage(cardId: number, side: "front" | "back", file: File) {
    const key = `${cardId}-${side}`;
    setUploading((prev) => ({ ...prev, [key]: true }));
    setError("");
    setMessage("");
    setRowStatus((prev) => ({ ...prev, [cardId]: `Uploading ${side} image...` }));

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Upload failed");
      }

      if (!data?.url) {
        throw new Error("Upload succeeded but did not return a URL");
      }

      if (side === "front") {
        patchDraft(cardId, { frontImageUrl: data.url });
      } else {
        patchDraft(cardId, { backImageUrl: data.url });
      }

      await autosaveImageUrl(cardId, side, data.url);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
      setRowStatus((prev) => ({ ...prev, [cardId]: "Image save failed." }));
    } finally {
      setUploading((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function saveOne(cardId: number) {
    const draft = drafts[cardId];
    if (!draft) return;

    setError("");
    setMessage("");
    setRowStatus((prev) => ({ ...prev, [cardId]: "Saving row..." }));

    try {
      const res = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardNumber: draft.cardNumber,
          player: draft.player,
          team: draft.team,
          position: draft.position,
          subset: draft.subset,
          variant: draft.variant,
          bookValue: draft.bookValue,
          frontImageUrl: draft.frontImageUrl,
          backImageUrl: draft.backImageUrl,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Save failed");
      }

      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId
            ? {
                ...card,
                ...data.card,
              }
            : card
        )
      );

      const existingCard = cards.find((c) => c.id === cardId);

      setDrafts((prev) => ({
        ...prev,
        [cardId]: makeDraft({
          ...existingCard,
          ...data.card,
        } as AdminCard),
      }));

      setRowStatus((prev) => ({ ...prev, [cardId]: "Saved row." }));
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
      setRowStatus((prev) => ({ ...prev, [cardId]: "Row save failed." }));
    }
  }

  function reset() {
    setSearch("");
    setImageGap("front");
    setLimit("250");
    setCards([]);
    setDrafts({});
    setUploading({});
    setRowStatus({});
    setMessage("");
    setError("");
    setHasSearched(false);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <div style={{ marginBottom: 18 }}>
        <a href="/admin">← Back to Admin</a>
      </div>

      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Admin: Image Backfill Queue</h1>

      <p style={{ maxWidth: 980, marginBottom: 20 }}>
        Find owned cards that are missing images, prioritized by value. Drag/drop image uploads autosave only the
        single card you updated. Rows stay visible until you run Search again.
      </p>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          background: "#fafafa",
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            loadCards();
          }}
          style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Image Gap</span>
            <select
              value={imageGap}
              onChange={(e) => setImageGap(e.target.value as ImageGap)}
              style={{ padding: "9px 10px", border: "1px solid #ccc", borderRadius: 8 }}
            >
              <option value="front">Missing Front</option>
              <option value="back">Missing Back</option>
              <option value="either">Missing Either</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Optional: player, team, card #, set..."
              style={{
                width: 330,
                maxWidth: "80vw",
                padding: "9px 10px",
                border: "1px solid #ccc",
                borderRadius: 8,
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Limit</span>
            <select
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              style={{ padding: "9px 10px", border: "1px solid #ccc", borderRadius: 8 }}
            >
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
              <option value="500">500</option>
            </select>
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #222",
              background: "#111",
              color: "white",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Searching..." : "Search"}
          </button>

          <button
            type="button"
            onClick={reset}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: "white",
              fontWeight: 700,
            }}
          >
            Reset
          </button>
        </form>
      </section>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          background: "#fff",
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <b>Showing {cards.length} cards</b>
        <span>Potential visible collection impact: {formatMoney(totalPriority)}</span>
        {message ? <span style={{ color: "#065f46", fontWeight: 700 }}>{message}</span> : null}
        {error ? <span style={{ color: "#991b1b", fontWeight: 700 }}>{error}</span> : null}
      </section>

      {!hasSearched ? (
        <div
          style={{
            border: "1px dashed #ccc",
            borderRadius: 12,
            padding: 24,
            color: "#666",
            background: "#fff",
          }}
        >
          Loading the default Missing Front queue...
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1780 }}>
            <thead>
              <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
                <th style={{ padding: 10 }}>Priority</th>
                <th style={{ padding: 10 }}>Card</th>
                <th style={{ padding: 10 }}>Product / Set</th>
                <th style={{ padding: 10 }}>Details</th>
                <th style={{ padding: 10 }}>Front Image</th>
                <th style={{ padding: 10 }}>Back Image</th>
                <th style={{ padding: 10 }}>Status / Actions</th>
              </tr>
            </thead>

            <tbody>
              {cards.map((card) => {
                const draft = drafts[card.id] ?? makeDraft(card);
                const priority = Number(card.bookValue ?? 0) * Number(card.quantityOwned ?? 0);
                const missingFront = !draft.frontImageUrl;
                const missingBack = !draft.backImageUrl;

                const productLabel = [
                  card.productSet?.product?.year ?? card.set?.year,
                  card.productSet?.product?.brand ?? card.set?.brand,
                  card.productSet?.name,
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <tr key={card.id} style={{ borderTop: "1px solid #e5e7eb", verticalAlign: "top" }}>
                    <td style={{ padding: 10, minWidth: 130 }}>
                      <div style={{ fontWeight: 900 }}>{formatMoney(priority)}</div>
                      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                        {formatMoney(card.bookValue)} × {card.quantityOwned}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        {missingFront ? (
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#991b1b" }}>
                            No front
                          </span>
                        ) : null}
                        {missingBack ? (
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#92400e" }}>
                            No back
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td style={{ padding: 10 }}>
                      <div style={{ display: "grid", gap: 8 }}>
                        <label style={{ display: "grid", gap: 4 }}>
                          <b style={{ fontSize: 12 }}>Player</b>
                          <input
                            value={draft.player}
                            onChange={(e) => patchDraft(card.id, { player: e.target.value })}
                            style={smallInputStyle(220)}
                          />
                        </label>

                        <label style={{ display: "grid", gap: 4 }}>
                          <b style={{ fontSize: 12 }}>Card #</b>
                          <input
                            value={draft.cardNumber}
                            onChange={(e) => patchDraft(card.id, { cardNumber: e.target.value })}
                            style={smallInputStyle(90)}
                          />
                        </label>

                        <div style={{ fontSize: 12, color: "#666" }}>
                          ID {card.id} · <a href={`/cards/${card.id}`}>Public card</a>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: 10, minWidth: 220 }}>
                      <div style={{ fontWeight: 800 }}>{productLabel || "No product set"}</div>
                      {card.productSet?.id ? (
                        <div style={{ fontSize: 12, marginTop: 6 }}>
                          <a href={`/admin/product-sets/${card.productSet.id}`}>Open product set admin</a>
                        </div>
                      ) : null}
                    </td>

                    <td style={{ padding: 10 }}>
                      <div style={{ display: "grid", gap: 8 }}>
                        <label style={{ display: "grid", gap: 4 }}>
                          <b style={{ fontSize: 12 }}>Team</b>
                          <input
                            value={draft.team}
                            onChange={(e) => patchDraft(card.id, { team: e.target.value })}
                            style={smallInputStyle(160)}
                          />
                        </label>

                        <label style={{ display: "grid", gap: 4 }}>
                          <b style={{ fontSize: 12 }}>Subset</b>
                          <input
                            value={draft.subset}
                            onChange={(e) => patchDraft(card.id, { subset: e.target.value })}
                            style={smallInputStyle(160)}
                          />
                        </label>

                        <label style={{ display: "grid", gap: 4 }}>
                          <b style={{ fontSize: 12 }}>Variant</b>
                          <input
                            value={draft.variant}
                            onChange={(e) => patchDraft(card.id, { variant: e.target.value })}
                            style={smallInputStyle(160)}
                          />
                        </label>

                        <label style={{ display: "grid", gap: 4 }}>
                          <b style={{ fontSize: 12 }}>Book</b>
                          <input
                            value={draft.bookValue}
                            onChange={(e) => patchDraft(card.id, { bookValue: e.target.value })}
                            style={smallInputStyle(90)}
                          />
                        </label>
                      </div>
                    </td>

                    <td style={{ padding: 10 }}>
                      <DropImageBox
                        label="Front"
                        imageUrl={draft.frontImageUrl}
                        uploading={!!uploading[`${card.id}-front`]}
                        onUrlChange={(url) => patchDraft(card.id, { frontImageUrl: url })}
                        onUpload={(file) => uploadImage(card.id, "front", file)}
                      />
                    </td>

                    <td style={{ padding: 10 }}>
                      <DropImageBox
                        label="Back"
                        imageUrl={draft.backImageUrl}
                        uploading={!!uploading[`${card.id}-back`]}
                        onUrlChange={(url) => patchDraft(card.id, { backImageUrl: url })}
                        onUpload={(file) => uploadImage(card.id, "back", file)}
                      />
                    </td>

                    <td style={{ padding: 10, minWidth: 160 }}>
                      <button
                        type="button"
                        onClick={() => saveOne(card.id)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid #111",
                          background: "#111",
                          color: "white",
                          fontWeight: 700,
                        }}
                      >
                        Save Row
                      </button>

                      <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
                        Current book: {formatMoney(card.bookValue)}
                      </div>

                      {rowStatus[card.id] ? (
                        <div
                          style={{
                            fontSize: 12,
                            color: rowStatus[card.id].includes("failed") ? "#991b1b" : "#065f46",
                            fontWeight: 800,
                            marginTop: 8,
                          }}
                        >
                          {rowStatus[card.id]}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}

              {cards.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 20, color: "#666" }}>
                    No matching owned cards found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}