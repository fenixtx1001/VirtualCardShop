import OpenPackClient from "./open-pack-client";

export const dynamic = "force-dynamic";

export default async function OpenPackPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return <OpenPackClient productId={decodeURIComponent(productId)} />;
}
