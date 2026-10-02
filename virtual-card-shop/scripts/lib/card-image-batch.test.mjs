import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import batchCore from "./card-image-batch.ts";
const { validateBatch, prepareBatch, verifyTargets, detectImage } = batchCore;

const directory = path.resolve("data/card-image-batches/2026-10-02-rare-cards");
const fixture = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
const copy = () => structuredClone(fixture);
const targets = fixture.cards.map(c => ({ id: c.cardId, productSetId: c.productSetId,
  player: c.player, cardNumber: c.cardNumber, frontImageUrl: null, backImageUrl: null }));

test("real batch: validates nine image files and immutable keys", async () => {
  const assets = await prepareBatch(validateBatch(copy()), directory);
  assert.equal(assets.length, 9);
  assert.equal(new Set(assets.map(a => a.key)).size, 9);
  assert.ok(assets.every(a => a.key.includes(a.asset.sha256)));
  assert.equal(assets.filter(a => a.asset.sourceType === "ai_reconstruction").length, 8);
});
test("reject duplicate card IDs", () => {
  const b = copy(); b.cards.push(b.cards[0]); assert.throws(() => validateBatch(b), /duplicate/);
});
test("reject identical front and back", () => {
  const b = copy(); b.cards[0].back.sha256 = b.cards[0].front.sha256;
  assert.throws(() => validateBatch(b), /Identical/);
});
test("reject missing provenance", () => {
  const b = copy(); b.cards[0].front.sources = []; assert.throws(() => validateBatch(b), /provenance/);
});
test("reject corrupted checksum before upload", async () => {
  const b = copy(); b.cards[0].front.sha256 = "0".repeat(64);
  await assert.rejects(prepareBatch(validateBatch(b), directory), /Checksum/);
});
test("reject asset path escaping batch", async () => {
  const b = copy(); b.cards[0].front.file = "../../../package.json";
  await assert.rejects(prepareBatch(validateBatch(b), directory), /escapes/);
});
test("reject invalid image content", () => {
  assert.throws(() => detectImage(Buffer.from("<html>not an image</html>")), /image bytes/);
});
test("match every target identity", () => assert.equal(verifyTargets(copy(), targets).size, 5));
test("reject wrong set or player before mutation", () => {
  const t = structuredClone(targets); t[0].productSetId = "another-parallel";
  assert.throws(() => verifyTargets(copy(), t), /identity mismatch/);
  t[0] = { ...targets[0], player: "Another Player" };
  assert.throws(() => verifyTargets(copy(), t), /identity mismatch/);
});
test("reject missing database card", () => assert.throws(() => verifyTargets(copy(), targets.slice(1)), /identity mismatch/));
