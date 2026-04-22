export default function AdminHomePage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Admin</h1>
      <p style={{ marginBottom: 24 }}>
        Manage your product tree (Product → Product Set → Cards) and admin tools.
      </p>

      <ul style={{ lineHeight: 2 }}>
        <li>
          <a href="/">← Back to Home</a>
        </li>
        <li>
          <a href="/admin/products">Admin: Products (top level)</a>
        </li>
        <li>
          <a href="/admin/product-sets">Admin: Product Sets</a>
        </li>
        <li>
          <a href="/admin/player-tiers">Admin: Player Repository / Tiers</a>
        </li>
        <li>
          <a href="/admin/sets">Admin: Sets (legacy)</a>
        </li>
        <li>
          <a href="/admin/import">Admin: Paste import</a>
        </li>
      </ul>

      <hr style={{ margin: "18px 0" }} />

      <p style={{ maxWidth: 820 }}>
        Recommended workflow: start in <b>Products</b>, create/select a Product, then create its Product Sets
        (Base/Elite/etc.), then import or attach cards to the right Product Set.
      </p>

      <p style={{ maxWidth: 820, marginTop: 14 }}>
        For pricing automation, use <b>Player Repository / Tiers</b> to assign player tiers, then go to a Product Set
        and use the pricing tools to fill blank prices, overwrite all prices, or pull a default on a single row.
      </p>
    </main>
  );
}