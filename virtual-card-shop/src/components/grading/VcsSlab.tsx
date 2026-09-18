"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
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
   * Compatibility props retained because older grading and
   * Card Details callers still pass them.
   */
  gradeability?: Gradeability | string | null;
  gradeabilityLabel?: string | null;

  valueCents?: number | null;
  quantity?: number | null;

  imageUrl?: string | null;
  backImageUrl?: string | null;

  /*
   * Controlled mode is still supported for screens like the
   * fullscreen Slab Gallery. If these are omitted, the slab
   * manages its own front/back state automatically.
   */
  flipped?: boolean;
  onFlip?: () => void;

  registry?: SlabRegistry | null;
};

type PopulationLookupResponse = {
  ok?: boolean;
  card?: {
    backImageUrl?: string | null;
  };
  population?: {
    totalOwned?: number | null;
    graded?: number | null;
    gradeBreakdown?: Array<{
      grade: number;
      quantity: number;
    }>;
  };
};

type AutoRegistry = {
  atGrade: number | null;
  totalGraded: number | null;
  totalOwned: number | null;
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
      a: "#725318",
      b: "#d7b861",
      c: "#f7e6a8",
      ink: "#241900",
    };
  }

  if (grade >= 9) {
    return {
      a: "#33583a",
      b: "#82a77d",
      c: "#e4efe1",
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

  if (!Number.isFinite(date.getTime())) {
    return "VCS Certified";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatNumber(value: number | null | undefined) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return value.toLocaleString("en-US");
}

/*
 * We intentionally do not truncate slab-label text.
 *
 * Instead, unusually long combinations reduce the label's
 * typography scale so the complete player / set / card identity
 * remains visible inside the physical-label area.
 */
function labelScale(
  player: string,
  setName: string,
  cardNumber: string,
  team?: string | null
) {
  const complexity =
    player.trim().length * 1.25 +
    setName.trim().length * 0.72 +
    cardNumber.trim().length * 0.4 +
    (team?.trim().length ?? 0) * 0.45;

  if (complexity > 115) return 0.7;
  if (complexity > 96) return 0.76;
  if (complexity > 80) return 0.82;
  if (complexity > 64) return 0.88;
  if (complexity > 50) return 0.94;

  return 1;
}

function labelStyle(
  player: string,
  setName: string,
  cardNumber: string,
  team?: string | null
) {
  return {
    "--label-scale": String(
      labelScale(
        player,
        setName,
        cardNumber,
        team
      )
    ),
  } as CSSProperties;
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

  const [landscape, setLandscape] =
    useState(false);
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
    <div className={styles.cardViewport}>
      <img
        src={clean}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        onLoad={(event) => {
          const img = event.currentTarget;

          setLandscape(
            img.naturalWidth > img.naturalHeight
          );
        }}
        className={
          landscape
            ? styles.cardLandscape
            : styles.cardImage
        }
      />
    </div>
  );
}

function BrandLockup({
  mode,
}: {
  mode: "GRADING" | "REGISTRY";
}) {
  return (
    <div className={styles.brandLine}>
      <span
        className={styles.brandShield}
        aria-hidden="true"
      >
        <i />
        <b>V</b>
      </span>

      <span className={styles.brandWordmark}>
        <strong>VCS</strong>
        <small>{mode}</small>
      </span>
    </div>
  );
}

function SecurityHologram() {
  return (
    <div
      className={styles.hologram}
      aria-label="VCS authenticity hologram"
      title="VCS authenticity hologram"
    >
      <span>VCS</span>
      <small>AUTH</small>
    </div>
  );
}

function GradePlaque({
  grade,
}: {
  grade: number;
}) {
  return (
    <div className={styles.gradeBlock}>
      <span>VCS</span>
      <b>{grade}</b>
      <small>{gradeLabel(grade)}</small>
    </div>
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
  | "player"
  | "cardNumber"
  | "setName"
  | "team"
  | "grade"
>) {
  return (
    <div
      className={styles.label}
      style={labelStyle(
        player,
        setName,
        cardNumber,
        team
      )}
    >
      <div className={styles.identity}>
        <BrandLockup mode="GRADING" />

        <strong className={styles.player}>
          {player}
        </strong>

        <span className={styles.setName}>
          {setName}
        </span>

        <span className={styles.cardLine}>
          <b>#{cardNumber}</b>

          {team?.trim() ? (
            <>
              <i>·</i>
              <span>{team.trim()}</span>
            </>
          ) : null}
        </span>
      </div>

      <GradePlaque grade={grade} />
    </div>
  );
}

function RegistryLabel({
  player,
  cardNumber,
  setName,
  grade,
  registry,
}: Pick<
  VcsSlabProps,
  | "player"
  | "cardNumber"
  | "setName"
  | "grade"
  | "registry"
>) {
  const popAtGrade = formatNumber(
    registry?.atGrade
  );

  const totalGraded = formatNumber(
    registry?.totalGraded
  );

  const totalOwned = formatNumber(
    registry?.totalOwned
  );

  return (
    <div
      className={`${styles.label} ${styles.registryLabel}`}
      style={labelStyle(
        player,
        setName,
        cardNumber
      )}
    >
      <div className={styles.identity}>
        <BrandLockup mode="REGISTRY" />

        <strong className={styles.player}>
          {player}
        </strong>

        <span className={styles.setName}>
          {setName} · #{cardNumber}
        </span>

        <div className={styles.registryMeta}>
          <span>
            {registry?.cardId
              ? `REG ${registry.cardId}`
              : "VCS CERTIFIED"}
          </span>

          <span>
            {formatDate(registry?.gradedAt)}
          </span>
        </div>

        <div className={styles.registryPopulation}>
          {popAtGrade != null ? (
            <strong>POP {popAtGrade}</strong>
          ) : (
            <strong>POP —</strong>
          )}

          {totalGraded != null ? (
            <span>{totalGraded} graded</span>
          ) : null}

          {totalOwned != null ? (
            <span>{totalOwned} known</span>
          ) : null}
        </div>
      </div>

      <SecurityHologram />

      <GradePlaque grade={grade} />
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
        side === "back"
          ? styles.backFace
          : styles.frontFace
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
            grade={grade}
            registry={registry}
          />
        )}

        <div className={styles.cardBay}>
          <div className={styles.cardMount}>
            <CardImage
              src={image}
              alt={`${player} ${
                side === "front"
                  ? "front"
                  : "back"
              }`}
              fallback={
                side === "front"
                  ? "NO FRONT IMAGE"
                  : "NO BACK IMAGE"
              }
            />
          </div>
        </div>

        <div className={styles.seal}>
          <span>VIRTUAL CARD SHOP</span>
          <i />
          <span>
            {side === "front"
              ? "CERTIFIED"
              : "AUTHENTICATED"}
          </span>
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
  flipped: controlledFlipped,
  onFlip,
  registry,
}: VcsSlabProps) {
  const tone = gradeTone(grade);

  const [internalFlipped, setInternalFlipped] =
    useState(false);

  const [autoBackImageUrl, setAutoBackImageUrl] =
    useState<string | null>(null);

  const [autoRegistry, setAutoRegistry] =
    useState<AutoRegistry | null>(null);

  const lookupStatus = useRef<
    "idle" | "loading" | "done"
  >("idle");

  const flipped =
    typeof controlledFlipped === "boolean"
      ? controlledFlipped
      : internalFlipped;

  const effectiveBackImageUrl =
    (backImageUrl ?? "").trim() ||
    autoBackImageUrl ||
    null;

  const effectiveRegistry: SlabRegistry = {
    cardId: registry?.cardId ?? null,
    gradedAt: registry?.gradedAt ?? null,

    atGrade:
      registry?.atGrade ??
      autoRegistry?.atGrade ??
      null,

    totalGraded:
      registry?.totalGraded ??
      autoRegistry?.totalGraded ??
      null,

    totalOwned:
      registry?.totalOwned ??
      autoRegistry?.totalOwned ??
      null,
  };

  useEffect(() => {
    /*
     * A VcsSlab may be recycled between cards in a grid.
     * Never carry a reverse face or cached registry into
     * the next card.
     */
    setInternalFlipped(false);
    setAutoBackImageUrl(null);
    setAutoRegistry(null);
    lookupStatus.current = "idle";
  }, [registry?.cardId, grade]);

  const ensureReverseData = useCallback(async () => {
    const cardId = registry?.cardId;

    if (
      !cardId ||
      !Number.isInteger(cardId) ||
      cardId <= 0
    ) {
      return;
    }

    const alreadyHasEverything =
      Boolean((backImageUrl ?? "").trim()) &&
      registry?.atGrade != null &&
      registry?.totalGraded != null &&
      registry?.totalOwned != null;

    if (alreadyHasEverything) {
      lookupStatus.current = "done";
      return;
    }

    if (
      lookupStatus.current === "loading" ||
      lookupStatus.current === "done"
    ) {
      return;
    }

    lookupStatus.current = "loading";

    try {
      const response = await fetch(
        `/api/cards/${encodeURIComponent(
          String(cardId)
        )}/population`,
        {
          cache: "no-store",
        }
      );

      const data =
        (await response.json()) as PopulationLookupResponse;

      if (!response.ok || !data?.ok) {
        throw new Error(
          "Unable to load slab registry"
        );
      }

      const back =
        data.card?.backImageUrl?.trim() || null;

      if (back) {
        setAutoBackImageUrl(back);
      }

      const atGrade =
        data.population?.gradeBreakdown?.find(
          (bucket) => bucket.grade === grade
        )?.quantity ?? null;

      setAutoRegistry({
        atGrade,
        totalGraded:
          typeof data.population?.graded === "number"
            ? data.population.graded
            : null,
        totalOwned:
          typeof data.population?.totalOwned ===
          "number"
            ? data.population.totalOwned
            : null,
      });

      lookupStatus.current = "done";
    } catch {
      /*
       * A failed population lookup should never break
       * the physical slab or prevent flipping. Allow a
       * later flip to retry.
       */
      lookupStatus.current = "idle";
    }
  }, [
    backImageUrl,
    grade,
    registry?.atGrade,
    registry?.cardId,
    registry?.totalGraded,
    registry?.totalOwned,
  ]);

  const toggleFlip = useCallback(() => {
    const next = !flipped;

    if (next) {
      void ensureReverseData();
    }

    if (onFlip) {
      onFlip();
      return;
    }

    setInternalFlipped(next);
  }, [ensureReverseData, flipped, onFlip]);

  function handleClick(
    event: MouseEvent<HTMLDivElement>
  ) {
    /*
     * Slabs often live inside larger clickable cards/links.
     * The physical object owns the tap: tap slab = flip.
     */
    event.preventDefault();
    event.stopPropagation();

    toggleFlip();
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLDivElement>
  ) {
    if (
      event.key !== "Enter" &&
      event.key !== " "
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    toggleFlip();
  }

  const slabStyle = {
    "--grade-a": tone.a,
    "--grade-b": tone.b,
    "--grade-c": tone.c,
    "--grade-ink": tone.ink,
  } as CSSProperties;

  return (
    <div
      className={`${styles.shell} ${styles.interactive}`}
      style={slabStyle}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      data-vcs-slab="true"
      aria-label={`${
        flipped
          ? "Show front of"
          : "Show back and population report for"
      } ${player} VCS ${grade} slab`}
      title={
        flipped
          ? "Tap to show front"
          : "Tap to flip · card back + population registry"
      }
    >
      <div
        className={`${styles.rotor} ${
          flipped ? styles.flipped : ""
        }`}
      >
        <SlabFace
          side="front"
          player={player}
          cardNumber={cardNumber}
          setName={setName}
          team={team}
          grade={grade}
          image={imageUrl}
          registry={effectiveRegistry}
        />

        <SlabFace
          side="back"
          player={player}
          cardNumber={cardNumber}
          setName={setName}
          team={team}
          grade={grade}
          image={effectiveBackImageUrl}
          registry={effectiveRegistry}
        />
      </div>
    </div>
  );
}
