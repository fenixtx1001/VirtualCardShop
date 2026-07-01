import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const AUCTION_DURATION_MS = 24 * 60 * 60 * 1000;

const OUTCOME_TABLE = [
  { key: "COLD", odds: 5, minBps: 6000, maxBps: 7000 },
  { key: "SOFT", odds: 20, minBps: 7000, maxBps: 8000 },
  { key: "NORMAL", odds: 40, minBps: 8000, maxBps: 9000 },
  { key: "STRONG", odds: 25, minBps: 9000, maxBps: 10000 },
  { key: "HOT", odds: 8, minBps: 10000, maxBps: 11500 },
  { key: "BIDDING_WAR", odds: 2, minBps: 11500, maxBps: 13500 },
];

const DUMMY_NAMES = [
  "WaxPackWendy",
  "GemMintGreg",
  "VintageVince",
  "CardboardCarl",
  "ProspectPete",
  "SlabHunterSam",
  "SetBuilderSue",
  "RipCityRyan",
  "ChromeKingChris",
  "BinderBossBen",
  "FoilFanFrank",
  "RookieRadarRob",
];

function rollOutcome() {
  const roll = Math.random() * 100;
  let cumulative = 0;

  for (const row of OUTCOME_TABLE) {
    cumulative += row.odds;
    if (roll < cumulative) {
      const bps = row.minBps + Math.round(Math.random() * (row.maxBps - row.minBps));
      return { ...row, bps };
    }
  }

  const row = OUTCOME_TABLE[OUTCOME_TABLE.length - 1];
  const bps = row.minBps + Math.round(Math.random() * (row.maxBps - row.minBps));
  return { ...row, bps };
}

function applyBps(cents, bps) {
  return Math.max(1, Math.round((cents * bps) / 10000));
}

function seededNumber(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function pickName(seed) {
  return DUMMY_NAMES[Math.abs(Math.round(seed)) % DUMMY_NAMES.length];
}

function calculateBidIncrementCents(currentBidCents) {
  const current = Math.max(0, Math.round(currentBidCents || 0));

  if (current < 25) return 1;
  if (current < 100) return 5;
  if (current < 500) return 10;
  if (current < 2000) return 25;
  if (current < 5000) return 50;
  if (current < 10000) return 100;

  return Math.max(100, Math.round(current * 0.02));
}

function getIntentCount({ valueBasisCents, startingBidCents, hiddenDummyMaxBidCents, tierKey }) {
  const gap = Math.max(0, hiddenDummyMaxBidCents - startingBidCents);
  const percentTarget =
    valueBasisCents > 0 ? Math.round((hiddenDummyMaxBidCents * 10000) / valueBasisCents) : 0;

  if (gap <= 0) return 1;
  if (valueBasisCents <= 100) return percentTarget >= 10000 ? 3 : 2;
  if (valueBasisCents <= 500) return percentTarget >= 10000 ? 5 : 3;
  if (valueBasisCents <= 2500) return percentTarget >= 10000 ? 8 : 5;
  if (valueBasisCents <= 10000) return percentTarget >= 10000 ? 12 : 7;

  switch (tierKey) {
    case "BIDDING_WAR":
      return 28;
    case "HOT":
      return 20;
    case "STRONG":
      return 15;
    case "NORMAL":
      return 11;
    case "SOFT":
      return 8;
    case "COLD":
    default:
      return 6;
  }
}

function getIntentTimePct({ index, count, auctionIdSeed }) {
  const progress = count <= 1 ? 0.94 : index / (count - 1);
  const backloaded = Math.pow(progress, 1.65);
  const basePct = 8 + backloaded * 90;
  const jitter = (seededNumber(auctionIdSeed * 73 + index * 19) - 0.5) * 10;
  return Math.max(3, Math.min(98.8, basePct + jitter));
}

function getIntentMaxCents({ index, count, startingBidCents, hiddenDummyMaxBidCents, auctionIdSeed }) {
  const start = Math.max(1, startingBidCents);
  const max = Math.max(start, hiddenDummyMaxBidCents);

  if (count <= 1 || index === count - 1) return max;

  if (index === count - 2) {
    const supportBid = max - calculateBidIncrementCents(max);
    return Math.max(start, Math.min(max - 1, supportBid));
  }

  const progress = index / (count - 1);
  const curved = Math.pow(progress, 1.15);
  const jitter = (seededNumber(auctionIdSeed * 101 + index * 31) - 0.5) * 0.06;
  const adjusted = Math.max(0.04, Math.min(0.92, curved + jitter));

  return Math.max(start, Math.min(max - 1, start + Math.round((max - start) * adjusted)));
}

function generateIntents({
  auctionId,
  createdAt,
  endsAt,
  valueBasisCents,
  startingBidCents,
  hiddenDummyMaxBidCents,
  tierKey,
}) {
  const count = getIntentCount({
    valueBasisCents,
    startingBidCents,
    hiddenDummyMaxBidCents,
    tierKey,
  });

  const durationMs = Math.max(1, endsAt.getTime() - createdAt.getTime());

  return Array.from({ length: count }, (_, index) => {
    const timePct = getIntentTimePct({ index, count, auctionIdSeed: auctionId });
    const dueAt = new Date(createdAt.getTime() + Math.round(durationMs * (timePct / 100)));

    return {
      auctionId,
      dummyBidderName: pickName(auctionId + index),
      maxBidCents: getIntentMaxCents({
        index,
        count,
        startingBidCents,
        hiddenDummyMaxBidCents,
        auctionIdSeed: auctionId,
      }),
      dueAt,
    };
  }).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.maxBidCents - b.maxBidCents);
}

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
      valueBasisCents: true,
      startingBidCents: true,
    },
    orderBy: {
      endedAt: "desc",
    },
  });

  console.log(`Found ${auctions.length} ended, uncollected auctions to reroll and restart.`);

  const distribution = {};

  for (const auction of auctions) {
    const outcome = rollOutcome();
    const hiddenDummyMaxBidCents = applyBps(auction.valueBasisCents, outcome.bps);

    const intents = generateIntents({
      auctionId: auction.id,
      createdAt: now,
      endsAt: newEndsAt,
      valueBasisCents: auction.valueBasisCents,
      startingBidCents: auction.startingBidCents,
      hiddenDummyMaxBidCents,
      tierKey: outcome.key,
    });

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
          hiddenDummyMaxBidCents,
          createdAt: now,
          endsAt: newEndsAt,
          endedAt: null,
          collectedAt: null,
        },
      });

      if (intents.length > 0) {
        await tx.auctionBidIntent.createMany({
          data: intents,
        });
      }
    });

    distribution[outcome.key] = (distribution[outcome.key] ?? 0) + 1;

    const finalSupport = intents.length >= 2 ? intents[intents.length - 2]?.maxBidCents : null;
    const finalMax = intents[intents.length - 1]?.maxBidCents ?? null;

    console.log(
      `Auction ${auction.id}: ${outcome.key} ${(outcome.bps / 100).toFixed(
        1
      )}% -> ${hiddenDummyMaxBidCents}/${auction.valueBasisCents} | support=${finalSupport} final=${finalMax}`
    );
  }

  console.log("Distribution:", distribution);
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