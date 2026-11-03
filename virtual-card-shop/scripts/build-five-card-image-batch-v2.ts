import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";

const BATCH_ID = "2026-10-02-five-card-batch";
const OUT_DIR = path.resolve("data/card-image-batches", BATCH_ID);
const IMAGE_DIR = path.join(OUT_DIR, "images");
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36";

type SourceType = "verified_scan" | "seller_photo" | "ai_reconstruction";
type Asset = {
  url: string;
  sourceType: SourceType;
  sources: string[];
  notes: string;
};
type Target = {
  id: number;
  basePlayer: string;
  cardNumber: string;
  front: Asset;
  back?: Asset;
};

const targets: Target[] = [
  {
    id: 28773,
    basePlayer: "Roy Halladay",
    cardNumber: "148",
    front: {
      url: "https://i.ebayimg.com/images/g/fu8AAOSwxPVnpjJ7/s-l1600.jpg",
      sourceType: "ai_reconstruction",
      sources: [
        "https://www.ebay.com/p/22055929144",
        "https://www.ebay.com/itm/334672035751"
      ],
      notes: "1999 Pacific Revolution base #148 Roy Halladay scan used as a visual reconstruction proxy for the Premiere Date /49 parallel. Exact Premiere Date foil/serial treatment is not verified; do not treat as an exact rare-variant scan."
    }
  },
  {
    id: 6127,
    basePlayer: "Peter Warrick",
    cardNumber: "ROY5",
    front: {
      url: "https://i.ebayimg.com/images/g/6zEAAOSw46dmH-lI/s-l1600.webp",
      sourceType: "ai_reconstruction",
      sources: [
        "https://www.ebay.com/p/20055596440",
        "https://www.tcdb.com/ViewCard.cfm/sid/35677/cid/8900155/2000-Bowman---All-Rookie-Team-Prize-Set-ROY5-Peter-Warrick?PageIndex=1"
      ],
      notes: "2000 Bowman Peter Warrick base #183 image used as an explicit visual reconstruction proxy for All Rookie Team Prize Set ROY5. Public exact ROY5 Prize Set scan was not available; do not treat as a verified exact-card scan."
    }
  },
  {
    id: 6133,
    basePlayer: "Mike Anderson",
    cardNumber: "ROY11",
    front: {
      url: "https://i.ebayimg.com/images/g/vBgAAOSwLJNnpjOd/s-l1600.jpg",
      sourceType: "ai_reconstruction",
      sources: [
        "https://www.ebay.com/p/18055610039",
        "https://www.tcdb.com/ViewCard.cfm/sid/35677/cid/17501534/2000-Bowman-All-Rookie-Team-Prize-Set-ROY11-Mike-Anderson"
      ],
      notes: "2000 Bowman Mike Anderson base #220 image used as an explicit visual reconstruction proxy for All Rookie Team Prize Set ROY11. Public exact ROY11 Prize Set scan was not used here; do not treat as a verified exact-card scan."
    }
  },
  {
    id: 15168,
    basePlayer: "Jerome Bettis",
    cardNumber: "GK19",
    front: {
      url: "https://i.ebayimg.com/images/g/~dQAAeSw0HxqnGIY/s-l500.webp",
      sourceType: "seller_photo",
      sources: ["https://www.ebay.com/itm/336564395155"],
      notes: "Exact 1999 Donruss Gridiron Kings Canvas #GK19 Jerome Bettis seller image. Seller/COMC watermark retained; exact Canvas parallel source, not reconstructed."
    },
    back: {
      url: "https://i.ebayimg.com/images/g/yCQAAeSwG9FqnGIY/s-l500.webp",
      sourceType: "seller_photo",
      sources: ["https://www.ebay.com/itm/336564395155"],
      notes: "Back image from the exact 1999 Donruss Gridiron Kings Canvas #GK19 Jerome Bettis seller listing. Seller/COMC watermark retained."
    }
  },
  {
    id: 28753,
    basePlayer: "Joe Nathan",
    cardNumber: "128",
    front: {
      url: "https://i.ebayimg.com/images/g/eNMAAOSwS69npifb/s-l1600.jpg",
      sourceType: "ai_reconstruction",
      sources: [
        "https://www.ebay.com/itm/336663227670",
        "https://www.ebay.com/itm/336807860731"
      ],
      notes: "1999 Pacific Revolution base #128 Joe Nathan scan used as a visual reconstruction proxy for the Premiere Date /49 parallel. Exact Premiere Date foil/serial treatment is not verified; do not treat as an exact rare-variant scan."
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
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": UA,
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      referer: "https://www.ebay.com/"
    }
  });
  if (!response.ok) throw new Error(`Image download failed (${response.status}): ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error(`Invalid image size (${buffer.length}): ${url}`);
  return { buffer, extension: detect(buffer) };
}

async function buildAsset(cardId: number, side: "front" | "back", asset: Asset) {
  const downloaded = await fetchImage(asset.url);
  const filename = `${cardId}-${side}.${downloaded.extension}`;
  await writeFile(path.join(IMAGE_DIR, filename), downloaded.buffer);
  return {
    file: `images/${filename}`,
    sha256: createHash("sha256").update(downloaded.buffer).digest("hex"),
    sourceType: asset.sourceType,
    sources: asset.sources,
    notes: `${asset.notes} Retrieved direct image: ${asset.url}`
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Run from your configured VCS terminal.");
  await mkdir(IMAGE_DIR, { recursive: true });

  const dbCards = await prisma.card.findMany({
    where: { id: { in: targets.map(target => target.id) } },
    select: { id: true, productSetId: true, cardNumber: true, player: true, frontImageUrl: true, backImageUrl: true }
  });
  const byId = new Map(dbCards.map(card => [card.id, card]));
  const cards: any[] = [];
  const summary: any[] = [];

  for (const target of targets) {
    const db = byId.get(target.id);
    if (!db) throw new Error(`Card ID ${target.id} was not found in VCS.`);
    const playerMatches = db.player.toLowerCase().startsWith(target.basePlayer.toLowerCase());
    if (!playerMatches || db.cardNumber !== target.cardNumber || !db.productSetId) {
      throw new Error(`Identity mismatch for ${target.id}. Expected ${target.basePlayer} #${target.cardNumber}; found ${db.player} #${db.cardNumber} (${db.productSetId ?? "no productSetId"}).`);
    }
    if (db.player !== target.basePlayer) {
      console.log(`[image-factory] ${target.id}: using live VCS player label "${db.player}" (base name "${target.basePlayer}").`);
    }

    const entry: any = {
      cardId: db.id,
      player: db.player,
      cardNumber: db.cardNumber,
      productSetId: db.productSetId,
      front: await buildAsset(db.id, "front", target.front)
    };
    if (target.back) entry.back = await buildAsset(db.id, "back", target.back);
    cards.push(entry);

    summary.push({
      id: db.id,
      player: db.player,
      card: db.cardNumber,
      productSetId: db.productSetId,
      front: target.front.sourceType,
      back: target.back?.sourceType ?? "—",
      existingFront: !!db.frontImageUrl,
      existingBack: !!db.backImageUrl
    });
  }

  const manifest = { schemaVersion: 1, batchId: BATCH_ID, cards };
  const manifestPath = path.join(OUT_DIR, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.table(summary);
  console.log(`Built ${cards.length}-card direct-source Image Factory batch: ${manifestPath}`);
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
