import SetDetailClient from "./set-detail-client";

export default async function AdminSetPage({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId: rawSetId } = await params;
  const setId = decodeURIComponent(rawSetId);

  return <SetDetailClient setId={setId} />;
}
