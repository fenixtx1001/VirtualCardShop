import { redirect } from "next/navigation";
import CardDetailClient from "./card-detail-client";

type Ctx =
  | { params: { cardId?: string } }
  | { params: Promise<{ cardId?: string }> };

async function getCardId(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;

  const raw = params?.cardId;
  if (typeof raw !== "string" || !raw.trim()) return undefined;

  const s = raw.trim();
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

export default async function CardDetailPage(ctx: Ctx) {
  const cardId = await getCardId(ctx);
  if (!cardId) redirect("/collection");
  return <CardDetailClient cardId={cardId} />;
}
