import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "vcs_set_factory_active_product_set_id";

export async function GET(request: NextRequest) {
  const productSetId = request.cookies.get(COOKIE_NAME)?.value?.trim() || "";

  return NextResponse.json(
    { productSetId },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    }
  );
}

export async function POST(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite && fetchSite !== "same-origin") {
    return NextResponse.json(
      { error: "Active Product Set must be changed from VCS." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const productSetId =
    typeof body?.productSetId === "string" ? body.productSetId.trim() : "";

  if (!productSetId) {
    return NextResponse.json(
      { error: "productSetId is required." },
      { status: 400 }
    );
  }

  const response = NextResponse.json({
    ok: true,
    productSetId,
  });

  response.cookies.set({
    name: COOKIE_NAME,
    value: productSetId,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
