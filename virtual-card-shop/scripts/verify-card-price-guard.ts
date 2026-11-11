/**
 * Read-only schema and trigger verification after the price-revision migration.
 * No card/ownership/snapshot writes. Exits nonzero if a guard is missing.
 */
import assert from "node:assert/strict";
import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: false, quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const [tableExists] = await prisma.$queryRaw<Array<{ table_name: string | null }>>`
      SELECT to_regclass('public."CardPriceRevision"')::text AS table_name
    `;
    assert.ok(tableExists?.table_name, "CardPriceRevision table must exist");

    const counter = await prisma.$queryRaw<Array<{ id: number; revision: bigint }>>`
      SELECT "id", "revision" FROM "CardPriceRevision"
    `;
    assert.equal(counter.length, 1, "CardPriceRevision must have one row");
    assert.equal(counter[0].id, 1, "Revision singleton must use ID 1");
    assert.ok(counter[0].revision >= BigInt(0), "Revision cannot be negative");

    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'FinancialDailySnapshot'
        AND column_name = 'cardPriceRevision'
    `;
    assert.equal(columns.length, 1, "Snapshot revision column must exist");

    const triggers = await prisma.$queryRaw<Array<{
      tgname: string; tgenabled: string; definition: string;
    }>>`
      SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS definition
      FROM pg_trigger
      WHERE tgrelid = 'public."Card"'::regclass AND NOT tgisinternal
    `;
    for (const name of [
      "vcs_card_price_insert",
      "vcs_card_price_update",
      "vcs_card_price_delete",
      "vcs_card_price_truncate",
    ]) {
      const trigger = triggers.find(t => t.tgname === name);
      assert.ok(trigger, "Missing card catalog trigger: " + name);
      assert.equal(trigger.tgenabled, "O", name + " must be enabled");
      assert.ok(trigger.definition.includes("FOR EACH STATEMENT"),
        name + " must use efficient statement-level invalidation");
    }

    console.log("PASS: all catalog-change triggers enabled.");
    console.log("PASS: revision singleton exists; current revision " +
      counter[0].revision.toString() + ".");
    console.log("PASS: financial snapshots can record the price revision.");
    console.log("Read-only verification finished; no records changed.");
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(e => { console.error("STOP:", e.message); process.exitCode = 1; });
