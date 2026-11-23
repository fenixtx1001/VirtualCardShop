"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import AdminRewardClaim from "./AdminRewardClaim";

type AdminArea = {
  href: string;
  label: string;
  category: "catalog" | "operations";
  description: string;
  detail: string;
  links: { href: string; label: string }[];
};

const areas: AdminArea[] = [
  {
    href: "/admin/products",
    label: "Products",
    category: "catalog",
    description: "Configure the sealed products collectors buy and open.",
    detail: "Edit product information, release status, pack and box images, pricing, and packaging. Open a product to manage its related sets.",
    links: [{ href: "/admin/product-sets", label: "Manage product sets" }, { href: "/shop", label: "View the Shop" }],
  },
  {
    href: "/admin/product-sets",
    label: "Product sets",
    category: "catalog",
    description: "Manage base sets, inserts, parallels, odds, and checklist configuration.",
    detail: "Select a product set to edit its cards, rarity settings, images, grading defaults, and price tools. Changes here affect how packs are built.",
    links: [{ href: "/admin/products", label: "Find parent product" }, { href: "/admin/cards", label: "Edit cards across sets" }],
  },
  {
    href: "/admin/cards",
    label: "Cards",
    category: "catalog",
    description: "Search and maintain individual card records across the library.",
    detail: "Use the filters to locate cards, then update names, numbering, valuation, tier overrides, and images. Save only the intended records.",
    links: [{ href: "/admin/cards/image-backfill", label: "Open image queue" }, { href: "/admin/player-tiers", label: "Player tier rules" }],
  },
  {
    href: "/admin/cards/image-backfill",
    label: "Image queue",
    category: "operations",
    description: "Find high-priority cards missing front or back images.",
    detail: "Filter by missing side and search term. Upload or correct images and card details without leaving the queue.",
    links: [{ href: "/admin/cards", label: "All card records" }, { href: "/admin/set-factory/capture", label: "VCS Harvest" }],
  },
  {
    href: "/admin/player-tiers",
    label: "Player tiers",
    category: "operations",
    description: "Maintain the player repository used by automated card pricing.",
    detail: "Assign a player tier, manage ignored name tokens, and rebuild matches when necessary. Product-set pricing tools apply these rules.",
    links: [{ href: "/admin/product-sets", label: "Apply set pricing" }],
  },
  {
    href: "/admin/set-factory/capture",
    label: "VCS Harvest",
    category: "operations",
    description: "Capture card images from supported source pages.",
    detail: "Select the active product set first. Follow the on-page capture instructions to send images to the intended set.",
    links: [{ href: "/admin/product-sets", label: "Find product set ID" }, { href: "/admin/cards/image-backfill", label: "Review missing images" }],
  },
  {
    href: "/admin/import",
    label: "Paste import",
    category: "operations",
    description: "Import tabular checklist data into an existing product set.",
    detail: "Verify the destination product set ID, paste the source rows, and review the created and updated counts afterward.",
    links: [{ href: "/admin/product-sets", label: "Find destination set" }, { href: "/admin/products", label: "Manage products" }],
  },
  {
    href: "/admin/sets",
    label: "Legacy sets",
    category: "operations",
    description: "Maintain older set records and their cards.",
    detail: "This is the legacy set editor. For newer sealed products and related insert sets, use Products and Product Sets instead.",
    links: [{ href: "/admin/products", label: "Modern products" }, { href: "/admin/import", label: "Paste import" }],
  },
];

const isCurrent = (path: string, href: string) => path === href || path.startsWith(href + "/");

export default function AdminFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/admin";
  const current = [...areas].sort((a, b) => b.href.length - a.href.length).find((area) => isCurrent(pathname, area.href));
  const isOverview = pathname === "/admin";
  const detailMode = !!current && pathname !== current.href;

  return (
    <div className="vcs-admin-shell">
      <div className="vcs-admin-topbar">
        <div className="vcs-admin-topbar-inner">
          <Link className="vcs-admin-brand" href="/admin" aria-label="VCS Admin overview"><span className="vcs-admin-symbol">V</span><span>VCS <b>OPERATIONS</b></span></Link>
          <span className="vcs-admin-environment">INTERNAL WORKSPACE <i aria-hidden="true" /> ADMIN MODE</span>
          <div className="vcs-admin-topbar-actions">
            <AdminRewardClaim />
            <Link className="vcs-admin-exit" href="/">Exit to VCS <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </div>
      <div className="vcs-admin-frame">
        <nav className="vcs-admin-nav" aria-label="Administration sections">
          <div className="vcs-admin-nav-inner">
            <Link className={"vcs-admin-nav-link vcs-admin-nav-overview" + (isOverview ? " is-active" : "")} href="/admin" aria-current={isOverview ? "page" : undefined}>Overview</Link>
            <span className="vcs-admin-nav-group">CATALOG</span>
            {areas.filter((area) => area.category === "catalog").map((area) =>
              <Link key={area.href} href={area.href} className={"vcs-admin-nav-link" + (current?.href === area.href ? " is-active" : "")}
                aria-current={current?.href === area.href ? "page" : undefined}>{area.label}</Link>
            )}
            <span className="vcs-admin-nav-group">TOOLS</span>
            {areas.filter((area) => area.category === "operations").map((area) =>
              <Link key={area.href} href={area.href} className={"vcs-admin-nav-link" + (current?.href === area.href ? " is-active" : "")}
                aria-current={current?.href === area.href ? "page" : undefined}>{area.label}</Link>
            )}
          </div>
        </nav>
        {current && (
          <aside className="vcs-admin-context" aria-label="Current administration tool">
            <div className="vcs-admin-context-primary">
              <div className="vcs-admin-path">
                <Link href="/admin">ADMIN</Link><span aria-hidden="true">/</span>
                {detailMode ? <><Link href={current.href}>{current.label.toUpperCase()}</Link><span aria-hidden="true">/</span><span>DETAIL</span></> : <span>{current.label.toUpperCase()}</span>}
              </div>
              <p><strong>{current.description}</strong> {current.detail}</p>
            </div>
            <div className="vcs-admin-context-links" aria-label="Related tools">
              {current.links.map((link) => <Link key={link.href} href={link.href}>{link.label} <span aria-hidden="true">↗</span></Link>)}
            </div>
          </aside>
        )}
        <div className="vcs-admin-content">{children}</div>
        <footer className="vcs-admin-footer"><span>VCS / INTERNAL OPERATIONS</span><Link href="/">Return to collector experience ↗</Link></footer>
      </div>
    </div>
  );
}
