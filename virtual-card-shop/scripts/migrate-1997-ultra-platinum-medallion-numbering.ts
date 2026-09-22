import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "../src/lib/prisma";

const PRODUCT_SET_ID = "1997_Ultra_Baseball_Platinum_Medallion";
const EXPECTED_CARDS = 553;

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function main() {
  const apply = process.argv.slice(2).includes("--apply");

  const cards = await prisma.card.findMany({
    where: { productSetId: PRODUCT_SET_ID },
    select: { id: true, cardNumber: true },
  });

  const numericCards = cards.filter((card) => /^\d+$/.test(card.cardNumber));
  const prefixedCards = cards.filter((card) => /^P\d+$/.test(card.cardNumber));
  const unexpectedCards = cards.filter(
    (card) => !/^\d+$/.test(card.cardNumber) && !/^P\d+$/.test(card.cardNumber)
  );

  if (unexpectedCards.length > 0) {
    throw new Error(
      `Unexpected card numbers already exist in ${PRODUCT_SET_ID}: ${unexpectedCards
        .slice(0, 10)
        .map((card) => card.cardNumber)
        .join(", ")}`
    );
  }

  if (numericCards.length === 0) {
    if (prefixedCards.length !== EXPECTED_CARDS) {
      throw new Error(
        `${PRODUCT_SET_ID} has no numeric cards but only ${prefixedCards.length}/${EXPECTED_CARDS} P-prefixed cards.`
      );
    }

    console.log(
      `[1997 Ultra Platinum Medallion] already migrated: ${prefixedCards.length} cards use P1-P${EXPECTED_CARDS}.`
    );
    return;
  }

  if (prefixedCards.length > 0) {
    throw new Error(
      `${PRODUCT_SET_ID} contains both numeric (${numericCards.length}) and P-prefixed (${prefixedCards.length}) numbering. Aborting to avoid duplicates.`
    );
  }

  if (numericCards.length !== EXPECTED_CARDS) {
    throw new Error(
      `${PRODUCT_SET_ID} expected ${EXPECTED_CARDS} numeric cards before migration but found ${numericCards.length}.`
    );
  }

  const byNumber = new Map(
    numericCards.map((card) => [Number(card.cardNumber), card] as const)
  );

  for (let number = 1; number <= EXPECTED_CARDS; number += 1) {
    if (!byNumber.has(number)) {
      throw new Error(
        `${PRODUCT_SET_ID} is missing card #${number}; migration aborted.`
      );
    }
  }

  console.log(
    `[1997 Ultra Platinum Medallion] ${apply ? "APPLY" : "DRY RUN"}: ${EXPECTED_CARDS} cards are ready to migrate in place from 1-${EXPECTED_CARDS} to P1-P${EXPECTED_CARDS}.`
  );

  if (!apply) {
    console.log(
      "[1997 Ultra Platinum Medallion] dry run complete; rerun with --apply to write."
    );
    return;
  }

  for (const batch of chunks(numericCards, 50)) {
    await prisma.$transaction(
      batch.map((card) =>
        prisma.card.update({
          where: { id: card.id },
          data: { cardNumber: `P${card.cardNumber}` },
        })
      )
    );
  }

  const verification = await prisma.card.findMany({
    where: { productSetId: PRODUCT_SET_ID },
    select: { cardNumber: true },
  });

  const verified = new Set(verification.map((card) => card.cardNumber));
  if (verification.length !== EXPECTED_CARDS) {
    throw new Error(
      `Post-migration count mismatch: expected ${EXPECTED_CARDS}, found ${verification.length}.`
    );
  }

  for (let number = 1; number <= EXPECTED_CARDS; number += 1) {
    if (!verified.has(`P${number}`)) {
      throw new Error(`Post-migration verification failed for P${number}.`);
    }
  }

  console.log(
    `[1997 Ultra Platinum Medallion] migrated ${EXPECTED_CARDS} cards in place: 1-${EXPECTED_CARDS} -> P1-P${EXPECTED_CARDS}. Card IDs, images, pricing, and ownership data were preserved.`
  );
}

main()
  .catch((error) => {
    console.error("[1997 Ultra Platinum Medallion] migration failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
