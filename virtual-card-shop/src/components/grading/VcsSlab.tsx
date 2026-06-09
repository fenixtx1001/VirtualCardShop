"use client";

type Gradeability = "COMMON" | "GREAT" | "ICONIC";

export type VcsSlabProps = {
  player: string;
  cardNumber: string;
  setName: string;
  team?: string | null;
  grade: number;
  gradeability?: Gradeability | string | null;
  gradeabilityLabel?: string | null;
  valueCents?: number | null;
  quantity?: number | null;
  imageUrl?: string | null;
};

const tierStyles: Record<
  Gradeability,
  {
    label: string;
    accent: string;
    accentSoft: string;
    foil: string;
  }
> = {
  COMMON: {
    label: "Common",
    accent: "#5f6875",
    accentSoft: "#eef0f3",
    foil: "linear-gradient(135deg, #d8dde4, #ffffff 45%, #aeb6c2)",
  },
  GREAT: {
    label: "Great",
    accent: "#174d8f",
    accentSoft: "#eaf3ff",
    foil: "linear-gradient(135deg, #8dbdf5, #ffffff 45%, #174d8f)",
  },
  ICONIC: {
    label: "Iconic",
    accent: "#9b6a08",
    accentSoft: "#fff5d7",
    foil: "linear-gradient(135deg, #d39b22, #fff2a8 42%, #8d5b00)",
  },
};

function normalizeTier(value: VcsSlabProps["gradeability"]): Gradeability {
  if (value === "GREAT" || value === "ICONIC" || value === "COMMON") return value;
  return "COMMON";
}

function getGradeTone(grade: number) {
  if (grade >= 10) {
    return {
      background: "linear-gradient(135deg, #7a5200, #f9d36b 45%, #fff4bf)",
      color: "#2a1a00",
      shadow: "0 0 26px rgba(212, 161, 34, 0.55)",
      label: "Gem Mint",
    };
  }

  if (grade >= 9) {
    return {
      background: "linear-gradient(135deg, #145c2a, #9be7aa 48%, #f2fff4)",
      color: "#062a12",
      shadow: "0 0 20px rgba(42, 145, 72, 0.32)",
      label: "Mint",
    };
  }

  if (grade >= 8) {
    return {
      background: "linear-gradient(135deg, #16477d, #a9d2ff 48%, #f0f8ff)",
      color: "#071f3a",
      shadow: "0 0 18px rgba(22, 71, 125, 0.25)",
      label: "Near Mint",
    };
  }

  if (grade >= 7) {
    return {
      background: "linear-gradient(135deg, #555c66, #d9dee5 48%, #ffffff)",
      color: "#20242a",
      shadow: "0 0 14px rgba(0, 0, 0, 0.16)",
      label: "Excellent",
    };
  }

  return {
    background: "linear-gradient(135deg, #765039, #d3a17f 48%, #fff1e6)",
    color: "#2b160a",
    shadow: "0 0 14px rgba(118, 80, 57, 0.18)",
    label: "VCS Grade",
  };
}

function VcsLogo({ accent }: { accent: string }) {
  return (
    <div
      aria-label="VCS Grading"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        minWidth: 0,
      }}
    >
      <svg width="42" height="32" viewBox="0 0 84 64" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="vcsLogoFoil" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="38%" stopColor={accent} />
            <stop offset="72%" stopColor="#111827" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
        </defs>
        <path
          d="M42 4 75 16v18c0 13.5-8.9 21.8-33 26C17.9 55.8 9 47.5 9 34V16L42 4Z"
          fill="url(#vcsLogoFoil)"
          stroke="#111827"
          strokeWidth="3"
        />
        <path d="M24 22h9l9 17 9-17h9L46 47h-8L24 22Z" fill="#fff" opacity="0.96" />
        <path d="M22 18h40" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
      </svg>

      <div style={{ minWidth: 0, lineHeight: 1 }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 1000,
            letterSpacing: 1.1,
            color: "#111827",
            whiteSpace: "nowrap",
          }}
        >
          VCS
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 950,
            letterSpacing: 1.8,
            color: accent,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          Grading
        </div>
      </div>
    </div>
  );
}

export default function VcsSlab({
  player,
  cardNumber,
  setName,
  team,
  grade,
  gradeability,
  imageUrl,
}: VcsSlabProps) {
  const tierKey = normalizeTier(gradeability);
  const tier = tierStyles[tierKey];
  const gradeTone = getGradeTone(grade);
  const cleanImageUrl = (imageUrl ?? "").trim();

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 390,
        padding: 13,
        borderRadius: 34,
        background:
          "linear-gradient(145deg, rgba(255,255,255,0.92), rgba(205,214,225,0.84) 46%, rgba(255,255,255,0.94))",
        border: "1px solid rgba(130, 143, 160, 0.65)",
        boxShadow:
          "0 28px 70px rgba(0,0,0,0.24), inset 0 2px 8px rgba(255,255,255,0.9), inset 0 -8px 18px rgba(80,92,110,0.13)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 8,
          borderRadius: 29,
          pointerEvents: "none",
          background:
            "linear-gradient(120deg, rgba(255,255,255,0.55), rgba(255,255,255,0.05) 34%, rgba(255,255,255,0.32) 36%, rgba(255,255,255,0.02) 58%)",
          zIndex: 3,
        }}
      />

      <div
        style={{
          borderRadius: 25,
          border: "1px solid rgba(95, 107, 125, 0.62)",
          background: "linear-gradient(180deg, #f9fafb, #e7ecf2)",
          overflow: "hidden",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 86px",
            gap: 10,
            alignItems: "stretch",
            padding: 11,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(241,245,249,0.96))",
            borderBottom: "1px solid rgba(148, 163, 184, 0.55)",
          }}
        >
          <div
            style={{
              borderRadius: 16,
              border: "1px solid rgba(148, 163, 184, 0.42)",
              background: "#ffffff",
              padding: "9px 10px",
              minWidth: 0,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
            }}
          >
            <VcsLogo accent={tier.accent} />

            <div
              style={{
                marginTop: 8,
                height: 1,
                background:
                  "linear-gradient(90deg, transparent, rgba(17,24,39,0.22), transparent)",
              }}
            />

            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                fontWeight: 1000,
                color: "#111827",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={player}
            >
              {player}
            </div>

            <div
              style={{
                marginTop: 3,
                fontSize: 11,
                fontWeight: 850,
                color: "#4b5563",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={`${setName} #${cardNumber}`}
            >
              {setName} #{cardNumber}
            </div>

            <div
              style={{
                marginTop: 3,
                fontSize: 10,
                fontWeight: 850,
                color: "#6b7280",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {team?.trim() ? team : "Virtual Card Shop"}
            </div>
          </div>

          <div
            style={{
              borderRadius: 17,
              border: "1px solid rgba(17, 24, 39, 0.42)",
              background: gradeTone.background,
              color: gradeTone.color,
              boxShadow: gradeTone.shadow,
              display: "grid",
              placeItems: "center",
              textAlign: "center",
              padding: 7,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(120deg, rgba(255,255,255,0.58), transparent 42%, rgba(255,255,255,0.28) 44%, transparent 62%)",
                opacity: 0.75,
              }}
            />

            <div style={{ position: "relative", zIndex: 1 }}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 1000,
                  letterSpacing: 1.3,
                  textTransform: "uppercase",
                }}
              >
                Grade
              </div>
              <div
                style={{
                  fontSize: 38,
                  fontWeight: 1000,
                  lineHeight: 0.95,
                  letterSpacing: -1.5,
                }}
              >
                {grade}
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: 8,
                  fontWeight: 1000,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                {gradeTone.label}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: 16,
            background:
              "radial-gradient(circle at 50% 18%, rgba(255,255,255,0.92), rgba(215,222,232,0.92) 48%, rgba(192,202,215,0.92))",
          }}
        >
          <div
            style={{
              borderRadius: 21,
              padding: 11,
              background:
                "linear-gradient(145deg, rgba(128,140,158,0.50), rgba(255,255,255,0.75) 45%, rgba(92,105,124,0.45))",
              border: "1px solid rgba(100, 116, 139, 0.48)",
              boxShadow:
                "inset 0 3px 10px rgba(0,0,0,0.13), inset 0 -2px 7px rgba(255,255,255,0.65)",
            }}
          >
            <div
              style={{
                borderRadius: 15,
                background: "#ffffff",
                padding: 8,
                border: "1px solid rgba(203, 213, 225, 0.9)",
                boxShadow: "0 10px 25px rgba(15,23,42,0.18)",
              }}
            >
              {cleanImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cleanImageUrl}
                  alt={`${player} VCS graded card`}
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: "100%",
                    aspectRatio: "2.5 / 3.5",
                    objectFit: "cover",
                    display: "block",
                    borderRadius: 10,
                    border: "1px solid rgba(229,231,235,0.95)",
                    background: "#f8fafc",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "2.5 / 3.5",
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 10,
                    border: "1px dashed #aeb6c2",
                    background: "#f8fafc",
                    color: "#64748b",
                    fontWeight: 950,
                  }}
                >
                  No image
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
