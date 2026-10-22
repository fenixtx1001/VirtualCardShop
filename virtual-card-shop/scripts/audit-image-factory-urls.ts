import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { prisma } from "../src/lib/prisma";

const namespaceMarker = "virtual-card-shop/cards/by-id/";

function classify(url: string) {
  if (url.includes("-verified_scan-")) return "verified_scan";
  if (url.includes("-seller_photo-")) return "seller_photo";
  if (url.includes("-ai_reconstruction-")) return "ai_reconstruction";
  return "unknown";
}

async function main() {
  const cards = await prisma.card.findMany({
    where: {
      OR: [
        { frontImageUrl: { contains: namespaceMarker } },
        { backImageUrl: { contains: namespaceMarker } },
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

  const rows: Array<Record<string, unknown>> = [];

  for (const card of cards) {
    if (card.frontImageUrl?.includes(namespaceMarker)) {
      rows.push({
        id: card.id,
        player: card.player,
        card: card.cardNumber,
        side: "front",
        source: classify(card.frontImageUrl),
        productSetId: card.productSetId,
        url: card.frontImageUrl,
      });
    }
    if (card.backImageUrl?.includes(namespaceMarker)) {
      rows.push({
        id: card.id,
        player: card.player,
        card: card.cardNumber,
        side: "back",
        source: classify(card.backImageUrl),
        productSetId: card.productSetId,
        url: card.backImageUrl,
      });
    }
  }

  console.log(`Image Factory currently owns ${rows.length} image field(s) across ${cards.length} card(s).`);
  console.table(rows.map(({ url, ...row }) => row));

  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    const source = String(row.source);
    acc[source] = (acc[source] ?? 0) + 1;
    return acc;
  }, {});
  console.log("Source counts:", counts);
  console.log("No changes were made. This command is audit-only.");
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
