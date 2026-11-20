"use client";

import { usePathname } from "next/navigation";
import AppHeader from "./AppHeader";

/** Admin supplies its own navigation; do not mount collector stats/reward polling there. */
export default function AppHeaderRouteGate() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <AppHeader />;
}
