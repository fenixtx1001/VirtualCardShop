import { prisma } from "@/lib/prisma";
import {
  calculateBidIncrementCents,
  calculateMinimumNextBidCents,
  generateAuctionBidIntents,
} from "@/lib/auctions";

type ProcessAuctionResult = {
  processedAuctionIds: number[];
  dummyBidsCreated: number;
  auctionsEnded: number;
};

function getNextVisibleBidAgainstHuman(input: {
  currentBidCents: number;
  startingBidCents: number;
  challengerMaxBidCents: number;
  humanMaxBidCents: number;
}): {
  winner: "dummy" | "human";
  visibleBidCents: number;
} {
  const currentBidCents = Math.max(0, input.currentBidCents);
  const minimumNextBidCents = calculateMinimumNextBidCents(
    currentBidCents,
    input.startingBidCents
  );

  if (input.challengerMaxBidCents > input.humanMaxBidCents) {
    return {
      winner: "dummy",
      visibleBidCents: Math.max(
        minimumNextBidCents,
        Math.min(
          input.challengerMaxBidCents,
          input.humanMaxBidCents + calculateBidIncrementCents(input.humanMaxBidCents)
        )
      ),
    };
  }

  return {
    winner: "human",
    visibleBidCents: Math.max(
      currentBidCents,
      Math.min(
        input.humanMaxBidCents,
        input.challengerMaxBidCents + calculateBidIncrementCents(input.challengerMaxBidCents)
      )
    ),
  };
}

async function ensureBidIntentsForAuction(input: {
  auctionId: number;
  createdAt: Date;
  endsAt: Date;
  valueBasisCents: number;
  startingBidCents: number;
  hiddenDummyMaxBidCents: number;
}) {
  const existingIntentCount = await prisma.auctionBidIntent.count({
    where: {
      auctionId: input.auctionId,
    },
  });

  if (existingIntentCount > 0) return;

  const bidIntents = generateAuctionBidIntents({
    auctionIdSeed: input.auctionId,
    createdAt: input.createdAt,
    endsAt: input.endsAt,
    valueBasisCents: input.valueBasisCents,
    startingBidCents: input.startingBidCents,
    hiddenDummyMaxBidCents: input.hiddenDummyMaxBidCents,
  });

  if (bidIntents.length <= 0) return;

  await prisma.auctionBidIntent.createMany({
    data: bidIntents.map((intent) => ({
      auctionId: input.auctionId,
      dummyBidderName: intent.dummyBidderName,
      maxBidCents: intent.maxBidCents,
      dueAt: intent.dueAt,
    })),
  });
}

async function activateDueBidIntents(input: {
  auctionId: number;
  now: Date;
}): Promise<number> {
  const dueIntents = await prisma.auctionBidIntent.findMany({
    where: {
      auctionId: input.auctionId,
      activatedAt: null,
      dueAt: {
        lte: input.now,
      },
    },
    orderBy: [
      {
        dueAt: "asc",
      },
      {
        maxBidCents: "asc",
      },
      {
        id: "asc",
      },
    ],
  });

  let bidsCreated = 0;

  for (const intent of dueIntents) {
    const freshAuction = await prisma.auction.findUnique({
      where: {
        id: input.auctionId,
      },
      include: {
        bids: {
          orderBy: [
            {
              amountCents: "desc",
            },
            {
              createdAt: "asc",
            },
            {
              id: "asc",
            },
          ],
        },
      },
    });

    if (!freshAuction || freshAuction.status !== "ACTIVE") break;

    const currentHighBid = freshAuction.bids[0] ?? null;
    const currentBidCents = Math.max(0, freshAuction.currentBidCents || 0);

    if (!currentHighBid) {
      const visibleBidCents = Math.min(
        Math.max(freshAuction.startingBidCents, 1),
        Math.max(intent.maxBidCents, freshAuction.startingBidCents)
      );

      if (visibleBidCents > currentBidCents) {
        await prisma.auctionBid.create({
          data: {
            auctionId: freshAuction.id,
            bidderType: "DUMMY",
            dummyBidderName: intent.dummyBidderName,
            amountCents: visibleBidCents,
            maxBidCents: intent.maxBidCents,
            createdAt: intent.dueAt,
          },
        });

        await prisma.auction.update({
          where: {
            id: freshAuction.id,
          },
          data: {
            currentBidCents: visibleBidCents,
            winnerUserId: null,
          },
        });

        bidsCreated += 1;
      }

      await prisma.auctionBidIntent.update({
        where: {
          id: intent.id,
        },
        data: {
          activatedAt: input.now,
        },
      });

      continue;
    }

    if (currentHighBid.bidderType === "HUMAN" && currentHighBid.userId) {
      const humanMaxBidCents = currentHighBid.maxBidCents ?? currentHighBid.amountCents;

      const proxyResult = getNextVisibleBidAgainstHuman({
        currentBidCents,
        startingBidCents: freshAuction.startingBidCents,
        challengerMaxBidCents: intent.maxBidCents,
        humanMaxBidCents,
      });

      if (proxyResult.visibleBidCents > currentBidCents) {
        if (proxyResult.winner === "human") {
          await prisma.auctionBid.create({
            data: {
              auctionId: freshAuction.id,
              userId: currentHighBid.userId,
              bidderType: "HUMAN",
              amountCents: proxyResult.visibleBidCents,
              maxBidCents: humanMaxBidCents,
              createdAt: intent.dueAt,
            },
          });

          await prisma.auction.update({
            where: {
              id: freshAuction.id,
            },
            data: {
              currentBidCents: proxyResult.visibleBidCents,
              winnerUserId: currentHighBid.userId,
            },
          });
        } else {
          await prisma.auctionBid.create({
            data: {
              auctionId: freshAuction.id,
              bidderType: "DUMMY",
              dummyBidderName: intent.dummyBidderName,
              amountCents: proxyResult.visibleBidCents,
              maxBidCents: intent.maxBidCents,
              createdAt: intent.dueAt,
            },
          });

          await prisma.auction.update({
            where: {
              id: freshAuction.id,
            },
            data: {
              currentBidCents: proxyResult.visibleBidCents,
              winnerUserId: null,
            },
          });
        }

        bidsCreated += 1;
      }

      await prisma.auctionBidIntent.update({
        where: {
          id: intent.id,
        },
        data: {
          activatedAt: input.now,
        },
      });

      continue;
    }

    const incumbentMaxBidCents = currentHighBid.maxBidCents ?? currentHighBid.amountCents;
    const minimumNextBidCents = calculateMinimumNextBidCents(
      currentBidCents,
      freshAuction.startingBidCents
    );

    if (intent.maxBidCents > incumbentMaxBidCents) {
      const visibleBidCents = Math.max(
        minimumNextBidCents,
        Math.min(
          intent.maxBidCents,
          incumbentMaxBidCents + calculateBidIncrementCents(incumbentMaxBidCents)
        )
      );

      if (visibleBidCents > currentBidCents) {
        await prisma.auctionBid.create({
          data: {
            auctionId: freshAuction.id,
            bidderType: "DUMMY",
            dummyBidderName: intent.dummyBidderName,
            amountCents: visibleBidCents,
            maxBidCents: intent.maxBidCents,
            createdAt: intent.dueAt,
          },
        });

        await prisma.auction.update({
          where: {
            id: freshAuction.id,
          },
          data: {
            currentBidCents: visibleBidCents,
            winnerUserId: null,
          },
        });

        bidsCreated += 1;
      }
    } else {
      const incumbentName = currentHighBid.dummyBidderName || "Private Bidder";

      const visibleBidCents = Math.max(
        currentBidCents,
        Math.min(
          incumbentMaxBidCents,
          intent.maxBidCents + calculateBidIncrementCents(intent.maxBidCents)
        )
      );

      if (visibleBidCents > currentBidCents) {
        await prisma.auctionBid.create({
          data: {
            auctionId: freshAuction.id,
            bidderType: "DUMMY",
            dummyBidderName: incumbentName,
            amountCents: visibleBidCents,
            maxBidCents: incumbentMaxBidCents,
            createdAt: intent.dueAt,
          },
        });

        await prisma.auction.update({
          where: {
            id: freshAuction.id,
          },
          data: {
            currentBidCents: visibleBidCents,
            winnerUserId: null,
          },
        });

        bidsCreated += 1;
      }
    }

    await prisma.auctionBidIntent.update({
      where: {
        id: intent.id,
      },
      data: {
        activatedAt: input.now,
      },
    });
  }

  return bidsCreated;
}

async function endAuctionIfExpired(input: {
  auctionId: number;
  now: Date;
}): Promise<boolean> {
  const auction = await prisma.auction.findUnique({
    where: {
      id: input.auctionId,
    },
    include: {
      bids: {
        orderBy: [
          {
            amountCents: "desc",
          },
          {
            createdAt: "asc",
          },
          {
            id: "asc",
          },
        ],
        take: 1,
      },
    },
  });

  if (!auction || auction.status !== "ACTIVE") return false;
  if (auction.endsAt > input.now) return false;

  const winningBid = auction.bids[0] ?? null;
  const winnerUserId =
    winningBid?.bidderType === "HUMAN" && winningBid.userId ? winningBid.userId : null;
  const currentBidCents = winningBid?.amountCents ?? auction.currentBidCents ?? 0;

  await prisma.auction.update({
    where: {
      id: auction.id,
    },
    data: {
      status: "ENDED",
      endedAt: input.now,
      winnerUserId,
      currentBidCents,
    },
  });

  return true;
}

export async function processAuctionLifecycle(input?: {
  auctionId?: number;
  limit?: number;
}): Promise<ProcessAuctionResult> {
  const now = new Date();
  const limit = input?.limit ?? 50;

  const auctions = await prisma.auction.findMany({
    where: {
      status: "ACTIVE",
      ...(input?.auctionId ? { id: input.auctionId } : {}),
    },
    orderBy: {
      endsAt: "asc",
    },
    take: limit,
  });

  let dummyBidsCreated = 0;
  let auctionsEnded = 0;
  const processedAuctionIds: number[] = [];

  for (const auction of auctions) {
    processedAuctionIds.push(auction.id);

    await ensureBidIntentsForAuction({
      auctionId: auction.id,
      createdAt: auction.createdAt,
      endsAt: auction.endsAt,
      valueBasisCents: auction.valueBasisCents,
      startingBidCents: auction.startingBidCents,
      hiddenDummyMaxBidCents: auction.hiddenDummyMaxBidCents,
    });

    dummyBidsCreated += await activateDueBidIntents({
      auctionId: auction.id,
      now,
    });

    const didEnd = await endAuctionIfExpired({
      auctionId: auction.id,
      now,
    });

    if (didEnd) auctionsEnded += 1;
  }

  return {
    processedAuctionIds,
    dummyBidsCreated,
    auctionsEnded,
  };
}