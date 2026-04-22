import PlayerTiersClient from "./player-tiers-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AdminPlayerTiersPage() {
  return <PlayerTiersClient />;
}