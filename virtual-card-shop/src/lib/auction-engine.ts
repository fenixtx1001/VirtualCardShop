import { prisma } from "@/lib/prisma";
import {
  calculateBidIncrementCents,
  calculateMinimumNextBidCents,
  pickDummyBidderName,
} from "@/lib/auctions";

type ProcessAuctionResult = {
  processedAuctionIds: number[];
  dummyBidsCreated: number;
  auctionsEnded: number;
};

const AUCTION_STAGE_PERCENTAGES = [8, 17, 29, 43, 58, 72, 86, 96];

function seededNumber(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function getDueStageIndexes(input: {
  auctionId: number;
  createdAt: Date;
  endsAt: Date;
  now: Date;
}): number[] {
  const durationMs = input.endsAt.getTime() - input.createdAt.getTime();
  if (durationMs <= 0) return AUCTION_STAGE_PERCENTAGES.map((_, index) => index);

  const elapsedMs = input.now.getTime() - input.createdAt.getTime();
  const elapsedPct = Math.max(0, Math.min(100, (elapsedMs / durationMs) * 100));

  return AUCTION_STAGE_PERCENTAGES.map((basePct, index) => {
    const jitter = Math.round((seededNumber(input.auctionId * 100 + index) - 0.5) * 6);
    return {
      index,
      duePct: Math.max(1, Math.min(99, basePct + jitter)),
    };
  })
    .filter((stage) => elapsedPct >= stage.duePct)
    .map((stage) => stage.index);
}

function getDummyTargetForStage(input: {
  startingBidCents: number;
  hiddenDummyMaxBidCents: number;
  stageIndex: number;
  totalStages: number;
}): number {
  const start = Math.max(1, input.startingBidCents);
  const max = Math.max(start, input.hiddenDummyMaxBidCents);
  const progress = (input.stageIndex + 1) / input.totalStages;

  const curvedProgress = Math.pow(progress, 1.18);
  const target = start + Math.round((max - start) * curvedProgress);

  return Math.max(start, Math.min(max, target));
}

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

async function processDueDummyBids(input: {
  auctionId: number;
  createdAt: Date;
  endsAt: Date;
  now: Date;
  existingDummyBidCount: number;
  startingBidCents: number;
  hiddenDummyMaxBidCents: number;
}): Promise<number> {
  const dueStageIndexes = getDueStageIndexes({
    auctionId: input.auctionId,
    createdAt: input.createdAt,
    endsAt: input.endsAt,
    now: input.now,
  });

  let dummyBidsCreated = 0;

  for (const stageIndex of dueStageIndexes) {
    if (stageIndex < input.existingDummyBidCount + dummyBidsCreated) continue;

    const targetMaxBidCents = getDummyTargetForStage({
      startingBidCents: input.startingBidCents,
      hiddenDummyMaxBidCents: input.hiddenDummyMaxBidCents,
      stageIndex,
      totalStages: AUCTION_STAGE_PERCENTAGES.length,
    });

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
          ],
        },
      },
    });

    if (!freshAuction || freshAuction.status !== "ACTIVE") break;

    const currentHighBid = freshAuction.bids[0] ?? null;
    const currentBidCents = freshAuction.currentBidCents;
    const minimumNextBidCents = calculateMinimumNextBidCents(
      currentBidCents,
      freshAuction.startingBidCents
    );

    if (targetMaxBidCents < minimumNextBidCents) continue;

    if (currentHighBid?.bidderType === "HUMAN" && currentHighBid.userId) {
      const humanMaxBidCents = currentHighBid.maxBidCents ?? currentHighBid.amountCents;

      const proxyResult = getNextVisibleBidAgainstHuman({
        currentBidCents,
        startingBidCents: freshAuction.startingBidCents,
        challengerMaxBidCents: targetMaxBidCents,
        humanMaxBidCents,
      });

      if (proxyResult.winner === "human") {
        await prisma.auctionBid.create({
          data: {
            auctionId: freshAuction.id,
            userId: currentHighBid.userId,
            bidderType: "HUMAN",
            amountCents: proxyResult.visibleBidCents,
            maxBidCents: humanMaxBidCents,
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
            dummyBidderName: pickDummyBidderName(freshAuction.id + stageIndex),
            amountCents: proxyResult.visibleBidCents,
            maxBidCents: targetMaxBidCents,
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

      dummyBidsCreated += 1;
      continue;
    }

    const visibleBidCents =
      currentBidCents <= 0
        ? Math.max(freshAuction.startingBidCents, Math.min(targetMaxBidCents, minimumNextBidCents))
        : Math.min(targetMaxBidCents, minimumNextBidCents);

    await prisma.auctionBid.create({
      data: {
        auctionId: freshAuction.id,
        bidderType: "DUMMY",
        dummyBidderName: pickDummyBidderName(freshAuction.id + stageIndex),
        amountCents: visibleBidCents,
        maxBidCents: targetMaxBidCents,
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

    dummyBidsCreated += 1;
  }

  return dummyBidsCreated;
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
    include: {
      bids: {
        orderBy: [
          {
            amountCents: "desc",
          },
          {
            createdAt: "asc",
          },
        ],
      },
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

    dummyBidsCreated += await processDueDummyBids({
      auctionId: auction.id,
      createdAt: auction.createdAt,
      endsAt: auction.endsAt,
      now,
      existingDummyBidCount: auction.bids.filter((bid) => bid.bidderType === "DUMMY").length,
      startingBidCents: auction.startingBidCents,
      hiddenDummyMaxBidCents: auction.hiddenDummyMaxBidCents,
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