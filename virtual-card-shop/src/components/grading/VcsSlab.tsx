"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import styles from "./VcsSlab.module.css";

type Gradeability = "COMMON" | "GREAT" | "ICONIC";

export type SlabRegistry = {
  cardId?: number | null;
  gradedAt?: string | null;
  atGrade?: number | null;
  totalGraded?: number | null;
  totalOwned?: number | null;
};

export type VcsSlabProps = {
  player: string;
  cardNumber: string;
  setName: string;
  team?: string | null;

  grade: number;

  /*
   * Retained as optional compatibility props because older grading
   * and Card Details callers still pass them. They are intentionally
   * not rendered anywhere in the slab UI.
   */
  gradeability?: Gradeability | string | null;
  gradeabilityLabel?: string | null;

  valueCents?: number | null;
  quantity?: number | null;

  imageUrl?: string | null;
  backImageUrl?: string | null;

  flipped?: boolean;
  onFlip?: () => void;

  registry?: SlabRegistry | null;
};

function gradeLabel(grade: number) {
  if (grade >= 10) return "Gem Mint";
  if (grade >= 9) return "Mint";
  if (grade >= 8) return "Near Mint";
  if (grade >= 7) return "Excellent";
  return "VCS Grade";
}

function gradeTone(grade: number) {
  if (grade >= 10) {
    return {
      a: "#7d5b18",
      b: "#d9bd72",
      c: "#f3e4b7",
      ink: "#241900",
    };
  }

  if (grade >= 9) {
    return {
      a: "#365d3c",
      b: "#83a87f",
      c: "#e3efe0",
      ink: "#102716",
    };
  }

  if (grade >= 8) {
    return {
      a: "#365978",
      b: "#7e9db9",
      c: "#e0ebf5",
      ink: "#102336",
    };
  }

  if (grade >= 7) {
    return {
      a: "#545a61",
      b: "#9aa0a6",
      c: "#edf0f2",
      ink: "#1f2327",
    };
  }

  return {
    a: "#6a4a38",
    b: "#ad8167",
    c: "#f0ded2",
    ink: "#2d190f",
  };
}

function formatDate(value?: string | null) {
  if (!value) return "VCS Certified";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return "VCS Certified";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CardImage({
  src,
  alt,
  fallback,
}: {
  src?: string | null;
  alt: string;
  fallback: string;
}) {
  const clean = (src ?? "").trim();
  const [landscape, setLandscape] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLandscape(false);
    setFailed(false);
  }, [clean]);

  if (!clean || failed) {
    return (
      <div className={styles.noImage}>
        <strong>VCS</strong>
        <span>{fallback}</span>
      </div>
    );
  }

  return (
    <img
      src={clean}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      onLoad={(event) => {
        const img = event.currentTarget;
        setLandscape(img.naturalWidth > img.naturalHeight);
      }}
      className={landscape ? styles.cardLandscape : styles.cardImage}
    />
  );
}

function FrontLabel({
  player,
  cardNumber,
  setName,
  team,
  grade,
}: Pick<
  VcsSlabProps,
  "player" | "cardNumber" | "setName" | "team" | "grade"
>) {
  return (
    <div className={styles.label}>
      <div className={styles.identity}>
        <div className={styles.brandLine}>
          <span className={styles.vcsMark}>VCS</span>
          <span>GRADING</span>
        </div>

        <strong className={styles.player}>{player}</strong>

        <span className={styles.setName}>{setName}</span>

        <span className={styles.cardLine}>
          #{cardNumber}
          {team?.trim() ? ` · ${team.trim()}` : ""}
        </span>
      </div>

      <div className={styles.gradeBlock}>
        <span>VCS</span>
        <b>{grade}</b>
        <small>{gradeLabel(grade)}</small>
      </div>
    </div>
  );
}

function RegistryLabel({
  player,
  cardNumber,
  setName,
  team,
  grade,
  registry,
}: Pick<
  VcsSlabProps,
  "player" | "cardNumber" | "setName" | "team" | "grade" | "registry"
>) {
  const popAtGrade =
    typeof registry?.atGrade === "number" ? registry.atGrade : null;

  const totalGraded =
    typeof registry?.totalGraded === "number"
      ? registry.totalGraded
      : null;

  return (
    <div className={`${styles.label} ${styles.registryLabel}`}>
      <div className={styles.identity}>
        <div className={styles.brandLine}>
          <span className={styles.vcsMark}>VCS</span>
          <span>REGISTRY</span>
        </div>

        <strong className={styles.player}>{player}</strong>

        <span className={styles.setName}>
          {setName} · #{cardNumber}
        </span>

        <span className={styles.cardLine}>
          {registry?.cardId ? `CARD ${registry.cardId}` : "VCS CERTIFIED"}
          {team?.trim() ? ` · ${team.trim()}` : ""}
        </span>

        <div className={styles.registryFacts}>
          <span>{formatDate(registry?.gradedAt)}</span>

          {popAtGrade != null ? (
            <span>
              POP {popAtGrade}
              {totalGraded != null ? ` · ${totalGraded} GRADED` : ""}
            </span>
          ) : (
            <span>POPULATION · VCS REGISTRY</span>
          )}
        </div>
      </div>

      <div className={styles.gradeBlock}>
        <span>GRADE</span>
        <b>{grade}</b>
        <small>Authenticated</small>
      </div>
    </div>
  );
}

function SlabFace({
  side,
  player,
  cardNumber,
  setName,
  team,
  grade,
  image,
  registry,
}: {
  side: "front" | "back";
  player: string;
  cardNumber: string;
  setName: string;
  team?: string | null;
  grade: number;
  image?: string | null;
  registry?: SlabRegistry | null;
}) {
  return (
    <div
      className={`${styles.face} ${
        side === "back" ? styles.backFace : styles.frontFace
      }`}
    >
      <div className={styles.case}>
        {side === "front" ? (
          <FrontLabel
            player={player}
            cardNumber={cardNumber}
            setName={setName}
            team={team}
            grade={grade}
          />
        ) : (
          <RegistryLabel
            player={player}
            cardNumber={cardNumber}
            setName={setName}
            team={team}
            grade={grade}
            registry={registry}
          />
        )}

        <div className={styles.cardBay}>
          <div className={styles.cardMount}>
            <CardImage
              src={image}
              alt={`${player} ${side === "front" ? "front" : "back"}`}
              fallback={side === "front" ? "NO FRONT IMAGE" : "NO BACK IMAGE"}
            />
          </div>
        </div>

        <div className={styles.seal}>
          <span>VIRTUAL CARD SHOP</span>
          <i />
          <span>{side === "front" ? "CERTIFIED" : "REGISTRY"}</span>
        </div>
      </div>

      <div className={styles.reflection} />
    </div>
  );
}

export default function VcsSlab({
  player,
  cardNumber,
  setName,
  team,
  grade,
  imageUrl,
  backImageUrl,
  flipped = false,
  onFlip,
  registry,
}: VcsSlabProps) {
  const tone = gradeTone(grade);

  const slabStyle = {
    "--grade-a": tone.a,
    "--grade-b": tone.b,
    "--grade-c": tone.c,
    "--grade-ink": tone.ink,
  } as CSSProperties;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!onFlip) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onFlip();
    }
  }

  return (
    <div
      className={`${styles.shell} ${onFlip ? styles.interactive : ""}`}
      style={slabStyle}
      onClick={onFlip}
      onKeyDown={onKeyDown}
      role={onFlip ? "button" : undefined}
      tabIndex={onFlip ? 0 : undefined}
      aria-label={
        onFlip
          ? `${flipped ? "Show front of" : "Show back of"} ${player} VCS ${grade} slab`
          : undefined
      }
    >
      <div
        className={`${styles.rotor} ${flipped ? styles.flipped : ""}`}
      >
        <SlabFace
          side="front"
          player={player}
          cardNumber={cardNumber}
          setName={setName}
          team={team}
          grade={grade}
          image={imageUrl}
          registry={registry}
        />

        <SlabFace
          side="back"
          player={player}
          cardNumber={cardNumber}
          setName={setName}
          team={team}
          grade={grade}
          image={backImageUrl}
          registry={registry}
        />
      </div>
    </div>
  );
}
