import ShowcaseClient from "./showcase-client";
import "./showcase.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ShowcasePage() {
  return <ShowcaseClient />;
}
