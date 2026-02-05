// src/app/rip-pack/page.tsx
import { redirect } from "next/navigation";

type Props = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function first(v: string | string[] | undefined) {
  if (!v) return "";
  return Array.isArray(v) ? (v[0] ?? "") : v;
}

export default function RipPackRedirectPage({ searchParams }: Props) {
  // Support both ?productId=... and ?product=... just in case
  const productId =
    (searchParams?.productId && first(searchParams.productId)) ||
    (searchParams?.product && first(searchParams.product)) ||
    "";

  // If we have a productId, send them to the real flow
  if (productId.trim()) {
    redirect(`/open-pack?productId=${encodeURIComponent(productId.trim())}`);
  }

  // Otherwise, just send them to Inventory (where they can pick a pack)
  redirect("/inventory");
}
