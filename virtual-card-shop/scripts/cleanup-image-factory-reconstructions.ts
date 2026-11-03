import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { prisma } from "../src/lib/prisma";

const apply = process.argv.includes("--apply");
const marker = "ai_reconstruction";

type Candidate = {
  id: number;
  player: string;
  cardNumber: string;
  productSetId: string | null;
  side: "front" | "back";
  url: string;
};

async function main() {
  const cards = await prisma.card.findMany({
    where: {
      OR: [
        { frontImageUrl: { contains: marker } },
        { backImageUrl: { contains: marker } },
      ],
    },
    select: {
      id: true,
      player: true,
      cardNumber: true,
      productSetId: true,
      frontImageUrl: true,
      backImageUrl: true,
    },
    orderBy: { id: "asc" },
  });

  const candidates: Candidate[] = [];
  for (const card of cards) {
    if (card.frontImageUrl?.includes(marker)) {
      candidates.push({
        id: card.id,
        player: card.player,
        cardNumber: card.cardNumber,
        productSetId: card.productSetId,
        side: "front",
        url: card.frontImageUrl,
      });
    }
    if (card.backImageUrl?.includes(marker)) {
      candidates.push({
        id: card.id,
        player: card.player,
        cardNumber: card.cardNumber,
        productSetId: card.productSetId,
        side: "back",
        url: card.backImageUrl,
      });
    }
  }

  console.log(`Found ${candidates.length} Image Factory reconstruction image field(s) across ${cards.length} card(s).`);
  console.table(candidates.map(c => ({
    id: c.id,
    player: c.player,
    card: c.cardNumber,
    side: c.side,
    productSetId: c.productSetId,
  })));

  if (!apply) {
    console.log("DRY RUN ONLY. Nothing changed.");
    console.log("Run again with --apply to clear only the listed ai_reconstruction URLs.");
    return;
  }

  let cleared = 0;
  let preserved = 0;

  for (const candidate of candidates) {
    const field = candidate.side === "front" ? "frontImageUrl" : "backImageUrl";
    const result = await prisma.card.updateMany({
      where: {
        id: candidate.id,
        [field]: candidate.url,
      },
      data: {
        [field]: null,
      },
    });

    if (result.count === 1) {
      cleared += 1;
      console.log(`[cleanup] cleared ${candidate.id} ${candidate.side}`);
    } else {
      preserved += 1;
      console.log(`[cleanup] preserved ${candidate.id} ${candidate.side}; URL changed after audit.`);
    }
  }

  console.log(`Cleanup complete. Cleared ${cleared}; preserved ${preserved} concurrent/replaced field(s).`);
  console.log("R2 objects are intentionally left in place; only Card database references were cleared.");
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
