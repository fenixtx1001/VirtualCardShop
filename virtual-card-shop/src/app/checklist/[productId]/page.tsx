import { redirect } from "next/navigation";
import ChecklistClient from "./checklist-client";

type Ctx =
  | { params: { productId?: string } }
  | { params: Promise<{ productId?: string }> };

async function getProductId(ctx: Ctx) {
  const p: any = (ctx as any).params;
  const params = typeof p?.then === "function" ? await p : p;

  const raw = params?.productId;
  if (typeof raw !== "string" || !raw.trim()) return undefined;

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function ChecklistPage(ctx: Ctx) {
  const productId = await getProductId(ctx);

  if (!productId) {
    redirect("/collection");
  }

  return <ChecklistClient productId={productId} />;
}
