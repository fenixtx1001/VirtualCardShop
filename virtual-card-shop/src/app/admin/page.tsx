import Link from "next/link";

const tools = [
  { id: "01", title: "Card Maintenance", href: "/admin/cards", description: "Edit card details, book values, images, and VCS grading tiers." },
  { id: "02", title: "Image Backfill", href: "/admin/cards/image-backfill", description: "Prioritize owned cards missing front or back art." },
  { id: "03", title: "VCS Harvest", href: "/admin/set-factory/capture", description: "Capture reference card images into a selected set." },
  { id: "04", title: "Player Repository", href: "/admin/player-tiers", description: "Manage player tiers that drive automated pricing." },
  { id: "05", title: "Paste Import", href: "/admin/import", description: "Import copied checklist rows into a product set." },
  { id: "06", title: "Legacy Set Editor", href: "/admin/sets", description: "Maintain earlier set records and their cards." },
];

export default function AdminHomePage() {
  return (
    <section className="vcs-admin-home">
      <header className="vcs-admin-home-heading">
        <span className="vcs-admin-home-eyebrow">ADMINISTRATION / CONTROL ROOM</span>
        <h1>Operations overview</h1>
        <p className="vcs-admin-home-lead">
          Your behind-the-scenes workspace for the VCS catalog, pricing, grading setup, and image pipeline.
          Choose a workflow below or jump straight to the tool you need.
        </p>
      </header>

      <section className="vcs-admin-home-feature" aria-labelledby="admin-workflow-heading">
        <div>
          <span className="vcs-admin-home-eyebrow">STANDARD CATALOG WORKFLOW</span>
          <h2 id="admin-workflow-heading">Build from product to checklist.</h2>
          <p>
            Keep the product hierarchy accurate: configure the sealed product, organize its base and
            insert sets, then import and maintain individual cards. This order keeps pack configuration,
            image harvesting, and catalog navigation aligned.
          </p>
        </div>
        <nav className="vcs-admin-home-workflow" aria-label="Catalog workflow">
          <Link href="/admin/products"><span>STEP 01</span><strong>Products ↗</strong><small>Sealed packs, boxes &amp; release settings</small></Link>
          <Link href="/admin/product-sets"><span>STEP 02</span><strong>Product sets ↗</strong><small>Base, inserts, odds &amp; defaults</small></Link>
          <Link href="/admin/cards"><span>STEP 03</span><strong>Cards ↗</strong><small>Checklists, images &amp; grading</small></Link>
        </nav>
      </section>

      <h2 className="vcs-admin-home-section-heading">Tools &amp; maintenance</h2>
      <nav className="vcs-admin-home-grid" aria-label="Administration tools">
        {tools.map((item) => (
          <Link key={item.href} href={item.href} className="vcs-admin-home-tile">
            <span className="vcs-admin-home-tile-top"><span>OPS / {item.id}</span><span aria-hidden="true">↗</span></span>
            <strong>{item.title}</strong>
            <small>{item.description}</small>
          </Link>
        ))}
      </nav>

      <div className="vcs-admin-home-note">
        <strong>Working with pricing?</strong> Assign players in the{" "}
        <Link href="/admin/player-tiers">Player Repository</Link>, then open the relevant{" "}
        <Link href="/admin/product-sets">Product Set</Link> to apply pricing. For missing artwork, use{" "}
        <Link href="/admin/cards/image-backfill">Image Backfill</Link>. The legacy set editor remains available
        for older records; new products should use the modern product hierarchy.
      </div>
    </section>
  );
}
