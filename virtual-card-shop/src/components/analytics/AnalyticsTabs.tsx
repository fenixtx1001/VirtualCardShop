"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/analytics", label: "Overview" },
  { href: "/analytics/collection", label: "Collection" },
  { href: "/analytics/finances", label: "Finances" },
  { href: "/analytics/boxes", label: "Boxes" },
];

export default function AnalyticsTabs() {
  const pathname = usePathname();

  return (
    <nav className="analytics-tabs" aria-label="Analytics sections">
      {tabs.map((tab) => {
        const active =
          tab.href === "/analytics"
            ? pathname === "/analytics"
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="analytics-tab"
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
