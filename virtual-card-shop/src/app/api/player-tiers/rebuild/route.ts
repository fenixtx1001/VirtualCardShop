import { NextResponse } from "next/server";
// C001 preserves raw records and conflicting historical values. Never merge/delete
// profiles on an unreviewed global rebuild. Use the read-only repository instead.
export async function POST() {
  return NextResponse.json({ok:false,error:"Global rebuild disabled: review canonical, conflict and artifact groups in Player Tiers. No records changed."},{status:409});
}
