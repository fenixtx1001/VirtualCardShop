import { GET as getBlindPulse } from "../pulse/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compatibility route: never expose live rival financial totals through
// a legacy endpoint even though Collector Pulse no longer calls it.
export async function GET() {
  return getBlindPulse();
}
