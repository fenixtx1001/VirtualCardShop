import { redirect } from "next/navigation";
import BinderClient from "./binder-client";
import "./binder.css";

type Props = {
  params: Promise<{ productId: string }> | { productId: string };
  searchParams?: Promise<{ productSetId?: string }> | { productSetId?: string };
};

export default async function BinderPage({ params, searchParams }: Props) {
  const { productId } = await params;
  const query = searchParams ? await searchParams : {};
  if (!productId) redirect("/collection");
  return <BinderClient productId={productId}
    initialProductSetId={typeof query.productSetId === "string" ? query.productSetId : ""} />;
}
