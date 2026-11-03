import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";

const BATCH_ID = "2026-10-02-five-card-batch-2";
const OUT_DIR = path.resolve("data/card-image-batches", BATCH_ID);
const IMAGE_DIR = path.join(OUT_DIR, "images");
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36";

type SourceType = "verified_scan" | "seller_photo" | "ai_reconstruction";
type Asset = { url: string; sourceType: SourceType; sources: string[]; notes: string };
type Target = { id: number; basePlayer: string; cardNumber: string; front: Asset; back?: Asset };

const targets: Target[] = [
  {
    id: 20081,
    basePlayer: "Alex Rodriguez",
    cardNumber: "74",
    front: {
      url: "https://i.ebayimg.com/images/g/FL8AAeSwRtJpTVsA/s-l500.webp",
      sourceType: "seller_photo",
      sources: ["https://www.ebay.com/p/8055971593", "https://www.tcdb.com/Checklist.cfm/sid/11493/1999-Fleer-Mystique---Gold"],
      notes: "Exact 1999 Fleer Mystique Gold #74 Alex Rodriguez front from a COMC/eBay listing."
    },
    back: {
      url: "https://i.ebayimg.com/images/g/Gf4AAeSwDv9pTVsA/s-l500.webp",
      sourceType: "seller_photo",
      sources: ["https://www.ebay.com/p/8055971593", "https://www.tcdb.com/Checklist.cfm/sid/11493/1999-Fleer-Mystique---Gold"],
      notes: "Exact 1999 Fleer Mystique Gold #74 Alex Rodriguez back from the same COMC/eBay listing."
    }
  },
  {
    id: 28644,
    basePlayer: "Albert Belle",
    cardNumber: "19",
    front: {
      url: "https://i.ebayimg.com/images/g/kNwAAeSwUTZoZNKz/s-l1600.webp",
      sourceType: "ai_reconstruction",
      sources: ["https://www.ebay.com/itm/168280238412"],
      notes: "Exact player/card-number 1999 Pacific Revolution base front used as a visual reconstruction proxy for Premiere Date /49. Premiere Date foil/stamp treatment is not verified in this image."
    },
    back: {
      url: "https://i.ebayimg.com/images/g/37EAAeSwwdhoZNKz/s-l1600.webp",
      sourceType: "ai_reconstruction",
      sources: ["https://www.ebay.com/itm/168280238412"],
      notes: "Exact player/card-number base back used as a reconstruction proxy for Premiere Date /49. Serial numbering is not represented."
    }
  },
  {
    id: 28698,
    basePlayer: "Gary Sheffield",
    cardNumber: "73",
    front: {
      url: "https://i.ebayimg.com/images/g/GMoAAeSw-nlqswot/s-l1600.webp",
      sourceType: "ai_reconstruction",
      sources: ["https://www.ebay.com/itm/398422091337"],
      notes: "Exact player/card-number 1999 Pacific Revolution base front used as a visual reconstruction proxy for Premiere Date /49. Premiere Date foil/stamp treatment is not verified in this image."
    },
    back: {
      url: "https://i.ebayimg.com/images/g/5L8AAeSwN5Rqswot/s-l1600.webp",
      sourceType: "ai_reconstruction",
      sources: ["https://www.ebay.com/itm/398422091337"],
      notes: "Exact player/card-number base back used as a reconstruction proxy for Premiere Date /49. Serial numbering is not represented."
    }
  },
  {
    id: 10662,
    basePlayer: "Mark Brunell",
    cardNumber: "M10",
    front: {
      url: "https://i.ebayimg.com/images/g/X9gAAOSwST1npiFs/s-l1600.jpg",
      sourceType: "ai_reconstruction",
      sources: ["https://www.ebay.com/p/21055801555", "https://www.tcdb.com/ViewCard.cfm/sid/34790/cid/3619500/1998-Score---Hobby-Epix-Red-M10-Mark-Brunell?PageIndex=1"],
      notes: "Mark Brunell M10 Hobby Epix Milestone image from the Purple /200 sister parallel used as a reconstruction proxy for Hobby Epix Red /500. Parallel color and serial number are not represented as exact."
    }
  },
  {
    id: 15408,
    basePlayer: "Randy Moss",
    cardNumber: "72",
    front: {
      url: "https://i.ebayimg.com/images/g/wRUAAOSwJGdnpiql/s-l1600.jpg",
      sourceType: "ai_reconstruction",
      sources: ["https://www.ebay.com/p/10055613978", "https://www.tcdb.com/Person.cfm/pid/11804/col/1/yea/1999/Randy-Moss?PageIndex=3&sBrand=&sCardNum=&sNote=&sSetName=&sTeam=Oakland+Raiders"],
      notes: "Exact Randy Moss 1999 Donruss #72 base front used as a reconstruction proxy for Stat Line Career /18. The rare parallel's serial-number treatment is not represented as exact."
    }
  }
];

function detect(buffer: Buffer): "jpg" | "png" | "webp" {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  throw new Error("Downloaded bytes are not JPEG, PNG, or WebP.");
}

async function fetchImage(url: string) {
  const response = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error(`Invalid image size (${buffer.length}) from ${url}`);
  return { buffer, extension: detect(buffer), resolvedUrl: response.url || url };
}

async function saveAsset(cardId: number, side: "front" | "back", asset: Asset) {
  const downloaded = await fetchImage(asset.url);
  const filename = `${cardId}-${side}.${downloaded.extension}`;
  await writeFile(path.join(IMAGE_DIR, filename), downloaded.buffer);
  return {
    file: `images/${filename}`,
    sha256: createHash("sha256").update(downloaded.buffer).digest("hex"),
    sourceType: asset.sourceType,
    sources: asset.sources,
    notes: `${asset.notes} Retrieved image URL: ${downloaded.resolvedUrl}`
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Run from the configured VCS terminal/worktree.");
  await mkdir(IMAGE_DIR, { recursive: true });

  const dbCards = await prisma.card.findMany({
    where: { id: { in: targets.map(t => t.id) } },
    select: { id: true, productSetId: true, cardNumber: true, player: true, frontImageUrl: true, backImageUrl: true }
  });
  const byId = new Map(dbCards.map(card => [card.id, card]));
  const manifestCards: any[] = [];
  const summary: any[] = [];

  for (const target of targets) {
    const db = byId.get(target.id);
    if (!db) throw new Error(`Card ID ${target.id} was not found in VCS.`);
    const playerMatches = db.player.toLowerCase().startsWith(target.basePlayer.toLowerCase());
    if (!playerMatches || db.cardNumber !== target.cardNumber || !db.productSetId) {
      throw new Error(`Identity mismatch for ${target.id}. Expected ${target.basePlayer} #${target.cardNumber}; found ${db.player} #${db.cardNumber} (${db.productSetId ?? "no productSetId"}).`);
    }
    if (db.player !== target.basePlayer) console.log(`[image-factory] ${target.id}: using live VCS player label "${db.player}" (base name "${target.basePlayer}").`);

    const entry: any = { cardId: db.id, player: db.player, cardNumber: db.cardNumber, productSetId: db.productSetId };
    entry.front = await saveAsset(db.id, "front", target.front);
    if (target.back) entry.back = await saveAsset(db.id, "back", target.back);
    manifestCards.push(entry);
    summary.push({ id: db.id, player: db.player, card: db.cardNumber, productSetId: db.productSetId, front: target.front.sourceType, back: target.back?.sourceType ?? "—", existingFront: !!db.frontImageUrl, existingBack: !!db.backImageUrl });
  }

  const manifestPath = path.join(OUT_DIR, "manifest.json");
  await writeFile(manifestPath, JSON.stringify({ schemaVersion: 1, batchId: BATCH_ID, cards: manifestCards }, null, 2) + "\n");
  console.table(summary);
  console.log(`Built ${manifestCards.length}-card Image Factory batch: ${manifestPath}`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
