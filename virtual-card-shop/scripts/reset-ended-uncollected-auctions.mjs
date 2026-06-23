import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const AUCTION_DURATION_MS = 24 * 60 * 60 * 1000;

async function main() {
  const now = new Date();
  const newEndsAt = new Date(now.getTime() + AUCTION_DURATION_MS);

  const auctions = await prisma.auction.findMany({
    where: {
      status: "ENDED",
      collectedAt: null,
    },
    select: {
      id: true,
    },
    orderBy: {
      endedAt: "desc",
    },
  });

  console.log(`Found ${auctions.length} ended, uncollected auctions to restart.`);

  for (const auction of auctions) {
    await prisma.$transaction(async (tx) => {
      await tx.auctionBid.deleteMany({
        where: { auctionId: auction.id },
      });

      await tx.auctionBidIntent.deleteMany({
        where: { auctionId: auction.id },
      });

      await tx.auction.update({
        where: { id: auction.id },
        data: {
          status: "ACTIVE",
          currentBidCents: 0,
          winnerUserId: null,
          createdAt: now,
          endsAt: newEndsAt,
          endedAt: null,
          collectedAt: null,
        },
      });
    });

    console.log(`Restarted auction ${auction.id}`);
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });