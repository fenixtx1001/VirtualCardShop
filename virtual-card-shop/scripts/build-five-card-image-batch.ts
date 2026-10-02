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

type ExpectedCard = {
  id: number;
  player: string;
  cardNumber: string;
  sourceType: "verified_scan" | "seller_photo" | "ai_reconstruction";
  listingUrl: string;
  directUrl?: string;
  extraSources?: string[];
  notes: string;
  back?: {
    sourceType: "verified_scan" | "seller_photo" | "ai_reconstruction";
    listingUrl: string;
    directUrl?: string;
    notes: string;
  };
};

type Downloaded = { buffer: Buffer; extension: "jpg" | "png" | "webp"; sourceUrl: string };

const cards: ExpectedCard[] = [
  {
    id: 28773,
    player: "Roy Halladay",
    cardNumber: "148",
    sourceType: "ai_reconstruction",
    listingUrl: "https://www.ebay.com/p/22055929144",
    directUrl: "https://i.ebayimg.com/images/g/fu8AAOSwxPVnpjJ7/s-l1600.jpg",
    extraSources: ["https://www.ebay.com/itm/334672035751"],
    notes: "Base #148 scan used as a visual reconstruction proxy for the 1999 Pacific Revolution Premiere Date /49 parallel. Exact gold/holographic Premiere Date treatment and serial numbering are not verified in this image; do not treat as an exact rare-variant scan."
  },
  {
    id: 6127,
    player: "Peter Warrick",
    cardNumber: "ROY5",
    sourceType: "ai_reconstruction",
    listingUrl: "https://www.ebay.com/p/20055596440",
    extraSources: ["https://www.tcdb.com/ViewCard.cfm/sid/35677/cid/8900155/2000-Bowman---All-Rookie-Team-Prize-Set-ROY5-Peter-Warrick?PageIndex=1"],
    notes: "Public exact scan of the 2000 Bowman All Rookie Team Prize Set ROY5 was not available. A Peter Warrick Bowman card image from the linked public listing is retained as an explicit visual proxy only; it is not represented as a verified ROY5 Prize Set scan."
  },
  {
    id: 6133,
    player: "Mike Anderson",
    cardNumber: "ROY11",
    sourceType: "ai_reconstruction",
    listingUrl: "https://www.ebay.com/itm/336563794264",
    extraSources: ["https://www.tcdb.com/ViewCard.cfm/sid/35677/cid/17501534/2000-Bowman-All-Rookie-Team-Prize-Set-ROY11-Mike-Anderson"],
    notes: "Public exact scan of the 2000 Bowman All Rookie Team Prize Set ROY11 was not available. A Mike Anderson Bowman card image from the linked public listing is retained as an explicit visual proxy only; it is not represented as a verified ROY11 Prize Set scan."
  },
  {
    id: 15168,
    player: "Jerome Bettis",
    cardNumber: "GK19",
    sourceType: "seller_photo",
    listingUrl: "https://www.ebay.com/itm/115205892544",
    directUrl: "https://i.ebayimg.com/images/g/pk0AAOSwTSJh6BXK/s-l1600.webp",
    notes: "Seller image of the exact 1999 Donruss Gridiron Kings Canvas GK19 Jerome Bettis card. Imported as a seller photo, not a publisher-verified stock scan.",
    back: {
      sourceType: "seller_photo",
      listingUrl: "https://www.ebay.com/itm/115205892544",
      directUrl: "https://i.ebayimg.com/images/g/V7MAAOSwNgVh6BXM/s-l1600.webp",
      notes: "Seller back image from the exact 1999 Donruss Gridiron Kings Canvas GK19 Jerome Bettis listing."
    }
  },
  {
    id: 28753,
    player: "Joe Nathan",
    cardNumber: "128",
    sourceType: "ai_reconstruction",
    listingUrl: "https://www.ebay.com/itm/336807860731",
    extraSources: ["https://www.ebay.com/itm/336663227670"],
    notes: "Base #128 image from a public Joe Nathan 1999 Pacific Revolution listing is used as a visual reconstruction proxy for the Premiere Date /49 parallel. Exact gold/holographic Premiere Date treatment and serial numbering are not verified in this image; do not treat as an exact rare-variant scan."
  }
];

function decodeHtmlUrl(value: string) {
  return value
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/\\u0026/gi, "&")
    .replace(/["'\\]+$/g, "");
}

function detect(buffer: Buffer): "jpg" | "png" | "webp" {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  throw new Error("Downloaded bytes are not JPEG, PNG, or WebP.");
}

async function fetchBytes(url: string): Promise<Downloaded> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": UA,
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error(`Invalid image size (${buffer.length}) from ${url}`);
  return { buffer, extension: detect(buffer), sourceUrl: response.url || url };
}

async function scrapeEbayImage(listingUrl: string): Promise<Downloaded> {
  const response = await fetch(listingUrl, {
    redirect: "follow",
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" }
  });
  if (!response.ok) throw new Error(`Could not open source listing (${response.status}): ${listingUrl}`);
  let html = await response.text();
  html = html.replace(/\\u002F/gi, "/").replace(/\\\//g, "/");

  const candidates: string[] = [];
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];
  if (og) candidates.push(decodeHtmlUrl(og));

  for (const match of html.matchAll(/https:\/\/i\.ebayimg\.com\/images\/g\/[^"'<>\s\\]+/g)) {
    candidates.push(decodeHtmlUrl(match[0]));
  }

  const unique = [...new Set(candidates)]
    .filter(url => /i\.ebayimg\.com\/images\/g\//.test(url))
    .filter(url => !/s-l(?:32|48|64|96|140)\.(?:jpg|jpeg|webp)(?:\?|$)/i.test(url));

  const expanded: string[] = [];
  for (const url of unique) {
    expanded.push(url.replace(/s-l\d+\.(jpg|jpeg|webp)(?=\?|$)/i, "s-l1600.jpg"));
    expanded.push(url.replace(/s-l\d+\.(jpg|jpeg|webp)(?=\?|$)/i, "s-l1600.webp"));
    expanded.push(url);
  }

  let lastError: unknown;
  for (const url of [...new Set(expanded)].slice(0, 30)) {
    try {
      return await fetchBytes(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`No usable eBay image found at ${listingUrl}. ${lastError instanceof Error ? lastError.message : ""}`.trim());
}

async function downloadAsset(directUrl: string | undefined, listingUrl: string) {
  if (directUrl) {
    const attempts = [
      directUrl,
      directUrl.replace(/s-l1600\.webp$/i, "s-l1600.jpg"),
      directUrl.replace(/s-l1600\.(jpg|webp)$/i, "s-l500.$1")
    ];
    for (const url of [...new Set(attempts)]) {
      try { return await fetchBytes(url); } catch { /* try next */ }
    }
  }
  return scrapeEbayImage(listingUrl);
}

async function saveAsset(cardId: number, side: "front" | "back", downloaded: Downloaded) {
  const filename = `${cardId}-${side}.${downloaded.extension}`;
  await writeFile(path.join(IMAGE_DIR, filename), downloaded.buffer);
  return {
    file: `images/${filename}`,
    sha256: createHash("sha256").update(downloaded.buffer).digest("hex")
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Run from your configured VCS terminal.");
  await mkdir(IMAGE_DIR, { recursive: true });

  const dbCards = await prisma.card.findMany({
    where: { id: { in: cards.map(card => card.id) } },
    select: { id: true, productSetId: true, cardNumber: true, player: true, frontImageUrl: true, backImageUrl: true }
  });
  const byId = new Map(dbCards.map(card => [card.id, card]));
  const manifestCards: any[] = [];
  const summary: any[] = [];

  for (const expected of cards) {
    const db = byId.get(expected.id);
    if (!db) throw new Error(`Card ID ${expected.id} was not found in VCS.`);

    const playerMatches = db.player.toLowerCase().startsWith(expected.player.toLowerCase());
    if (!playerMatches || db.cardNumber !== expected.cardNumber || !db.productSetId) {
      throw new Error(`Identity mismatch for ${expected.id}. Expected ${expected.player} #${expected.cardNumber}; found ${db.player} #${db.cardNumber} (${db.productSetId ?? "no productSetId"}).`);
    }
    if (db.player !== expected.player) {
      console.log(`[image-factory] ${expected.id}: using live VCS player label "${db.player}" (base name "${expected.player}").`);
    }

    const entry: any = {
      cardId: db.id,
      player: db.player,
      cardNumber: db.cardNumber,
      productSetId: db.productSetId
    };

    const front = await downloadAsset(expected.directUrl, expected.listingUrl);
    const frontFile = await saveAsset(db.id, "front", front);
    entry.front = {
      ...frontFile,
      sourceType: expected.sourceType,
      sources: [expected.listingUrl, ...(expected.extraSources ?? [])],
      notes: `${expected.notes} Retrieved image URL: ${front.sourceUrl}`
    };

    if (expected.back) {
      const back = await downloadAsset(expected.back.directUrl, expected.back.listingUrl);
      const backFile = await saveAsset(db.id, "back", back);
      entry.back = {
        ...backFile,
        sourceType: expected.back.sourceType,
        sources: [expected.back.listingUrl],
        notes: `${expected.back.notes} Retrieved image URL: ${back.sourceUrl}`
      };
    }

    manifestCards.push(entry);
    summary.push({
      id: db.id,
      player: db.player,
      card: db.cardNumber,
      productSetId: db.productSetId,
      front: expected.sourceType,
      back: expected.back?.sourceType ?? "—",
      existingFront: !!db.frontImageUrl,
      existingBack: !!db.backImageUrl
    });
  }

  const manifest = { schemaVersion: 1, batchId: BATCH_ID, cards: manifestCards };
  const manifestPath = path.join(OUT_DIR, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.table(summary);
  console.log(`Built ${manifestCards.length}-card Image Factory batch: ${manifestPath}`);
  console.log("Next: validate with npm run import:card-images -- data/card-image-batches/2026-10-02-five-card-batch/manifest.json --validate-only");
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
