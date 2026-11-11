import assert from "node:assert/strict";
import test from "node:test";
import { collectorQuantity, readyQuantity } from "../src/lib/collection-quantity";

test("auction listings leave collector-facing quantity immediately", () => {
  assert.equal(collectorQuantity(12, 4, 0), 8);
  assert.equal(readyQuantity(12, 4), 8);
});

test("cards awaiting grading remain in collection but are not ready to list", () => {
  assert.equal(collectorQuantity(10, 4, 2), 8);
  assert.equal(readyQuantity(10, 4), 6);
});

test("unsold auctions returning a copy restore collector quantity", () => {
  assert.equal(collectorQuantity(8, 3, 2), 7);
  assert.equal(collectorQuantity(8, 2, 2), 8);
});

test("multiple grades and auction reservations never create negative available quantities", () => {
  assert.equal(collectorQuantity(1, 3, 2), 2);
  assert.equal(collectorQuantity(-1, 4, 0), 0);
  assert.equal(collectorQuantity(0, 0, 0), 0);
});
