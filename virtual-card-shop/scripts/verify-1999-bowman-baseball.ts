import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "../src/lib/prisma";

const PRODUCT_ID = "1999_Bowman_Baseball";

const EXPECTED = [
  ["1999_Bowman_Baseball_base", 440, null],
  ["1999_Bowman_Baseball_international", 440, 1],
  ["1999_Bowman_Baseball_gold", 440, 77],
  ["1999_Bowman_Baseball_late_bloomers", 10, 24],
  ["1999_Bowman_Baseball_scouts_choice", 21, 24],
  ["1999_Bowman_Baseball_roy_favorites", 10, 24],
  ["1999_Bowman_Baseball_early_risers", 11, 24],
  ["1999_Bowman_Baseball_certified_autographs_blue", 40, 111],
  ["1999_Bowman_Baseball_certified_autographs_silver", 20, 335],
  ["1999_Bowman_Baseball_certified_autographs_gold", 10, 1356],
  ["1999_Bowman_Baseball_checklists_certificate_requests", 2, 24],
] as const;

async function main() {
  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    include: { productSets: true },
  });

  if (!product) throw new Error("1999 Bowman draft not imported");
  if (product.released) throw new Error("STOP: 1999 Bowman must remain unreleased");
  if (product.cardsPerPack !== 4) throw new Error("Expected four-card VCS packs");
  if (product.packsPerBox !== 24) throw new Error("Expected 24 packs per VCS box");

  if (product.productSets.length !== EXPECTED.length) {
    throw new Error(
      `Expected ${EXPECTED.length} ProductSets; found ${product.productSets.length}`
    );
  }

  let totalCards = 0;
  for (const [id, expectedCount, expectedOdds] of EXPECTED) {
    const set = product.productSets.find((candidate) => candidate.id === id);
    if (!set) throw new Error(`Missing ProductSet ${id}`);
    if (set.oddsPerPack !== expectedOdds) {
      throw new Error(
        `${id} odds mismatch: expected ${expectedOdds}, found ${set.oddsPerPack}`
      );
    }

    const cards = await prisma.card.findMany({
      where: { productSetId: id },
      select: {
        cardNumber: true,
        player: true,
        team: true,
        subset: true,
        variant: true,
      },
    });

    if (cards.length !== expectedCount) {
      throw new Error(
        `${id} expected ${expectedCount} cards; found ${cards.length}`
      );
    }
    if (new Set(cards.map((card) => card.cardNumber)).size !== cards.length) {
      throw new Error(`${id} contains duplicate card numbers`);
    }
    totalCards += cards.length;
  }

  if (totalCards !== 1444) {
    throw new Error(`Expected 1,444 collectible cards; found ${totalCards}`);
  }

  const baseCards = await prisma.card.findMany({
    where: { productSetId: "1999_Bowman_Baseball_base" },
    select: { cardNumber: true, player: true, team: true },
  });
  const rookieCount = baseCards.filter((card) => card.player.endsWith(" RC")).length;
  if (rookieCount !== 148) {
    throw new Error(`Expected 148 true Base RCs; found ${rookieCount}`);
  }
  if (baseCards.some((card) => !card.team?.trim())) {
    throw new Error("Base contains missing team data");
  }

  const nonBaseRcCount = await prisma.card.count({
    where: {
      productSetId: {
        in: EXPECTED.map(([id]) => id).filter(
          (id) => id !== "1999_Bowman_Baseball_base"
        ),
      },
      player: { endsWith: " RC" },
    },
  });
  if (nonBaseRcCount !== 0) {
    throw new Error(
      `RC labels leaked onto ${nonBaseRcCount} non-base cards`
    );
  }

  const autoChecks = [
    ["1999_Bowman_Baseball_certified_autographs_blue", 20, 20],
    ["1999_Bowman_Baseball_certified_autographs_silver", 10, 10],
    ["1999_Bowman_Baseball_certified_autographs_gold", 5, 5],
  ] as const;

  for (const [id, expectedS1, expectedS2] of autoChecks) {
    const cards = await prisma.card.findMany({
      where: { productSetId: id },
      select: { subset: true, player: true, team: true },
    });
    const s1 = cards.filter((card) => card.subset === "Series One").length;
    const s2 = cards.filter((card) => card.subset === "Series Two").length;
    if (s1 !== expectedS1 || s2 !== expectedS2) {
      throw new Error(
        `${id} series split mismatch: S1=${s1}, S2=${s2}`
      );
    }
    if (cards.some((card) => !card.team?.trim())) {
      throw new Error(`${id} contains missing autograph team data`);
    }
  }

  const leakedMetadata = await prisma.card.findMany({
    where: {
      productSetId: { in: EXPECTED.map(([id]) => id) },
      OR: [
        { player: { contains: " UER" } },
        { player: { contains: " ERR" } },
        { player: { contains: " COR" } },
        { player: { contains: " VAR" } },
        { player: { contains: " AU" } },
      ],
    },
    select: { productSetId: true, cardNumber: true, player: true },
  });
  if (leakedMetadata.length) {
    throw new Error(
      "Source metadata leaked into Player: " +
        leakedMetadata.slice(0, 5).map((card) =>
          `${card.productSetId} #${card.cardNumber} ${card.player}`
        ).join("; ")
    );
  }

  console.log("=== 1999 BOWMAN VERIFICATION PASSED ===");
  console.log("ProductSets: 11");
  console.log("Collectible cards: 1,444");
  console.log("Base: 440; true Base RCs: 148");
  console.log("International: 440 at 1:1");
  console.log("Gold SN99: 440 at combined 1:77");
  console.log("Certified Autographs: Blue 40 / Silver 20 / Gold 10");
  console.log("Status: UNRELEASED");
}

main()
  .catch((error) => {
    console.error("Verification FAILED:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
