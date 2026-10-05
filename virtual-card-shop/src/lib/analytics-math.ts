export const CHICAGO_TIME_ZONE = "America/Chicago";

export function getChicagoDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

export function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function shiftDateKey(dateKey: string, days: number) {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function dateKeysBetween(firstDateKey: string, lastDateKey: string) {
  const keys: string[] = [];

  for (let key = firstDateKey; key <= lastDateKey; key = shiftDateKey(key, 1)) {
    keys.push(key);
  }

  return keys;
}

export function getPctChange(startCents: number, endCents: number) {
  if (!Number.isFinite(startCents) || startCents === 0) return null;
  return Math.round(((endCents - startCents) / startCents) * 1000) / 10;
}

export function signedFinancialAmount(
  direction: string | null | undefined,
  amountCents: number
) {
  const abs = Math.abs(Number(amountCents) || 0);
  return String(direction ?? "").toUpperCase() === "EXPENSE" ? -abs : abs;
}

export function openedPackCostBasisCents(
  totalCostBasisCents: number,
  packsOwned: number
) {
  const total = Math.max(0, Math.round(totalCostBasisCents || 0));
  const packs = Math.max(0, Math.round(packsOwned || 0));

  if (packs <= 0) return 0;
  if (packs === 1) return total;

  return Math.max(0, Math.round(total / packs));
}
