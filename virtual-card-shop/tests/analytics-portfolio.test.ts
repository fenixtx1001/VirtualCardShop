import assert from "node:assert/strict";
import test from "node:test";
import {
  getChicagoDateKey,
  openedPackCostBasisCents,
  signedFinancialAmount,
} from "../src/lib/analytics-math";

test("financial direction wins over inconsistent historical amount signs", () => {
  assert.equal(signedFinancialAmount("EXPENSE", 2500), -2500);
  assert.equal(signedFinancialAmount("EXPENSE", -2500), -2500);
  assert.equal(signedFinancialAmount("INCOME", 2500), 2500);
  assert.equal(signedFinancialAmount("INCOME", -2500), 2500);
});

test("Chicago day changes at Chicago midnight", () => {
  assert.equal(getChicagoDateKey(new Date("2026-10-05T04:59:59.000Z")), "2026-10-04");
  assert.equal(getChicagoDateKey(new Date("2026-10-05T05:00:00.000Z")), "2026-10-05");
});

test("sealed cost basis is transferred proportionally as packs open", () => {
  assert.equal(openedPackCostBasisCents(7500, 24), 313);
  assert.equal(openedPackCostBasisCents(313, 1), 313);
  assert.equal(openedPackCostBasisCents(0, 0), 0);
});
