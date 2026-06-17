// src/app/analytics/boxes/[boxId]/page.tsx
export const dynamic = "force-dynamic";

import BoxDetailClient from "./box-detail-client";

type Props = {
  params: Promise<{ boxId: string }> | { boxId: string };
};

export default async function BoxDetailPage({ params }: Props) {
  const resolved = await Promise.resolve(params);
  return <BoxDetailClient boxId={resolved.boxId} />;
}