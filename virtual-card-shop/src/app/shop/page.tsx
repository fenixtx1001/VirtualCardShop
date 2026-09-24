"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import { SealedShop } from "./sealed-shop";
import "./shop.css";
import "./singles-shop.css";

const SinglesShop = dynamic(() => import("./singles-shop-tab"), { loading: () => <p>Loading singles…</p> });
let sessionView: "discover" | "all" | null = null;
function readView(): "discover" | "all" {
  if (sessionView) return sessionView;
  try { return localStorage.getItem("vcs:shop-view") === "all" ? "all" : "discover"; } catch { return "discover"; }
}
function subscribeView(onChange: () => void) {
  const onStorage = () => { sessionView = null; onChange(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener("vcs:shop-view-changed", onChange);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("vcs:shop-view-changed", onChange); };
}
export default function ShopPage() {
  const view = useSyncExternalStore(subscribeView, readView, () => "discover" as const);
  const [singles, setSingles] = useState(false);
  useEffect(() => {
    const sync = () => setSingles(new URLSearchParams(window.location.search).get("tab") === "singles");
    sync(); window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  function selectSingles(value: boolean) {
    setSingles(value);
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("tab", "singles"); else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.pathname + url.search);
  }
  function changeView(next: "discover" | "all") {
    sessionView = next;
    try { localStorage.setItem("vcs:shop-view", next); } catch { /* Storage is optional. */ }
    window.dispatchEvent(new Event("vcs:shop-view-changed"));
  }
  return <div className="shop-shell">
    <div className="shop-masthead">
      <div><span className="shop-eyebrow">THE LOCAL CARD SHOP</span><h1>Find your next favorite.</h1></div>
    </div>

    <nav className="shop-tabs" aria-label="Shop views">
      <button
        aria-current={!singles && view === "discover" ? "page" : undefined}
        onClick={() => { selectSingles(false); changeView("discover"); }}
      >
        Discover
      </button>
      <button
        aria-current={!singles && view === "all" ? "page" : undefined}
        onClick={() => { selectSingles(false); changeView("all"); }}
      >
        All products
      </button>
      <button
        aria-current={singles ? "page" : undefined}
        onClick={() => selectSingles(true)}
      >
        Singles
      </button>
      <span>{singles ? "Buy & sell singles" : "Packs & boxes"}</span>
    </nav>

    <div hidden={singles}><SealedShop view={view} onViewChange={changeView} /></div>
    {singles && <div className="shop-singles"><SinglesShop /></div>}
  </div>;
}
