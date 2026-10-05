import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import {
  dateKeysBetween,
  getChicagoDateKey,
  getPctChange,
  shiftDateKey,
} from "@/lib/analytics-math";
import { syncDailyPortfolioSnapshot } from "@/lib/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SnapshotLite = {
  userId: string;
  dateKey: string;
  openingNetWorthCents: number;
  closingNetWorthCents: number;
};

function delta(snapshot: SnapshotLite | null | undefined) {
  return snapshot
    ? snapshot.closingNetWorthCents - snapshot.openingNetWorthCents
    : 0;
}

export async function GET() {
  try {
    const me = await requireUser();
    const todayKey = getChicagoDateKey();

    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, image: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });

    const todaySnapshots = new Map<string, Awaited<ReturnType<typeof syncDailyPortfolioSnapshot>>>();

    for (const user of users) {
      todaySnapshots.set(user.id, await syncDailyPortfolioSnapshot(prisma, user.id));
    }

    const historyStart = shiftDateKey(todayKey, -62);

    const history = await prisma.financialDailySnapshot.findMany({
      where: {
        userId: { in: users.map((user) => user.id) },
        dateKey: { gte: historyStart, lte: todayKey },
        valuationVersion: { gte: 2 },
      },
      select: {
        userId: true,
        dateKey: true,
        openingNetWorthCents: true,
        closingNetWorthCents: true,
      },
    });

    const byUserDate = new Map<string, SnapshotLite>();
    for (const snapshot of history) {
      byUserDate.set(`${snapshot.userId}:${snapshot.dateKey}`, snapshot);
    }

    function uniqueWinner(dateKey: string) {
      const standings = users.map((user) => ({
        user,
        gainCents: delta(byUserDate.get(`${user.id}:${dateKey}`)),
      }));

      const best = Math.max(0, ...standings.map((row) => row.gainCents));
      if (best <= 0) return null;

      const leaders = standings.filter((row) => row.gainCents === best);
      return leaders.length === 1 ? leaders[0] : null;
    }

    const yesterdayKey = shiftDateKey(todayKey, -1);
    const completedHistoryKeys =
      yesterdayKey >= historyStart ? dateKeysBetween(historyStart, yesterdayKey) : [];

    const monthStart = `${todayKey.slice(0, 7)}-01`;
    const monthlyWins = new Map<string, number>();

    for (const dateKey of completedHistoryKeys) {
      if (dateKey < monthStart) continue;
      const winner = uniqueWinner(dateKey);
      if (!winner) continue;
      monthlyWins.set(winner.user.id, (monthlyWins.get(winner.user.id) ?? 0) + 1);
    }

    const winStreaks = new Map<string, number>();

    for (const user of users) {
      let streak = 0;

      for (let index = completedHistoryKeys.length - 1; index >= 0; index -= 1) {
        const winner = uniqueWinner(completedHistoryKeys[index]);
        if (winner?.user.id === user.id) streak += 1;
        else break;
      }

      winStreaks.set(user.id, streak);
    }

    const yesterday = uniqueWinner(yesterdayKey);

    const rows = users
      .map((user) => {
        const snapshot = todaySnapshots.get(user.id)!;
        const gainCents = snapshot.closingNetWorthCents - snapshot.openingNetWorthCents;

        return {
          userId: user.id,
          label: user.name?.trim() || user.email?.trim() || "Collector",
          image: user.image,
          isMe: user.id === me.id,
          openingNetWorthCents: snapshot.openingNetWorthCents,
          netWorthCents: snapshot.closingNetWorthCents,
          gainCents,
          gainPct: getPctChange(snapshot.openingNetWorthCents, snapshot.closingNetWorthCents),
          monthlyWins: monthlyWins.get(user.id) ?? 0,
          winStreak: winStreaks.get(user.id) ?? 0,
        };
      })
      .sort((a, b) => {
        if (b.gainCents !== a.gainCents) return b.gainCents - a.gainCents;
        if ((b.gainPct ?? -Infinity) !== (a.gainPct ?? -Infinity)) {
          return (b.gainPct ?? -Infinity) - (a.gainPct ?? -Infinity);
        }
        return a.label.localeCompare(b.label);
      })
      .map((row, index) => ({ ...row, rank: index + 1 }));

    return NextResponse.json({
      ok: true,
      dateKey: todayKey,
      timeZone: "America/Chicago",
      currentUserId: me.id,
      yesterdayWinner: yesterday
        ? {
            userId: yesterday.user.id,
            label: yesterday.user.name?.trim() || yesterday.user.email?.trim() || "Collector",
            gainCents: yesterday.gainCents,
          }
        : null,
      rows,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load Daily Climb",
      },
      { status: 500 }
    );
  }
}
