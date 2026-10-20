import RegistryClient from "./registry-client";
import "./registry.css";

type Props = {
  params: Promise<{ productSetId: string }>;
  searchParams?: Promise<{ userId?: string }>;
};
export default async function RegistryPage({ params, searchParams }: Props) {
  const { productSetId } = await params;
  const query = searchParams ? await searchParams : {};
  return <RegistryClient productSetId={productSetId} targetUserId={query.userId || ""} />;
}
