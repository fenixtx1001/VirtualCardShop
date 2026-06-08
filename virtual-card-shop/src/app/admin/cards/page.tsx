"use client";

import { useMemo, useState } from "react";

type Gradeability = "COMMON" | "GREAT" | "ICONIC";

type AdminCard = {
  id: number;
  cardNumber: string;
  player: string;
  team: string | null;
  subset: string | null;
  variant: string | null;
  bookValue: number;
  frontImageUrl: string | null;
  backImageUrl: string | null;
  gradeabilityOverride: Gradeability | null;
  productSet: {
    id: number | string;
    name: string | null;
    defaultGradeability: Gradeability;
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
  subset: string;
  variant: string;
  bookValue: string;
  frontImageUrl: string;
  backImageUrl: string;
  gradeabilityOverride: Gradeability | "";
};

const gradeOptions: Array<{ value: Gradeability | ""; label: string }> = [
  { value: "", label: "Use set default" },
  { value: "COMMON", label: "Common" },
  { value: "GREAT", label: "Great" },
  { value: "ICONIC", label: "Iconic" },
];

function labelGradeability(value: Gradeability | null | undefined) {
  if (value === "ICONIC") return "Iconic";
  if (value === "GREAT") return "Great";
  return "Common";
}

function formatMoney(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return `$${n.toFixed(2)}`;
}

function getEffectiveTier(card: AdminCard): Gradeability {
  return card.gradeabilityOverride ?? card.productSet?.defaultGradeability ?? "COMMON";
}

function makeDraft(card: AdminCard): DraftCard {
  return {
    cardNumber: card.cardNumber ?? "",
    player: card.player ?? "",
    team: card.team ?? "",
    subset: card.subset ?? "",
    variant: card.variant ?? "",
    bookValue: String(card.bookValue ?? ""),
    frontImageUrl: card.frontImageUrl ?? "",
    backImageUrl: card.backImageUrl ?? "",
    gradeabilityOverride: card.gradeabilityOverride ?? "",
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
          onDragOver={(e) => {
            e.preventDefault();
          }}
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

export default function AdminCardsPage() {
  const [search, setSearch] = useState("");
  const [cards, setCards] = useState<AdminCard[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});
  const [drafts, setDrafts] = useState<Record<number, DraftCard>>({});
  const [tierFilter, setTierFilter] = useState<Gradeability | "ALL">("ALL");
  const [missingImagesOnly, setMissingImagesOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingMessage, setSavingMessage] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [hasSearched, setHasSearched] = useState(false);

  async function loadCards(searchText = search, missingOnly = missingImagesOnly) {
    setLoading(true);
    setError("");
    setSavingMessage("");
    setHasSearched(true);

    try {
      const params = new URLSearchParams();
      params.set("search", searchText);
      if (missingOnly) params.set("missingImagesOnly", "true");

      const res = await fetch(`/api/admin/cards?${params.toString()}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to load cards");
      }

      const nextCards = data.cards ?? [];
      setCards(nextCards);

      const nextDrafts: Record<number, DraftCard> = {};
      for (const card of nextCards) {
        nextDrafts[card.id] = makeDraft(card);
      }

      setDrafts(nextDrafts);
      setSelectedIds({});
    } catch (e: any) {
      setError(e?.message ?? "Failed to load cards");
    } finally {
      setLoading(false);
    }
  }

  const filteredCards = useMemo(() => {
    if (tierFilter === "ALL") return cards;
    return cards.filter((card) => getEffectiveTier(card) === tierFilter);
  }, [cards, tierFilter]);

  const selectedCount = useMemo(
    () => Object.values(selectedIds).filter(Boolean).length,
    [selectedIds]
  );

  function patchDraft(cardId: number, patch: Partial<DraftCard>) {
    setDrafts((prev) => ({
      ...prev,
      [cardId]: {
        ...prev[cardId],
        ...patch,
      },
    }));
  }

  async function uploadImage(cardId: number, side: "front" | "back", file: File) {
    const key = `${cardId}-${side}`;
    setUploading((prev) => ({ ...prev, [key]: true }));
    setError("");

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

      setSavingMessage(`Uploaded ${side} image for card ${cardId}. Remember to save row.`);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setUploading((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function saveOne(cardId: number) {
    const draft = drafts[cardId];
    if (!draft) return;

    setSavingMessage(`Saving card ${cardId}...`);
    setError("");

    try {
      const res = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cardNumber: draft.cardNumber,
          player: draft.player,
          team: draft.team,
          subset: draft.subset,
          variant: draft.variant,
          bookValue: draft.bookValue,
          frontImageUrl: draft.frontImageUrl,
          backImageUrl: draft.backImageUrl,
          gradeabilityOverride: draft.gradeabilityOverride,
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

      setSavingMessage("Saved.");
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    }
  }

  async function applyBulk(overrideValue: Gradeability | "") {
    const ids = Object.entries(selectedIds)
      .filter(([, checked]) => checked)
      .map(([id]) => Number(id));

    if (ids.length === 0) {
      setError("Select at least one card first.");
      return;
    }

    setError("");
    setSavingMessage(`Saving ${ids.length} cards...`);

    try {
      for (const id of ids) {
        const res = await fetch(`/api/cards/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            gradeabilityOverride: overrideValue,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error ?? `Save failed for card ${id}`);
        }

        setCards((prev) =>
          prev.map((card) =>
            card.id === id
              ? {
                  ...card,
                  gradeabilityOverride: data.card.gradeabilityOverride ?? null,
                }
              : card
          )
        );

        setDrafts((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            gradeabilityOverride: data.card.gradeabilityOverride ?? "",
          },
        }));
      }

      setSavingMessage(`Saved ${ids.length} cards.`);
    } catch (e: any) {
      setError(e?.message ?? "Bulk save failed");
    }
  }

  function toggleVisible(checked: boolean) {
    const next = { ...selectedIds };
    for (const card of filteredCards) {
      next[card.id] = checked;
    }
    setSelectedIds(next);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <div style={{ marginBottom: 18 }}>
        <a href="/admin">← Back to Admin</a>
      </div>

      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Admin: Card Maintenance Center</h1>

      <p style={{ maxWidth: 980, marginBottom: 20 }}>
        Search across all cards, repair missing images, update card attributes, and manage VCS tier overrides.
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
            loadCards(search, missingImagesOnly);
          }}
          style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ken Griffey Jr., Yankees, card #, set..."
              style={{
                width: 360,
                maxWidth: "80vw",
                padding: "9px 10px",
                border: "1px solid #ccc",
                borderRadius: 8,
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Effective VCS Tier</span>
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as Gradeability | "ALL")}
              style={{
                padding: "9px 10px",
                border: "1px solid #ccc",
                borderRadius: 8,
              }}
            >
              <option value="ALL">All</option>
              <option value="COMMON">Common</option>
              <option value="GREAT">Great</option>
              <option value="ICONIC">Iconic</option>
            </select>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", paddingBottom: 10 }}>
            <input
              type="checkbox"
              checked={missingImagesOnly}
              onChange={(e) => setMissingImagesOnly(e.target.checked)}
            />
            <b>Missing images only</b>
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
            onClick={() => {
              setSearch("");
              setTierFilter("ALL");
              setMissingImagesOnly(false);
              setCards([]);
              setDrafts({});
              setSelectedIds({});
              setSavingMessage("");
              setError("");
              setHasSearched(false);
            }}
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
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <b>{selectedCount} selected</b>

        <button type="button" onClick={() => applyBulk("")}>
          Set selected: Use set default
        </button>
        <button type="button" onClick={() => applyBulk("COMMON")}>
          Set selected: Common
        </button>
        <button type="button" onClick={() => applyBulk("GREAT")}>
          Set selected: Great
        </button>
        <button type="button" onClick={() => applyBulk("ICONIC")}>
          Set selected: Iconic
        </button>

        {savingMessage ? <span style={{ color: "#065f46", fontWeight: 700 }}>{savingMessage}</span> : null}
        {error ? <span style={{ color: "#991b1b", fontWeight: 700 }}>{error}</span> : null}
      </section>

      <div style={{ marginBottom: 10 }}>
        Showing <b>{filteredCards.length}</b> cards {cards.length !== filteredCards.length ? `of ${cards.length}` : ""}.
      </div>

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
          Search for a player, team, card number, or set to begin. No cards are loaded until you search.
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1900 }}>
            <thead>
              <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
                <th style={{ padding: 10 }}>
                  <input
                    type="checkbox"
                    checked={filteredCards.length > 0 && filteredCards.every((card) => selectedIds[card.id])}
                    onChange={(e) => toggleVisible(e.target.checked)}
                  />
                </th>
                <th style={{ padding: 10 }}>Card</th>
                <th style={{ padding: 10 }}>Product / Set</th>
                <th style={{ padding: 10 }}>Details</th>
                <th style={{ padding: 10 }}>VCS Tier</th>
                <th style={{ padding: 10 }}>Front Image</th>
                <th style={{ padding: 10 }}>Back Image</th>
                <th style={{ padding: 10 }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredCards.map((card) => {
                const draft = drafts[card.id] ?? makeDraft(card);
                const effectiveTier = getEffectiveTier(card);
                const productLabel = [
                  card.productSet?.product?.year ?? card.set?.year,
                  card.productSet?.product?.brand ?? card.set?.brand,
                  card.productSet?.name,
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <tr key={card.id} style={{ borderTop: "1px solid #e5e7eb", verticalAlign: "top" }}>
                    <td style={{ padding: 10 }}>
                      <input
                        type="checkbox"
                        checked={!!selectedIds[card.id]}
                        onChange={(e) =>
                          setSelectedIds((prev) => ({
                            ...prev,
                            [card.id]: e.target.checked,
                          }))
                        }
                      />
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

                      <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                        Set default: {labelGradeability(card.productSet?.defaultGradeability)}
                      </div>
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
                      <div style={{ display: "grid", gap: 8 }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: "fit-content",
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: "1px solid #ccc",
                            background:
                              effectiveTier === "ICONIC"
                                ? "#fff7ed"
                                : effectiveTier === "GREAT"
                                  ? "#eff6ff"
                                  : "#f8fafc",
                            fontWeight: 800,
                          }}
                        >
                          {labelGradeability(effectiveTier)}
                        </span>

                        <select
                          value={draft.gradeabilityOverride}
                          onChange={(e) =>
                            patchDraft(card.id, {
                              gradeabilityOverride: e.target.value as Gradeability | "",
                            })
                          }
                          style={{
                            padding: "8px 10px",
                            border: "1px solid #ccc",
                            borderRadius: 8,
                            width: 170,
                          }}
                        >
                          {gradeOptions.map((opt) => (
                            <option key={opt.value || "default"} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
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

                    <td style={{ padding: 10 }}>
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
                    </td>
                  </tr>
                );
              })}

              {filteredCards.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 20, color: "#666" }}>
                    No cards found.
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