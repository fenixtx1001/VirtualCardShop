// src/app/analytics/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import AnalyticsClient from "./analytics-client";

export default function AnalyticsPage() {
  return (
    <>
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "14px 16px 0",
          fontFamily: "system-ui",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <Link
          href="/analytics/finances"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid #d8cab7",
            background: "linear-gradient(135deg, #08111f, #172033)",
            color: "#fff",
            borderRadius: 999,
            padding: "9px 13px",
            fontWeight: 950,
            textDecoration: "none",
            boxShadow: "0 12px 30px rgba(8,17,31,0.18)",
          }}
        >
          My Finances →
        </Link>

        <Link
          href="/analytics/boxes"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid #d8cab7",
            background: "linear-gradient(135deg, #7c2d12, #f59e0b)",
            color: "#fff",
            borderRadius: 999,
            padding: "9px 13px",
            fontWeight: 950,
            textDecoration: "none",
            boxShadow: "0 12px 30px rgba(124,45,18,0.18)",
          }}
        >
          Box Portfolio →
        </Link>
      </div>

      <AnalyticsClient />
    </>
  );
}