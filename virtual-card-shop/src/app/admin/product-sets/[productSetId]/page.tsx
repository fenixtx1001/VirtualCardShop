import ProductSetDetailClient from "./product-set-detail-client";

export const dynamic = "force-dynamic";

type Props =
  | { params: { productSetId?: string; productsetid?: string } }
  | { params: Promise<{ productSetId?: string; productsetid?: string }> };

async function getParam(props: Props) {
  const p: any = (props as any).params;
  const params = typeof p?.then === "function" ? await p : p;
  return (params?.productSetId ?? params?.productsetid ?? "") as string;
}

export default async function AdminProductSetDetailPage(props: Props) {
  const productSetId = await getParam(props);
  return <ProductSetDetailClient productSetId={productSetId} />;
}
