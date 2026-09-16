"use client";

import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";
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
        onClick={() => { setSingles(false); changeView("discover"); }}
      >
        Discover
      </button>
      <button
        aria-current={!singles && view === "all" ? "page" : undefined}
        onClick={() => { setSingles(false); changeView("all"); }}
      >
        All products
      </button>
      <button
        aria-current={singles ? "page" : undefined}
        onClick={() => setSingles(true)}
      >
        Singles
      </button>
      <span>{singles ? "Buy & sell singles" : "Packs & boxes"}</span>
    </nav>

    <div hidden={singles}><SealedShop view={view} onViewChange={changeView} /></div>
    {singles && <div className="shop-singles"><SinglesShop /></div>}
  </div>;
}
