export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { r2Configured, uploadToR2 } from "@/lib/r2Upload";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type PreparedImage = {
  buffer: Buffer;
  contentType: string;
  extension: string;
  hash: string;
};

function requiredText(value: FormDataEntryValue | null, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required value: ${label}`);
  }
  return value.trim();
}

function sanitizeSegment(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

function detectImage(buffer: Buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { contentType: "image/jpeg", extension: ".jpg" };
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    return { contentType: "image/png", extension: ".png" };
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { contentType: "image/webp", extension: ".webp" };
  }

  if (
    buffer.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))
  ) {
    return { contentType: "image/gif", extension: ".gif" };
  }

  throw new Error("Unsupported or invalid image bytes. Expected JPEG, PNG, WebP, or GIF.");
}

async function prepareFile(file: File, label: string): Promise<PreparedImage> {
  if (file.size <= 0) {
    throw new Error(`${label} image is empty.`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`${label} image is too large (max 5 MB).`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectImage(buffer);
  const hash = createHash("sha256").update(buffer).digest("hex");

  return {
    buffer,
    contentType: detected.contentType,
    extension: detected.extension,
    hash,
  };
}

function storageKey(params: {
  productSetId: string;
  cardNumber: string;
  side: "front" | "back";
  image: PreparedImage;
}) {
  const set = sanitizeSegment(params.productSetId);
  const card = sanitizeSegment(params.cardNumber);
  const hash = params.image.hash.slice(0, 16);
  return `virtual-card-shop/cards/${set}/${card}/${params.side}-${hash}${params.image.extension}`;
}

export async function POST(req: Request) {
  try {
    // This endpoint is meant to be called by the VCS receiver page, not directly
    // from a third-party site. Modern browsers send this header automatically.
    const fetchSite = req.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin") {
      return NextResponse.json({ error: "Capture upload must originate from VCS." }, { status: 403 });
    }

    if (!r2Configured()) {
      return NextResponse.json({ error: "R2 is not configured." }, { status: 500 });
    }

    const form = await req.formData();
    const productSetId = requiredText(form.get("productSetId"), "productSetId");
    const cardNumber = requiredText(form.get("cardNumber"), "cardNumber");
    const overwrite = form.get("overwrite") === "true";
    const frontEntry = form.get("front");
    const backEntry = form.get("back");

    if (!(frontEntry instanceof File) || !(backEntry instanceof File)) {
      return NextResponse.json(
        { error: "Both front and back image blobs are required." },
        { status: 400 }
      );
    }

    const card = await prisma.card.findUnique({
      where: {
        productSetId_cardNumber: {
          productSetId,
          cardNumber,
        },
      },
      select: {
        id: true,
        cardNumber: true,
        player: true,
        frontImageUrl: true,
        backImageUrl: true,
      },
    });

    if (!card) {
      return NextResponse.json(
        { error: `Card ${cardNumber} was not found in Product Set ${productSetId}.` },
        { status: 404 }
      );
    }

    if (!overwrite && card.frontImageUrl && card.backImageUrl) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        message: `#${card.cardNumber} ${card.player} already has front and back images.`,
        card,
      });
    }

    const [front, back] = await Promise.all([
      prepareFile(frontEntry, "Front"),
      prepareFile(backEntry, "Back"),
    ]);

    if (front.hash === back.hash) {
      return NextResponse.json(
        { error: "Front and back image bytes are identical; capture rejected." },
        { status: 400 }
      );
    }

    const updateData: { frontImageUrl?: string; backImageUrl?: string } = {};

    if (overwrite || !card.frontImageUrl) {
      updateData.frontImageUrl = await uploadToR2({
        buffer: front.buffer,
        key: storageKey({ productSetId, cardNumber, side: "front", image: front }),
        contentType: front.contentType,
      });
    }

    if (overwrite || !card.backImageUrl) {
      updateData.backImageUrl = await uploadToR2({
        buffer: back.buffer,
        key: storageKey({ productSetId, cardNumber, side: "back", image: back }),
        contentType: back.contentType,
      });
    }

    const updated =
      Object.keys(updateData).length > 0
        ? await prisma.card.update({
            where: { id: card.id },
            data: updateData,
            select: {
              id: true,
              cardNumber: true,
              player: true,
              frontImageUrl: true,
              backImageUrl: true,
            },
          })
        : card;

    return NextResponse.json({
      ok: true,
      skipped: false,
      message: `Captured #${updated.cardNumber} ${updated.player}: front + back saved.`,
      card: updated,
    });
  } catch (error: any) {
    console.error("[set-factory-capture] error", error);
    return NextResponse.json(
      { error: error?.message ?? "Capture upload failed." },
      { status: 500 }
    );
  }
}
