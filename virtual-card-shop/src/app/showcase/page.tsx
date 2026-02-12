// src/app/showcase/page.tsx
import ShowcaseClient from "./showcase-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ShowcasePage() {
  return <ShowcaseClient />;
}
