"use client";

import { useEffect, useRef, useState } from "react";
import VcsSlab from "@/components/grading/VcsSlab";

type RegistrySlabPreviewProps = {
  card: {
    cardId: number;
    player: string;
    cardNumber: string;
    team: string | null;
    grade: number;
    frontImageUrl: string | null;
    backImageUrl: string | null;
    gradedAt: string | null;
  };
  setName: string;
};

/**
 * Render the genuine VCS slab at its standard 390px physical size, then
 * scale the entire object down to the width of one binder pocket. Using a
 * virtual-size wrapper (rather than tiny VcsSlab container units) preserves
 * the label, plaque, hologram, proportions and original case artwork.
 *
 * This preview is intentionally non-interactive; the parent button opens
 * the full-sized live VcsSlab with its existing flip/population behavior.
 */
export default function RegistrySlabPreview({ card, setName }: RegistrySlabPreviewProps) {
  const pocket = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = pocket.current;
    if (!element) return;
    const update = () => setWidth(element.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="vcs-registry-real-slab" ref={pocket} aria-hidden="true">
      <div
        className="vcs-registry-real-slab-canvas"
        style={{ transform: "scale(" + (width ? width / 390 : 0) + ")" }}
      >
        <VcsSlab
          player={card.player}
          cardNumber={card.cardNumber}
          team={card.team}
          setName={setName}
          grade={card.grade}
          imageUrl={card.frontImageUrl}
          backImageUrl={card.backImageUrl}
          registry={{ cardId: card.cardId, gradedAt: card.gradedAt }}
        />
      </div>
    </div>
  );
}
