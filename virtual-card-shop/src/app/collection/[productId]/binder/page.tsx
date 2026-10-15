import { redirect } from "next/navigation";
import BinderClient from "./binder-client";
import "./binder.css";

type Props = {
  params: Promise<{ productId: string }> | { productId: string };
  searchParams?: Promise<{ productSetId?: string; cardId?: string; open?: string }> |
    { productSetId?: string; cardId?: string; open?: string };
};

export default async function BinderPage({ params, searchParams }: Props) {
  const { productId } = await params;
  const query = searchParams ? await searchParams : {};
  if (!productId) redirect("/collection");
  const cardId = typeof query.cardId === "string" ? Number(query.cardId) : 0;
  return <BinderClient productId={productId}
    initialProductSetId={typeof query.productSetId === "string" ? query.productSetId : ""}
    initialCardId={Number.isSafeInteger(cardId) && cardId > 0 ? cardId : null}
    initialOpen={query.open === "1"} />;
}
