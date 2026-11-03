import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

export type ImageAsset = {
  file: string;
  sha256: string;
  sourceType: "verified_scan" | "seller_photo" | "ai_reconstruction";
  sources: string[];
  notes: string;
};
export type BatchCard = {
  cardId: number;
  productSetId: string;
  cardNumber: string;
  player: string;
  front?: ImageAsset;
  back?: ImageAsset;
};
export type ImageBatch = { schemaVersion: 1; batchId: string; cards: BatchCard[] };
export type Target = {
  id: number; productSetId: string | null; cardNumber: string; player: string;
  frontImageUrl: string | null; backImageUrl: string | null;
};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const text = (v: unknown): v is string => typeof v === "string" && !!v.trim();

export function validateBatch(value: unknown): ImageBatch {
  const b = value as ImageBatch;
  if (b?.schemaVersion !== 1 || !text(b.batchId) || !/^[a-z0-9-]+$/.test(b.batchId))
    throw new Error("Expected schemaVersion 1 and a lowercase batchId.");
  if (!Array.isArray(b.cards) || !b.cards.length) throw new Error("Batch has no cards.");
  const ids = new Set<number>();
  for (const c of b.cards) {
    if (!Number.isSafeInteger(c?.cardId) || c.cardId <= 0 || ids.has(c.cardId))
      throw new Error("Invalid or duplicate cardId.");
    ids.add(c.cardId);
    if (![c.productSetId, c.cardNumber, c.player].every(text) || (!c.front && !c.back))
      throw new Error(`Incomplete card ${c.cardId}.`);
    for (const a of [c.front, c.back].filter(Boolean) as ImageAsset[]) {
      if (!text(a.file) || !/^[a-f0-9]{64}$/.test(a.sha256) ||
          !["verified_scan", "seller_photo", "ai_reconstruction"].includes(a.sourceType) ||
          !Array.isArray(a.sources) || !a.sources.length ||
          !a.sources.every(s => text(s) && /^https:\/\//.test(s)) || !text(a.notes))
        throw new Error(`Invalid asset/provenance for card ${c.cardId}.`);
    }
    if (c.front && c.back && c.front.sha256 === c.back.sha256)
      throw new Error(`Identical front/back for card ${c.cardId}.`);
  }
  return b;
}

export function detectImage(buffer: Buffer) {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    return { contentType: "image/jpeg", extension: "jpg" };
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    return { contentType: "image/png", extension: "png" };
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP")
    return { contentType: "image/webp", extension: "webp" };
  throw new Error("Expected actual JPEG, PNG, or WebP image bytes.");
}

export async function prepareBatch(batch: ImageBatch, directory: string) {
  const root = await realpath(directory);
  const assets: { card: BatchCard; side: "front" | "back"; asset: ImageAsset; buffer: Buffer; contentType: string; extension: string; key: string }[] = [];
  for (const card of batch.cards) for (const side of ["front", "back"] as const) {
    const asset = card[side];
    if (!asset) continue;
    if (path.isAbsolute(asset.file)) throw new Error("Asset paths must be relative to the manifest.");
    const file = await realpath(path.resolve(root, asset.file));
    const rel = path.relative(root, file);
    if (rel.startsWith(".." + path.sep) || rel === ".." || path.isAbsolute(rel))
      throw new Error("Asset path escapes the batch directory.");
    const buffer = await readFile(file);
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error(`Invalid size: ${asset.file}`);
    if (createHash("sha256").update(buffer).digest("hex") !== asset.sha256)
      throw new Error(`Checksum mismatch: ${asset.file}`);
    const format = detectImage(buffer);
    const key = `virtual-card-shop/cards/by-id/${card.cardId}/${side}-${asset.sourceType}-${asset.sha256}.${format.extension}`;
    assets.push({ card, side, asset, buffer, ...format, key });
  }
  return assets;
}

export function verifyTargets(batch: ImageBatch, targets: Target[]) {
  const map = new Map(targets.map(t => [t.id, t]));
  for (const c of batch.cards) {
    const t = map.get(c.cardId);
    if (!t || t.productSetId !== c.productSetId || t.cardNumber !== c.cardNumber || t.player !== c.player)
      throw new Error(`Card ${c.cardId} identity mismatch. Expected ${c.player} #${c.cardNumber} in ${c.productSetId}. No images written.`);
  }
  return map;
}
