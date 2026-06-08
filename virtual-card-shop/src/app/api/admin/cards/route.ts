import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
    const missingImagesOnly =
      req.nextUrl.searchParams.get("missingImagesOnly") === "true";

    const andWhere: Prisma.CardWhereInput[] = [];

    if (search.length > 0) {
      andWhere.push({
        OR: [
          { player: { contains: search, mode: "insensitive" } },
          { team: { contains: search, mode: "insensitive" } },
          { cardNumber: { contains: search, mode: "insensitive" } },
          { subset: { contains: search, mode: "insensitive" } },
          { variant: { contains: search, mode: "insensitive" } },
          {
            productSet: {
              name: { contains: search, mode: "insensitive" },
            },
          },
          {
            productSet: {
              product: {
                brand: { contains: search, mode: "insensitive" },
              },
            },
          },
          {
            set: {
              brand: { contains: search, mode: "insensitive" },
            },
          },
        ],
      });
    }

    if (missingImagesOnly) {
      andWhere.push({
        OR: [
          { frontImageUrl: null },
          { frontImageUrl: "" },
          { backImageUrl: null },
          { backImageUrl: "" },
        ],
      });
    }

    const cards = await prisma.card.findMany({
      where: andWhere.length > 0 ? { AND: andWhere } : undefined,
      include: {
        productSet: {
          select: {
            id: true,
            name: true,
            defaultGradeability: true,
            product: {
              select: {
                id: true,
                year: true,
                brand: true,
                sport: true,
              },
            },
          },
        },
        set: {
          select: {
            id: true,
            year: true,
            brand: true,
            sport: true,
          },
        },
      },
      orderBy: [
        { player: "asc" },
        { productSetId: "asc" },
        { cardNumber: "asc" },
      ],
      take: 500,
    });

    return NextResponse.json({ cards });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed" },
      { status: 500 }
    );
  }
}