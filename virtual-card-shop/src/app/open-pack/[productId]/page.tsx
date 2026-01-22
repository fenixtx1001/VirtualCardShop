import OpenPackClient from "./open-pack-client";

export const dynamic = "force-dynamic";

type Ctx =
  | { params: { productId?: string } }
  | { params: Promise<{ productId?: string }> };

async function getProductId(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;

  const raw = params?.productId;
  if (!raw || typeof raw !== "string") return null;

  // decode safely (it might already be decoded)
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function OpenPackPage(ctx: Ctx) {
  const productId = await getProductId(ctx);

  // If missing, still render the client with empty string so you SEE it
  // (but it won't try to open successfully)
  return <OpenPackClient productId={productId ?? ""} />;
}
