import test from "node:test";
import assert from "node:assert/strict";
import {
  availableCopies,
  graphCoordinates,
  saleImpact,
  trendLabel,
} from "../src/lib/card-details/model";
import { calculateGradingFeeCents } from "../src/lib/grading";
import { calcShopSellQuote } from "../src/lib/shop-offers";
import {
  calculateAuctionValueBasisCents,
  calculateStartingBidCents,
} from "../src/lib/auctions";
test("reserved copies are unavailable without hiding ownership", () => {
  assert.equal(
    availableCopies({
      grade: 0,
      label: "Raw",
      quantity: 4,
      valueCents: 100,
      auctionLockedQuantity: 3,
    }),
    1,
  );
  assert.equal(
    availableCopies({
      grade: 9,
      label: "VCS 9",
      quantity: 1,
      valueCents: 260,
      auctionLockedQuantity: 2,
    }),
    0,
  );
  assert.equal(availableCopies(undefined), 0);
});
test("sales gaps use elapsed time, with finite points for equal prices", () => {
  const graph = graphCoordinates(
    [
      { date: "2026-01-01", salesCount: 1, averageSaleCents: 100 },
      { date: "2026-01-02", salesCount: 1, averageSaleCents: 100 },
      { date: "2026-01-11", salesCount: 1, averageSaleCents: 100 },
    ],
    400,
    200,
  );
  assert.ok(
    Math.abs(
      (graph.points[1].x - graph.points[0].x) /
        (graph.points[2].x - graph.points[0].x) -
        0.1,
    ) < 0.0001,
  );
  assert.ok(graph.points.every((p) => Number.isFinite(p.y)));
});
test("missing history never appears flat", () => {
  assert.equal(
    trendLabel({ salesCount: 3, trendBps: 0 }),
    "Insufficient history",
  );
  assert.equal(trendLabel({ salesCount: 4, trendBps: 0 }), "Unchanged");
});
test("selling messages use historical prestige target and total copies", () => {
  const progress = {
    level: 3,
    nextLevel: 4,
    totalCards: 100,
    ownedCards: 100,
    cardsAtNext: 95,
    missingCopies: 5,
    thisCardOwned: 4,
    thisCardNeeded: 0,
  };
  assert.match(saleImpact(4, 1, progress)!, /need 1 more copy/);
  assert.match(saleImpact(1, 1, progress)!, /last copy/);
  assert.equal(saleImpact(6, 1, progress), null);
});
test("action estimates use the existing economic rules", () => {
  assert.equal(calculateGradingFeeCents(100), 100);
  assert.equal(calculateGradingFeeCents(10000), 1500);
  const quote = calcShopSellQuote({
    rawBookValueCents: 1000,
    quantity: 2,
    baseOfferBps: 6500,
    grade: 9,
    gradeability: "COMMON",
  });
  assert.equal(quote.totalCents, 3900);
  const basis = calculateAuctionValueBasisCents({
    rawBookValueCents: 1000,
    grade: 9,
  });
  assert.equal(calculateStartingBidCents(basis.valueBasisCents), 1339);
});
