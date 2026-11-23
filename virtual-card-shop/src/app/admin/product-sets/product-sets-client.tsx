"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { formatPublishedOdds, getPublishedOdds } from "@/lib/published-product-set-odds";

type ProductSetRow = {
  id: string;
  productId: string;
  name: string | null;
  isBase: boolean;
  isInsert: boolean;
  oddsPerPack: number | null;
  commonPrice: number | null;
  semiStarPrice: number | null;
  unlistedStarPrice: number | null;
  star1Price: number | null;
  star2Price: number | null;
  star3Price: number | null;
  _count?: { cards: number };
  stats?: {
    totalCards: number;
    pricedCards: number;
    frontCards: number;
    backCards: number;
    pctPriced: number;
    pctFront: number;
    pctBack: number;
  };
};

type ProductMeta = {
  id: string;
  year?: number | null;
  sport?: string | null;
  name?: string | null;
  brand?: string | null;
};

type ProductSetDraft = {
  name: string;
  isBase: boolean;
  isInsert: boolean;
  oddsPerPack: string;
  commonPrice: string;
  semiStarPrice: string;
  unlistedStarPrice: string;
  star1Price: string;
  star2Price: string;
  star3Price: string;
};

type ProductSetsResponse = {
  ok?: boolean;
  rows?: ProductSetRow[];
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  error?: string;
};

function safeNum(v: unknown, fallback = 0) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function pctText(v: unknown) {
  const n = safeNum(v, 0);
  return `${n.toFixed(1)}%`;
}

function numberToInputString(v: number | null | undefined) {
  return v === null || v === undefined || !Number.isFinite(v) ? "" : String(v);
}

function parseNullableNumberInput(v: string) {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function createDraft(row: ProductSetRow): ProductSetDraft {
  return {
    name: row.name ?? "",
    isBase: !!row.isBase,
    isInsert: !!row.isInsert,
    oddsPerPack: numberToInputString(row.oddsPerPack),
    commonPrice: numberToInputString(row.commonPrice),
    semiStarPrice: numberToInputString(row.semiStarPrice),
    unlistedStarPrice: numberToInputString(row.unlistedStarPrice),
    star1Price: numberToInputString(row.star1Price),
    star2Price: numberToInputString(row.star2Price),
    star3Price: numberToInputString(row.star3Price),
  };
}

function pageWindow(currentPage: number, totalPages: number) {
  const maxButtons = 7;

  if (totalPages <= maxButtons) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const half = Math.floor(maxButtons / 2);
  let start = Math.max(1, currentPage - half);
  let end = start + maxButtons - 1;

  if (end > totalPages) {
    end = totalPages;
    start = totalPages - maxButtons + 1;
  }

  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export default function ProductSetsClient() {
  const [rows, setRows] = useState<ProductSetRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProductSetDraft>>({});

  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandAllPricing, setExpandAllPricing] = useState(false);
  const [expandedPricingOverrides, setExpandedPricingOverrides] = useState<Record<string, boolean>>({});
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const [products, setProducts] = useState<ProductMeta[]>([]);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const [productFilter, setProductFilter] = useState("");
  const [onlyBase, setOnlyBase] = useState(false);
  const [onlyInsert, setOnlyInsert] = useState(false);
  const [sportFilter, setSportFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const requestIdRef = useRef(0);

  const productMetaById = useMemo(() => {
    const map = new Map<string, ProductMeta>();
    for (const product of products) {
      map.set(product.id, product);
    }
    return map;
  }, [products]);

  const productOptions = useMemo(() => {
    return [...products].sort((a, b) => {
      const yearA = typeof a.year === "number" ? a.year : -1;
      const yearB = typeof b.year === "number" ? b.year : -1;

      if (yearA !== yearB) return yearB - yearA;

      const nameA = `${a.brand ?? ""} ${a.name ?? ""} ${a.id}`.trim();
      const nameB = `${b.brand ?? ""} ${b.name ?? ""} ${b.id}`.trim();

      return nameA.localeCompare(nameB);
    });
  }, [products]);

  const sportOptions = useMemo(() => {
    const values = new Set<string>();

    for (const product of products) {
      const sport = (product.sport ?? "").trim();
      if (sport) values.add(sport);
    }

    return [...values].sort((a, b) => a.localeCompare(b));
  }, [products]);

  const yearOptions = useMemo(() => {
    const values = new Set<number>();

    for (const product of products) {
      if (typeof product.year === "number" && Number.isFinite(product.year)) {
        values.add(product.year);
      }
    }

    return [...values].sort((a, b) => b - a);
  }, [products]);

  const hasProductMeta = products.length > 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [q]);

  async function loadProductsForFilters() {
    setLoadingProducts(true);

    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      if (!res.ok) return;

      const raw = await res.text();

      let data: unknown = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        return;
      }

      if (!Array.isArray(data)) return;

      const metas: ProductMeta[] = data
        .map((product: any) => ({
          id: String(product?.id ?? ""),
          year:
            typeof product?.year === "number"
              ? product.year
              : product?.year
                ? Number(product.year)
                : null,
          sport:
            typeof product?.sport === "string"
              ? product.sport
              : product?.sport ?? null,
          name:
            typeof product?.name === "string"
              ? product.name
              : product?.name ?? null,
          brand:
            typeof product?.brand === "string"
              ? product.brand
              : product?.brand ?? null,
        }))
        .filter((product) => product.id);

      setProducts(metas);
    } finally {
      setLoadingProducts(false);
    }
  }

  async function loadRows(options?: { preserveMessage?: boolean; preserveOtherDraftsThan?: string }) {
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);

    if (!options?.preserveMessage) {
      setSaveOk(null);
    }

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });

      if (debouncedQ) params.set("q", debouncedQ);
      if (productFilter) params.set("productId", productFilter);
      if (onlyBase) params.set("onlyBase", "true");
      if (onlyInsert) params.set("onlyInsert", "true");
      if (sportFilter) params.set("sport", sportFilter);
      if (yearFilter) params.set("year", yearFilter);

      const res = await fetch(`/api/product-sets?${params.toString()}`, {
        cache: "no-store",
      });

      const raw = await res.text();

      let data: ProductSetsResponse | null = null;
      try {
        data = raw ? (JSON.parse(raw) as ProductSetsResponse) : null;
      } catch {
        throw new Error(
          `Failed to parse /api/product-sets JSON. First chars: ${raw.slice(0, 140)}`
        );
      }

      if (!res.ok) {
        throw new Error(
          data?.error ?? `Failed to load product sets (${res.status})`
        );
      }

      if (requestId !== requestIdRef.current) return;

      const nextRows = Array.isArray(data?.rows) ? data.rows : [];

      setRows(nextRows);
      setPage(typeof data?.page === "number" ? data.page : page);
      setPageSize(
        typeof data?.pageSize === "number" ? data.pageSize : pageSize
      );
      setTotal(typeof data?.total === "number" ? data.total : 0);
      setTotalPages(
        typeof data?.totalPages === "number"
          ? Math.max(1, data.totalPages)
          : 1
      );

      // Saving one set must not discard unfinished edits on the other rows.
      const oldRows = new Map(rows.map((row) => [row.id, row]));
      setDrafts((existing) => {
        const nextDrafts: Record<string, ProductSetDraft> = {};
        for (const nextRow of nextRows) {
          const oldRow = oldRows.get(nextRow.id);
          const pending = existing[nextRow.id];
          const dirty = oldRow && pending &&
            JSON.stringify(pending) !== JSON.stringify(createDraft(oldRow));
          nextDrafts[nextRow.id] = options?.preserveOtherDraftsThan &&
            nextRow.id !== options.preserveOtherDraftsThan && dirty
              ? pending : createDraft(nextRow);
        }
        return nextDrafts;
      });
    } catch (e: unknown) {
      if (requestId !== requestIdRef.current) return;

      setError(
        e instanceof Error ? e.message : "Failed to load product sets"
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadProductsForFilters();
  }, []);

  useEffect(() => {
    loadRows();
  }, [
    page,
    pageSize,
    debouncedQ,
    productFilter,
    onlyBase,
    onlyInsert,
    sportFilter,
    yearFilter,
  ]);

  function patchDraft(id: string, patch: Partial<ProductSetDraft>) {
    setDrafts((previous) => {
      const row = rows.find((item) => item.id === id);
      const current =
        previous[id] ?? (row ? createDraft(row) : undefined);

      if (!current) return previous;

      return {
        ...previous,
        [id]: {
          ...current,
          ...patch,
        },
      };
    });
  }

  function setBase(id: string, value: boolean) {
    patchDraft(id, {
      isBase: value,
      isInsert: value ? false : drafts[id]?.isInsert ?? false,
    });
  }

  function setInsert(id: string, value: boolean) {
    patchDraft(id, {
      isInsert: value,
      isBase: value ? false : drafts[id]?.isBase ?? false,
    });
  }

  async function saveRow(row: ProductSetRow) {
    const draft = drafts[row.id] ?? createDraft(row);

    setSavingId(row.id);
    setError(null);
    setSaveOk(null);

    try {
      if (draft.isBase && draft.isInsert) {
        throw new Error("A Product Set cannot be both Base and Insert.");
      }

      const res = await fetch(
        `/api/product-sets/${encodeURIComponent(row.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name.trim() || null,
            isBase: draft.isBase,
            isInsert: draft.isInsert,
            oddsPerPack: parseNullableNumberInput(draft.oddsPerPack),
            commonPrice: parseNullableNumberInput(draft.commonPrice),
            semiStarPrice: parseNullableNumberInput(draft.semiStarPrice),
            unlistedStarPrice: parseNullableNumberInput(
              draft.unlistedStarPrice
            ),
            star1Price: parseNullableNumberInput(draft.star1Price),
            star2Price: parseNullableNumberInput(draft.star2Price),
            star3Price: parseNullableNumberInput(draft.star3Price),
          }),
        }
      );

      const raw = await res.text();

      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          `Save returned non-JSON (${res.status}): ${raw.slice(0, 140)}`
        );
      }

      if (!res.ok) {
        throw new Error(data?.error ?? `Save failed (${res.status})`);
      }

      setSaveOk(`Saved ${row.id}`);
      await loadRows({ preserveMessage: true, preserveOtherDraftsThan: row.id });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteRow(row: ProductSetRow) {
    const ok = window.confirm(
      `Delete Product Set "${row.id}"?\n\nAll cards in this set will be permanently deleted.\nThis cannot be undone.`
    );

    if (!ok) return;

    setSavingId(row.id);
    setError(null);
    setSaveOk(null);

    try {
      const res = await fetch(
        `/api/product-sets/${encodeURIComponent(row.id)}`,
        {
          method: "DELETE",
        }
      );

      const raw = await res.text();

      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          `Delete returned non-JSON (${res.status}): ${raw.slice(0, 140)}`
        );
      }

      if (!res.ok) {
        throw new Error(data?.error ?? `Delete failed (${res.status})`);
      }

      setSaveOk(`Deleted ${row.id}`);

      if (rows.length === 1 && page > 1) {
        setPage((current) => Math.max(1, current - 1));
      } else {
        await loadRows({ preserveMessage: true });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSavingId(null);
    }
  }

  function clearFilters() {
    setQ("");
    setDebouncedQ("");
    setProductFilter("");
    setOnlyBase(false);
    setOnlyInsert(false);
    setSportFilter("");
    setYearFilter("");
    setPage(1);
  }

  function updateProductFilter(value: string) {
    setProductFilter(value);
    setPage(1);
  }

  function updateSportFilter(value: string) {
    setSportFilter(value);
    setPage(1);
  }

  function updateYearFilter(value: string) {
    setYearFilter(value);
    setPage(1);
  }

  function updatePageSize(value: number) {
    setPageSize(value);
    setPage(1);
  }

  const firstShown = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = total === 0 ? 0 : Math.min(page * pageSize, total);
  const pageNumbers = pageWindow(page, totalPages);
  const allVisiblePricingExpanded = rows.length > 0 && rows.every((row) => expandedPricingOverrides[row.id] ?? expandAllPricing);

  const th: CSSProperties = {
    textAlign: "left",
    padding: 8,
    borderBottom: "1px solid #ddd",
    whiteSpace: "nowrap",
  };

  const td: CSSProperties = {
    padding: 8,
    borderBottom: "1px solid #eee",
    whiteSpace: "nowrap",
    verticalAlign: "top",
  };

  const paginationButtonStyle: CSSProperties = {
    minWidth: 36,
    padding: "7px 10px",
  };

  const renderPagination = (position: "top" | "bottom") => (
    <div
      style={{
        marginTop: position === "top" ? 0 : 12,
        marginBottom: position === "top" ? 12 : 0,
        display: "flex",
        gap: 8,
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontSize: 14 }}>
        Showing <strong>{firstShown}</strong>–<strong>{lastShown}</strong> of{" "}
        <strong>{total}</strong>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => setPage(1)}
          disabled={loading || page <= 1}
          style={paginationButtonStyle}
        >
          First
        </button>

        <button
          type="button"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={loading || page <= 1}
          style={paginationButtonStyle}
        >
          Previous
        </button>

        {pageNumbers.map((pageNumber) => (
          <button
            type="button"
            key={pageNumber}
            onClick={() => setPage(pageNumber)}
            disabled={loading || pageNumber === page}
            style={{
              ...paginationButtonStyle,
              fontWeight: pageNumber === page ? 800 : 400,
              border:
                pageNumber === page
                  ? "2px solid #333"
                  : "1px solid #bbb",
              background: pageNumber === page ? "#eee" : undefined,
            }}
          >
            {pageNumber}
          </button>
        ))}

        <button
          type="button"
          onClick={() =>
            setPage((current) => Math.min(totalPages, current + 1))
          }
          disabled={loading || page >= totalPages}
          style={paginationButtonStyle}
        >
          Next
        </button>

        <button
          type="button"
          onClick={() => setPage(totalPages)}
          disabled={loading || page >= totalPages}
          style={paginationButtonStyle}
        >
          Last
        </button>
      </div>

      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          fontSize: 14,
        }}
      >
        Rows per page
        <select
          value={pageSize}
          onChange={(event) => updatePageSize(Number(event.target.value))}
          disabled={loading}
          style={{ padding: 7 }}
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </label>
    </div>
  );

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 32, fontWeight: 800 }}>
        Admin: Product Sets
      </h1>

      <p style={{ marginTop: 6 }}>
        Product Sets are the pools inside a Product (Base, Inserts, etc.).
        Cards attach via <code>productSetId</code>.
      </p>

      <p style={{ marginTop: 6, maxWidth: 1100 }}>
        Tier default prices are set at the Product Set level. These values
        are used with the Player Repository / Tiers tool to assign or
        overwrite default book values by player tier.
      </p>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Link href="/admin" style={{ textDecoration: "underline" }}>
          ← Admin Home
        </Link>

        <Link href="/admin/products" style={{ textDecoration: "underline" }}>
          Admin: Products
        </Link>

        <Link
          href="/admin/player-tiers"
          style={{ textDecoration: "underline" }}
        >
          Admin: Player Repository / Tiers
        </Link>

        <button
          type="button"
          onClick={() => loadRows()}
          style={{ padding: "8px 12px" }}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>

        <button
          type="button"
          onClick={loadProductsForFilters}
          style={{ padding: "8px 12px" }}
          disabled={loadingProducts}
        >
          {loadingProducts ? "Refreshing filters..." : "Refresh filters"}
        </button>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <div
        style={{
          border: "1px solid #ddd",
          padding: 12,
          borderRadius: 12,
          background: "#fafafa",
          marginBottom: 12,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800 }}>Search</div>

          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search product, set id, name..."
            style={{ padding: 8, width: 260 }}
          />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800 }}>Product</div>

          <select
            value={productFilter}
            onChange={(event) => updateProductFilter(event.target.value)}
            style={{ padding: 8, width: 300 }}
            disabled={!hasProductMeta}
          >
            <option value="">All products</option>

            {productOptions.map((product) => {
              const labelParts = [
                product.year ? String(product.year) : null,
                product.brand,
                product.name,
                product.id,
              ].filter(Boolean);

              return (
                <option key={product.id} value={product.id}>
                  {labelParts.join(" • ")}
                </option>
              );
            })}
          </select>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800 }}>Type</div>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              <input
                type="checkbox"
                checked={onlyBase}
                onChange={(event) => {
                  const value = event.target.checked;
                  setOnlyBase(value);
                  if (value) setOnlyInsert(false);
                  setPage(1);
                }}
              />
              Base only
            </label>

            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              <input
                type="checkbox"
                checked={onlyInsert}
                onChange={(event) => {
                  const value = event.target.checked;
                  setOnlyInsert(value);
                  if (value) setOnlyBase(false);
                  setPage(1);
                }}
              />
              Insert only
            </label>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            opacity: hasProductMeta ? 1 : 0.5,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800 }}>Sport</div>

          <select
            value={sportFilter}
            onChange={(event) => updateSportFilter(event.target.value)}
            style={{ padding: 8, width: 160 }}
            disabled={!hasProductMeta}
            title={
              !hasProductMeta
                ? "Sport filter requires /api/products"
                : ""
            }
          >
            <option value="">All</option>

            {sportOptions.map((sport) => (
              <option key={sport} value={sport}>
                {sport}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            opacity: hasProductMeta ? 1 : 0.5,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800 }}>Year</div>

          <select
            value={yearFilter}
            onChange={(event) => updateYearFilter(event.target.value)}
            style={{ padding: 8, width: 120 }}
            disabled={!hasProductMeta}
            title={
              !hasProductMeta
                ? "Year filter requires /api/products"
                : ""
            }
          >
            <option value="">All</option>

            {yearOptions.map((year) => (
              <option key={year} value={String(year)}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={clearFilters}
          style={{ padding: "10px 12px", fontWeight: 800 }}
        >
          Clear
        </button>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            background: "#fee",
            border: "1px solid #f99",
          }}
        >
          {error}
        </div>
      )}

      {saveOk && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            background: "#efe",
            border: "1px solid #9f9",
          }}
        >
          {saveOk}
        </div>
      )}

      {renderPagination("top")}

      <div className="vcs-admin-pricing-toolbar">
        <div>
          <strong>Tier default pricing</strong>
          <span>Compare sets using published pack odds. Saving one row preserves unsaved edits in the other rows.</span>
        </div>
        <button
          type="button"
          aria-expanded={allVisiblePricingExpanded}
          onClick={() => {
            setExpandAllPricing(!allVisiblePricingExpanded);
            setExpandedPricingOverrides({});
          }}
        >
          {allVisiblePricingExpanded ? "Collapse all prices" : "Expand all prices"}
        </button>
      </div>

      <div
        className="vcs-admin-product-set-table-wrap"
        style={{
          overflowX: "auto",
          border: "1px solid #ddd",
          position: "relative",
        }}
      >
        {loading && rows.length > 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255,255,255,0.72)",
              zIndex: 5,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              paddingTop: 24,
              fontWeight: 800,
            }}
          >
            Loading…
          </div>
        )}

        {loading && rows.length === 0 ? (
          <div style={{ padding: 16 }}>Loading…</div>
        ) : (
          <table className={"vcs-admin-product-set-table" + (allVisiblePricingExpanded ? " is-all-prices-visible" : "")} aria-label="Product set catalog management">
            <colgroup>
              <col style={{ width: "11%" }} /><col style={{ width: "16%" }} />
              <col style={{ width: "13%" }} /><col style={{ width: "7%" }} />
              <col style={{ width: "13%" }} /><col style={{ width: "9%" }} />
              <col style={{ width: "17%" }} /><col style={{ width: "4%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <thead>
              <tr>
                {["Product", "Product Set", "Name", "Type", "Pack odds", "Tier prices", "Setup completeness", "Cards", "Actions"].map((heading) => (
                  <th key={heading} scope="col" style={th}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const draft = drafts[row.id] ?? createDraft(row);
                const saving = savingId === row.id;
                const expanded = expandedPricingOverrides[row.id] ?? expandAllPricing;
                const publishedOdds = getPublishedOdds(row.id);
                const productMeta = productMetaById.get(row.productId);
                const productLabel = [productMeta?.year, productMeta?.brand].filter(Boolean).join(" ") || row.productId.replace(/_/g, " ");
                const shortId = row.id.startsWith(row.productId) ? row.id.slice(row.productId.length).replace(/^_+/, "") : row.id;
                const setLabel = (shortId || row.id).replace(/_/g, " ");
                const totalCards = row.stats?.totalCards ?? row._count?.cards ?? null;
                const configuredPrices = [
                  draft.commonPrice, draft.semiStarPrice, draft.unlistedStarPrice,
                  draft.star1Price, draft.star2Price, draft.star3Price,
                ].filter((value) => value.trim() !== "").length;
                const coverage = [
                  { label: "Priced", pct: row.stats?.pctPriced, count: row.stats?.pricedCards },
                  { label: "Front", pct: row.stats?.pctFront, count: row.stats?.frontCards },
                  { label: "Back", pct: row.stats?.pctBack, count: row.stats?.backCards },
                ];
                return (
                  <Fragment key={row.id}>
                    <tr className={expanded ? "vcs-admin-set-expanded-source" : ""}>
                      <td style={td}>
                        <Link className="vcs-admin-set-product-link" href={"/admin/products/" + encodeURIComponent(row.productId)} title={row.productId}>{productLabel}</Link>
                        <small className="vcs-admin-set-meta">{productMeta?.sport || "Product"}</small>
                      </td>
                      <td style={td}>
                        <Link className="vcs-admin-set-id-link" href={"/admin/product-sets/" + encodeURIComponent(row.id)} title={row.id}>{setLabel}</Link>
                      </td>
                      <td style={td}>
                        <input aria-label={"Product set name for " + row.id} value={draft.name}
                          onChange={(event) => patchDraft(row.id, { name: event.target.value })}
                          placeholder="Set name" title={draft.name} />
                      </td>
                      <td style={td}>
                        <div className="vcs-admin-set-type">
                          <label title="Mark as the product's base checklist"><input type="checkbox" checked={!!draft.isBase} onChange={(event) => setBase(row.id, event.target.checked)} /> Base</label>
                          <label title="Mark as an insert or parallel set"><input type="checkbox" checked={!!draft.isInsert} onChange={(event) => setInsert(row.id, event.target.checked)} /> Insert</label>
                        </div>
                      </td>
                      <td style={td}>
                        <div className="vcs-admin-set-odds">
                          <label>
                            <span>VCS 1:</span>
                            <input type="number" step="1" inputMode="numeric" min="1"
                              aria-label={"VCS pack odds 1 in X for " + row.id}
                              value={draft.oddsPerPack}
                              onChange={(event) => patchDraft(row.id, { oddsPerPack: event.target.value })}
                              placeholder="—"
                              title="Editable VCS pack-engine odds. Blank means a single pack rate is not configured." />
                          </label>
                          {publishedOdds ? (
                            <a href={publishedOdds.sourceUrl} target="_blank" rel="noreferrer"
                              title={"Published pack odds only (not applied to VCS): " + formatPublishedOdds(publishedOdds) +
                                (publishedOdds.note ? ". " + publishedOdds.note : "")}>
                              <span>Published</span> {formatPublishedOdds(publishedOdds)} ↗
                            </a>
                          ) : (
                            <span className="vcs-admin-set-no-reference" title="No verified historical pack odds recorded for this set">No published rate</span>
                          )}
                        </div>
                      </td>
                      <td style={td}>
                        <button type="button" className="vcs-admin-set-price-toggle"
                          onClick={() => setExpandedPricingOverrides((previous) => ({ ...previous, [row.id]: !expanded }))}
                          aria-expanded={expanded} aria-controls={"vcs-admin-prices-" + index}
                          title="Expand all six editable player-tier default prices"
                        >{expanded ? "Close prices" : "Edit prices"}</button>
                        <small className="vcs-admin-set-meta">{configuredPrices}/6 set</small>
                      </td>
                      <td style={td}>
                        <div className="vcs-admin-set-coverage" aria-label={"Setup completion for " + row.id}>
                          {coverage.map((item) => (
                            <div className="vcs-admin-set-coverage-item" key={item.label}
                              title={item.pct == null || totalCards == null ? "Status unavailable" : item.label + ": " + pctText(item.pct) + " (" + safeNum(item.count) + " of " + totalCards + ")"}>
                              <span>{item.label}</span><strong>{item.pct == null ? "—" : pctText(item.pct)}</strong>
                              <div className="vcs-admin-set-progress-track"><i style={{ width: Math.min(100, Math.max(0, safeNum(item.pct))) + "%" }} /></div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="vcs-admin-set-card-count" style={td}>{totalCards ?? "—"}</td>
                      <td style={td}>
                        <div className="vcs-admin-set-row-actions">
                          <button type="button" onClick={() => saveRow(row)} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                          <button type="button" className="vcs-admin-danger-action" onClick={() => deleteRow(row)} disabled={saving}>Delete</button>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="vcs-admin-set-price-detail" id={"vcs-admin-prices-" + index}>
                        <td colSpan={9}>
                          <div className="vcs-admin-set-price-editor">
                            <div className="vcs-admin-set-price-intro">
                              <strong>Tier default prices</strong>
                              <span>Configure all six book-value defaults for <b>{row.id}</b>. Compare the published odds above.</span>
                            </div>
                            <div className="vcs-admin-set-price-grid">
                              {([
                                ["commonPrice", "Common"], ["semiStarPrice", "Semi-Star"],
                                ["unlistedStarPrice", "Unlisted Star"], ["star1Price", "Star 1"],
                                ["star2Price", "Star 2"], ["star3Price", "Star 3"],
                              ] as const).map(([field, label]) => (
                                <label key={field}><span>{label} ($)</span>
                                  <input type="number" step="0.01" inputMode="decimal" min="0"
                                    value={draft[field]}
                                    onChange={(event) => patchDraft(row.id, { [field]: event.target.value })}
                                    placeholder="Not set" />
                                </label>
                              ))}
                            </div>
                            <div className="vcs-admin-set-price-footer">
                              <span>Blank values remain unconfigured. Saving also applies edits in this set's main row.</span>
                              <button type="button" onClick={() => saveRow(row)} disabled={saving}>{saving ? "Saving…" : "Save prices"}</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 12 }}>No matching product sets. Try clearing filters.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {renderPagination("bottom")}
    </div>
  );
}