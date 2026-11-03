import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { dateKeysBetween, getChicagoDateKey, getPctChange, shiftDateKey } from "@/lib/analytics-math";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Blind Daily Climb: live opponent progress is not even queried, much less
// returned to the browser. Only completed days can reveal a winner.
export async function GET() {
  try {
    const me = await requireUser();
    const todayKey = getChicagoDateKey();
    const yesterdayKey = shiftDateKey(todayKey, -1);
    const historyStart = shiftDateKey(todayKey, -62);
    const weekStart = shiftDateKey(todayKey, -6);

    const [users, snapshots] = await Promise.all([
      prisma.user.findMany({
        select: { id: true, name: true, email: true, balanceCents: true },
        orderBy: [{ name: "asc" }, { email: "asc" }],
      }),
      prisma.financialDailySnapshot.findMany({
        where: {
          valuationVersion: { gte: 2 },
          OR: [
            { dateKey: { gte: historyStart, lt: todayKey } },
            { userId: me.id, dateKey: todayKey },
          ],
        },
        orderBy: [{ dateKey: "asc" }, { userId: "asc" }],
        select: {
          userId: true,
          dateKey: true,
          balanceCents: true,
          collectionValueCents: true,
          sealedValueCents: true,
          openingNetWorthCents: true,
          closingNetWorthCents: true,
        },
      }),
    ]);

    const meRecord = users.find((user) => user.id === me.id);
    const byUserDay = new Map(snapshots.map((row) => [row.userId + ":" + row.dateKey, row]));
    const myHistory = snapshots.filter((row) => row.userId === me.id);
    const latest = myHistory.at(-1);
    const myToday = byUserDay.get(me.id + ":" + todayKey);
    const balanceCents = latest?.balanceCents ?? meRecord?.balanceCents ?? 0;
    const collectionValueCents = latest?.collectionValueCents ?? 0;
    const sealedValueCents = latest?.sealedValueCents ?? 0;
    const netWorthCents = latest?.closingNetWorthCents ?? balanceCents;
    const myGainCents = myToday
      ? myToday.closingNetWorthCents - myToday.openingNetWorthCents
      : 0;
    const myGainPct = myToday
      ? getPctChange(myToday.openingNetWorthCents, myToday.closingNetWorthCents)
      : null;

    let carried = myHistory.filter((row) => row.dateKey < weekStart).at(-1) ??
      myHistory.find((row) => row.dateKey >= weekStart) ?? null;
    const trend = dateKeysBetween(weekStart, todayKey).map((dateKey) => {
      carried = byUserDay.get(me.id + ":" + dateKey) ?? carried;
      return { dateKey, value: carried?.closingNetWorthCents ?? netWorthCents };
    });
    const firstDay = byUserDay.get(me.id + ":" + weekStart);
    const startingNetWorthCents = firstDay
      ? firstDay.openingNetWorthCents
      : (trend[0]?.value ?? netWorthCents);
    const sevenDayChangeCents = netWorthCents - startingNetWorthCents;

    function uniqueWinner(dateKey: string) {
      let bestCents = 0;
      let winner: (typeof users)[number] | null = null;
      let tied = false;
      for (const user of users) {
        const row = byUserDay.get(user.id + ":" + dateKey);
        const gainCents = row ? row.closingNetWorthCents - row.openingNetWorthCents : 0;
        if (gainCents > bestCents) {
          bestCents = gainCents;
          winner = user;
          tied = false;
        } else if (gainCents > 0 && gainCents === bestCents) {
          tied = true;
        }
      }
      return winner && !tied ? { userId: winner.id, label: winner.name?.trim() || winner.email?.trim() || "Collector", gainCents: bestCents } : null;
    }

    const completed = dateKeysBetween(historyStart, yesterdayKey);
    const winners = new Map(completed.map((day) => [day, uniqueWinner(day)]));
    const monthStart = todayKey.slice(0, 7) + "-01";
    const myMonthlyWins = completed.reduce(
      (sum, day) => sum + (day >= monthStart && winners.get(day)?.userId === me.id ? 1 : 0),
      0
    );
    let myWinStreak = 0;
    for (let i = completed.length - 1; i >= 0; i--) {
      if (winners.get(completed[i])?.userId !== me.id) break;
      myWinStreak++;
    }
    const lastWeekStart = shiftDateKey(todayKey, -7);
    const personalBestCents = completed
      .filter((day) => day >= lastWeekStart)
      .reduce((best, day) => {
        const row = byUserDay.get(me.id + ":" + day);
        const gain = row ? row.closingNetWorthCents - row.openingNetWorthCents : 0;
        return Math.max(best, gain);
      }, 0);

    return NextResponse.json({
      ok: true,
      dateKey: todayKey,
      timeZone: "America/Chicago",
      portfolio: {
        balanceCents, collectionValueCents, sealedValueCents, netWorthCents,
        myGainCents, myGainPct, sevenDayChangeCents,
        sevenDayChangePct: getPctChange(startingNetWorthCents, netWorthCents),
        hasSnapshot: Boolean(latest),
      },
      trend,
      challenge: {
        mode: "blind",
        myGainCents, myGainPct,
        personalBestCents, myMonthlyWins, myWinStreak,
        collectorCount: users.length,
        yesterdayWinner: winners.get(yesterdayKey) ?? null,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not load Collector Pulse.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "Unauthorized" ? 401 : 500 }
    );
  }
}
