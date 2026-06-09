// src/app/analytics/finances/page.tsx
export const dynamic = "force-dynamic";

import FinancesClient from "./finances-client";

export default function FinancesPage() {
  return <FinancesClient />;
}