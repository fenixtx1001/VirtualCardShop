// Read-only audit against the current VCS database.
// This script ONLY SELECTS card ownership and reference raw book prices.
// Run: npx tsx scripts/audit-graded-valuation-v2.ts
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

import { PrismaClient } from "@prisma/client";
import { bookValueToCents, calculateGradedValueCents, getGradeMultiplier } from "../src/lib/grading";

const prisma = new PrismaClient();
async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL (no audit run).");
  }
  const owned = await prisma.cardOwnership.findMany({
    where: { grade: { in: [6, 7, 8, 9, 10] }, quantity: { gt: 0 } },
    select: {
      grade: true, quantity: true,
      card: {
        select: { id: true, cardNumber: true, player: true, bookValue: true },
      },
    },
  });

  let existingGradedCopies = 0;
  let changedCopies = 0;
  let changedPositions = 0;
  let totalChangeCents = 0;
  let aboveOnePositions = 0;
  const examples: Array<{ card: string; grade: number; raw: string; previous: string; v2: string; quantity: number }> = [];
  const dollars = (cents: number) => "$" + (cents / 100).toFixed(2);

  for (const row of owned) {
    const rawCents = bookValueToCents(row.card.bookValue);
    const oldCents = Math.round(rawCents * getGradeMultiplier("COMMON", row.grade));
    const newCents = calculateGradedValueCents({
      rawBookValueCents: rawCents, gradeability: "COMMON", grade: row.grade,
    });
    existingGradedCopies += row.quantity;
    if (rawCents >= 100) {
      aboveOnePositions++;
      if (newCents !== oldCents) {
        throw new Error(`STOP: Card ${row.card.id} at raw ${dollars(rawCents)} changed from ${oldCents} to ${newCents} cents`);
      }
    }
    if (newCents !== oldCents) {
      changedPositions++;
      changedCopies += row.quantity;
      totalChangeCents += (newCents - oldCents) * row.quantity;
      if (examples.length < 12) {
        examples.push({
          card: `#${row.card.cardNumber} ${row.card.player}`,
          grade: row.grade, raw: dollars(rawCents),
          previous: dollars(oldCents), v2: dollars(newCents),
          quantity: row.quantity,
        });
      }
    }
  }
  console.log("=== READ-ONLY VCS GRADED VALUATION V2 AUDIT ===");
  console.log("Owned graded copies checked:", existingGradedCopies.toLocaleString());
  console.log("Grade/card ownership rows checked:", owned.length.toLocaleString());
  console.log("Raw $1+ graded positions confirmed UNCHANGED:", aboveOnePositions.toLocaleString());
  console.log("Positions with an increased graded value:", changedPositions.toLocaleString());
  console.log("Affected owned copies:", changedCopies.toLocaleString());
  console.log("Combined incremental graded book value: +" + dollars(totalChangeCents));
  if (examples.length) console.table(examples);
  else console.log("No existing owned slabs currently have a price increase.");
  console.log("AUDIT PASSED — zero mutations; no premium-card changes.");
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
