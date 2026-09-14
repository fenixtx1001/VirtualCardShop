"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

type CaptureMessage = {
  type: "vcs-card-capture";
  nonce: string;
  productSetId: string;
  cardNumber: string;
  sourceUrl?: string;
  front?: Blob | null;
  back?: Blob | null;
  frontName?: string;
  backName?: string;
};

type CaptureOutcome =
  | "captured"
  | "partial"
  | "unavailable"
  | "already-complete";

const ACTIVE_SET_STORAGE_KEY = "vcs.setFactory.activeProductSetId";
const ACTIVE_SET_COOKIE_KEY = "vcs_set_factory_active_product_set_id";

function readActiveSetCookie() {
  if (typeof document === "undefined") return "";

  const prefix = `${ACTIVE_SET_COOKIE_KEY}=`;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return value ? decodeURIComponent(value.slice(prefix.length)).trim() : "";
}

function writeActiveSetCookie(productSetId: string) {
  if (typeof document === "undefined") return;

  document.cookie =
    `${ACTIVE_SET_COOKIE_KEY}=${encodeURIComponent(productSetId)}; ` +
    "Path=/; Max-Age=31536000; SameSite=Lax; Secure";
}

function buildBookmarklet(vcsOrigin: string, activeProductSetId: string) {
  const origin = JSON.stringify(vcsOrigin);
  const productSet = JSON.stringify(activeProductSetId.trim());

  return `javascript:(async()=>{try{
const O=${origin};
const BOOKMARK_SET=${productSet};
if(!/(^|\\.)tcdb\\.com$/i.test(location.hostname))throw new Error("Open a TCDB card page first.");
if(!/\\/ViewCard\\.cfm(?:\\/|$)/i.test(location.pathname))throw new Error("Open an individual TCDB card page first.");

const I=[...document.images].map(i=>{
  const r=i.getBoundingClientRect();
  return{
    src:i.currentSrc||i.src,
    alt:i.alt||"",
    title:i.title||"",
    area:Math.max(r.width*r.height,(i.naturalWidth||0)*(i.naturalHeight||0)),
    top:r.top,
    left:r.left
  };
}).filter(x=>x.src&&!/(?:no[-_ ]?image|no[-_ ]?photo|placeholder|missing[-_ ]?image)/i.test(x.src));

const label=x=>((x&&x.alt)||"")+" "+((x&&x.title)||"")+" "+((x&&x.src)||"");
let F=I.find(x=>/RepFr\\.(?:jpe?g|png|webp|gif)(?:\\?|$)/i.test(x.src));
let B=I.find(x=>/RepBk\\.(?:jpe?g|png|webp|gif)(?:\\?|$)/i.test(x.src));

if(!F)F=I.find(x=>/\\/Images\\/Cards\\//i.test(x.src)&&x.area>20000&&/\\bfront\\b/i.test(label(x)));
if(!B)B=I.find(x=>/\\/Images\\/Cards\\//i.test(x.src)&&x.area>20000&&/\\bback\\b/i.test(label(x)));

if(!F||!B){
  const K=I
    .filter(x=>/\\/Images\\/Cards\\//i.test(x.src)&&x.area>20000)
    .sort((a,b)=>b.area-a.area)
    .slice(0,4)
    .sort((a,b)=>a.top-b.top||a.left-b.left);

  if(!F)F=K.find(x=>!B||x.src!==B.src);
  if(!B)B=K.find(x=>!F||x.src!==F.src);
}

const T=[
  document.title,
  ...I.flatMap(x=>[x.alt,x.title]),
  document.body.innerText.slice(0,12000)
].join("\\n");

let M=T.match(/#\\s*([A-Za-z0-9.-]+)/);
if(!M)M=T.match(/Card\\s*(?:No\\.?|Number)?\\s*[:#]?\\s*([A-Za-z0-9.-]+)/i);

let C=M?M[1]:"";
if(!C)C=prompt("VCS could not detect the card number. Enter it:")||"";
if(!C)throw new Error("Card number is required.");

const links=[...document.querySelectorAll("a[href]")];
const nextLink=links.find(a=>{
  const text=(a.textContent||"").trim().toLowerCase();
  const aria=(a.getAttribute("aria-label")||"").trim().toLowerCase();
  const title=(a.getAttribute("title")||"").trim().toLowerCase();
  if(text!=="next"&&aria!=="next"&&title!=="next")return false;
  try{
    const u=new URL(a.href,location.href);
    return u.hostname===location.hostname&&/\\/ViewCard\\.cfm(?:\\/|$)/i.test(u.pathname);
  }catch{return false;}
});
const U=nextLink?nextLink.href:"";

const N=crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2);
let R=false,D=null,W=null,P="",sent=false;

const S=()=>{
  if(R&&D&&W&&!W.closed&&!sent){
    sent=true;
    W.postMessage({
      type:"vcs-card-capture",
      nonce:N,
      productSetId:P,
      cardNumber:C,
      sourceUrl:location.href,
      front:D.front,
      back:D.back,
      frontName:D.frontName,
      backName:D.backName
    },O);
  }
};

const H=e=>{
  if(e.origin!==O||!e.data||e.data.nonce!==N)return;

  if(e.data.type==="vcs-capture-ready"){
    P=String(e.data.productSetId||"").trim();
    if(!P){
      removeEventListener("message",H);
      alert("VCS Harvest: No Active Product Set is configured in VCS.");
      return;
    }
    R=true;
    S();
    return;
  }

  if(e.data.type==="vcs-capture-complete"){
    removeEventListener("message",H);
    if(W&&!W.closed)W.close();
    if(e.data.accountedFor){
      if(U)location.assign(U);
      else console.info("VCS Harvest: card accounted for; no Next card link was found.");
    }else{
      alert("VCS Harvest stopped: "+(e.data.message||"capture was not accounted for."));
    }
  }
};

addEventListener("message",H);

W=open(
  O+"/admin/set-factory/capture?receiver=1&nonce="+encodeURIComponent(N)+
  "&productSetId="+encodeURIComponent(BOOKMARK_SET),
  "vcsSetCapture",
  "width=520,height=420"
);

if(!W){
  removeEventListener("message",H);
  throw new Error("Popup blocked. Allow popups for TCDB and try again.");
}

const ext=s=>{
  const m=String(s||"").match(/\\.([A-Za-z0-9]+)(?:\\?|$)/);
  return m?"."+m[1]:".jpg";
};

const getImage=async(x,side)=>{
  if(!x)return null;
  const r=await fetch(x.src,{credentials:"include",cache:"default"});
  if(r.status===404||r.status===410)return null;
  if(!r.ok)throw new Error("TCDB "+side+" image read failed: "+r.status);
  const blob=await r.blob();
  if(!blob.size)return null;
  return{blob,name:String(C)+"-"+side+ext(x.src)};
};

const Q=await Promise.all([getImage(F,"front"),getImage(B,"back")]);
D={
  front:Q[0]?Q[0].blob:null,
  back:Q[1]?Q[1].blob:null,
  frontName:Q[0]?Q[0].name:undefined,
  backName:Q[1]?Q[1].name:undefined
};

S();

}catch(e){
  alert("VCS Harvest: "+(e&&e.message?e.message:e));
}})()`;
}

function receiverOriginAllowed(origin: string) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === "tcdb.com" || hostname.endsWith(".tcdb.com");
  } catch {
    return false;
  }
}

export default function SetFactoryCapturePage() {
  const [receiverMode, setReceiverMode] = useState(false);
  const [nonce, setNonce] = useState("");
  const [productSetId, setProductSetId] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [bookmarklet, setBookmarklet] = useState("#");
  const [status, setStatus] = useState("Ready.");
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    message?: string;
    outcome?: CaptureOutcome;
    frontImageUrl?: string | null;
    backImageUrl?: string | null;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const isReceiver = params.get("receiver") === "1";
    const incomingSet = params.get("productSetId")?.trim();
    const incomingCard = params.get("cardNumber")?.trim();
    const incomingNonce = params.get("nonce")?.trim();
    const savedSet =
      window.localStorage.getItem(ACTIVE_SET_STORAGE_KEY)?.trim() || "";
    const cookieSet = readActiveSetCookie();

    const initialSet = incomingSet || savedSet || cookieSet || "";

    setReceiverMode(isReceiver);
    setProductSetId(initialSet);
    setInitialized(true);
    if (incomingCard) setCardNumber(incomingCard);
    if (incomingNonce) setNonce(incomingNonce);

    if (!isReceiver) {
      setBookmarklet(buildBookmarklet(window.location.origin, initialSet));
      setStatus(
        initialSet
          ? `Active capture set: ${initialSet}. Install the new VCS Harvest bookmark once, then reuse it.`
          : "Set an Active Product Set ID, then install the VCS Harvest bookmark."
      );
    }
  }, []);

  useEffect(() => {
    if (receiverMode || !initialized) return;
    if (typeof window === "undefined") return;

    const trimmed = productSetId.trim();
    if (trimmed) {
      window.localStorage.setItem(ACTIVE_SET_STORAGE_KEY, trimmed);
      writeActiveSetCookie(trimmed);
      setStatus(
        `Active capture set saved in this browser: ${trimmed}. The same VCS Harvest bookmark works for future sets.`
      );
    }

    setBookmarklet(buildBookmarklet(window.location.origin, trimmed));
  }, [productSetId, receiverMode, initialized]);

  useEffect(() => {
    if (!receiverMode || !nonce) return;
    if (typeof window === "undefined") return;

    let handled = false;
    const activeSetId =
      productSetId.trim() ||
      window.localStorage.getItem(ACTIVE_SET_STORAGE_KEY)?.trim() ||
      readActiveSetCookie() ||
      "";

    if (!activeSetId) {
      setError(
        "No active Product Set ID is configured. Go back to the Set Factory Capture page and set one first."
      );
      setStatus("Capture blocked.");
      return;
    }

    setStatus(`Waiting for TCDB card... Active Product Set: ${activeSetId}`);

    const onMessage = async (event: MessageEvent<CaptureMessage>) => {
      if (handled) return;
      if (!receiverOriginAllowed(event.origin)) return;

      const data = event.data;
      if (!data || data.type !== "vcs-card-capture" || data.nonce !== nonce) {
        return;
      }

      handled = true;
      setError("");
      setCardNumber(data.cardNumber);

      const hasFront = data.front instanceof Blob;
      const hasBack = data.back instanceof Blob;
      const sourceDescription =
        hasFront && hasBack
          ? "front + back found"
          : hasFront
            ? "front found; back unavailable"
            : hasBack
              ? "back found; front unavailable"
              : "no source images found";

      setStatus(`Card #${data.cardNumber}: ${sourceDescription}. Accounting for card...`);

      try {
        const form = new FormData();
        form.append("productSetId", activeSetId);
        form.append("cardNumber", data.cardNumber);

        if (hasFront && data.front) {
          form.append(
            "front",
            data.front,
            data.frontName || `${data.cardNumber}-front.jpg`
          );
        }

        if (hasBack && data.back) {
          form.append(
            "back",
            data.back,
            data.backName || `${data.cardNumber}-back.jpg`
          );
        }

        const response = await fetch("/api/admin/set-factory/capture-card", {
          method: "POST",
          body: form,
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error ?? "VCS capture upload failed.");
        }

        const outcome = (payload?.outcome ?? "captured") as CaptureOutcome;
        const message = payload?.message ?? `Card #${data.cardNumber} accounted for.`;

        setStatus(message);
        setResult({
          message,
          outcome,
          frontImageUrl: payload?.card?.frontImageUrl ?? null,
          backImageUrl: payload?.card?.backImageUrl ?? null,
        });

        window.opener?.postMessage(
          {
            type: "vcs-capture-complete",
            nonce,
            accountedFor: Boolean(payload?.accountedFor ?? payload?.ok),
            outcome,
            message,
          },
          event.origin
        );

        window.setTimeout(() => window.close(), 100);
      } catch (captureError: any) {
        const message = captureError?.message ?? "Capture failed.";
        setError(message);
        setStatus("Harvest stopped on this card. Nothing was auto-advanced.");
      }
    };

    window.addEventListener("message", onMessage);
    window.opener?.postMessage(
      { type: "vcs-capture-ready", nonce, productSetId: activeSetId },
      "*"
    );

    return () => window.removeEventListener("message", onMessage);
  }, [receiverMode, nonce, productSetId]);

  const statusStyle = useMemo<CSSProperties>(
    () => ({
      padding: 14,
      border: "1px solid #d0d7de",
      borderRadius: 10,
      background: error ? "#fff1f0" : result ? "#f0fff4" : "#f6f8fa",
      marginTop: 16,
      maxWidth: 760,
    }),
    [error, result]
  );

  if (receiverMode) {
    return (
      <main
        style={{
          padding: 22,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
          maxWidth: 760,
        }}
      >
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>VCS Harvest</h1>
        <p style={{ color: "#555", marginTop: 0 }}>
          Product Set: <b>{productSetId}</b>
          {cardNumber ? (
            <>
              {" "}
              · Card <b>#{cardNumber}</b>
            </>
          ) : null}
        </p>

        <div style={statusStyle}>
          <b>{status}</b>
          {error ? (
            <div style={{ marginTop: 8, color: "#b42318" }}>{error}</div>
          ) : null}
        </div>

        {result ? (
          <p style={{ marginTop: 14, color: "#555" }}>
            {result.outcome === "unavailable"
              ? "No source scan was available. This is a normal harvest outcome."
              : "Success. Closing and advancing automatically..."}
          </p>
        ) : null}
      </main>
    );
  }

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        maxWidth: 900,
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <a href="/admin">← Back to Admin</a>
      </div>

      <h1 style={{ fontSize: 32, marginBottom: 8 }}>
        Set Factory: One-Click Harvest
      </h1>
      <p style={{ maxWidth: 800, lineHeight: 1.5 }}>
        Set the active Product Set once, then use the <b>VCS Harvest</b> bookmark
        on individual TCDB card pages. Each click captures whatever images are
        available, treats missing scans as a normal outcome, closes the receiver,
        and advances to TCDB&apos;s next card.
      </p>

      <label style={{ display: "grid", gap: 6, marginTop: 22, maxWidth: 520 }}>
        <span style={{ fontWeight: 700 }}>Active Product Set ID</span>
        <input
          value={productSetId}
          onChange={(event) => setProductSetId(event.target.value)}
          style={{
            padding: "10px 12px",
            border: "1px solid #bbb",
            borderRadius: 8,
            fontSize: 14,
          }}
        />
      </label>

      <div style={statusStyle}>
        <b>{status}</b>
        {error ? (
          <div style={{ marginTop: 8, color: "#b42318" }}>{error}</div>
        ) : null}
      </div>

      <section
        style={{
          marginTop: 24,
          padding: 18,
          border: "1px solid #ddd",
          borderRadius: 12,
          background: "#fafafa",
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 20 }}>1. Replace the old bookmark once</h2>
        <p style={{ lineHeight: 1.5 }}>
          Delete/replace your old VCS Capture favorite. Drag this new button to
          the bookmarks bar. The saved bookmark contains the one-click behavior,
          so the old favorite will not update itself.
        </p>
        <a
          href="#"
          ref={(node) => {
            if (node) node.setAttribute("href", bookmarklet);
          }}
          onClick={(event) => event.preventDefault()}
          style={{
            display: "inline-block",
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #333",
            background: "white",
            color: "#111",
            fontWeight: 800,
            textDecoration: "none",
            cursor: "grab",
          }}
        >
          VCS Harvest
        </a>
      </section>

      <section
        style={{
          marginTop: 16,
          padding: 18,
          border: "1px solid #ddd",
          borderRadius: 12,
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 20 }}>2. Click, click, click</h2>
        <ol style={{ lineHeight: 1.7, paddingLeft: 22 }}>
          <li>Set the Active Product Set ID above.</li>
          <li>Open the first individual TCDB card page you want to harvest.</li>
          <li>Click <b>VCS Harvest</b>.</li>
          <li>
            VCS captures both sides, one available side, or records no source
            scan as an acceptable pass outcome.
          </li>
          <li>
            On success the small window closes and TCDB advances to the next
            card automatically. Click <b>VCS Harvest</b> again.
          </li>
        </ol>
      </section>

      <section
        style={{
          marginTop: 16,
          padding: 18,
          border: "1px solid #ddd",
          borderRadius: 12,
          background: "#fffdf5",
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 20 }}>Safety behavior</h2>
        <p style={{ lineHeight: 1.6, marginBottom: 0 }}>
          Missing TCDB scans do <b>not</b> stop harvesting. A real error does.
          If VCS cannot identify the card, cannot validate an image, cannot find
          the card in the active Product Set, or cannot save the request, the
          receiver stays open and TCDB does not advance. That prevents a silent
          skip from turning into hundreds of bad captures.
        </p>
      </section>

      <p style={{ marginTop: 18, color: "#666", lineHeight: 1.5 }}>
        This remains deliberately user-triggered one card at a time. It does not
        crawl or harvest a set unattended.
      </p>
    </main>
  );
}
