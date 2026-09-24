import { redirect } from "next/navigation";
import CardDetailClient from "./card-detail-client";
export default async function CardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string }>;
  searchParams: Promise<{ grade?: string }>;
}) {
  const { cardId: raw } = await params;
  const { grade } = await searchParams;
  const cardId = Number(raw);
  if (!Number.isSafeInteger(cardId) || cardId <= 0) redirect("/collection");
  return <CardDetailClient key={`${cardId}:${grade || 0}`} cardId={cardId} />;
}
