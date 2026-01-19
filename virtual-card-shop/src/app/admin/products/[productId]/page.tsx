import ProductDetailClient from "./product-detail-client";

export const dynamic = "force-dynamic";

export default async function AdminProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return <ProductDetailClient productId={productId} />;
}
