"use client";

import { useEffect, useMemo, useState } from "react";

type CaptureMessage = {
  type: "vcs-card-capture";
  nonce: string;
  productSetId: string;
  cardNumber: string;
  sourceUrl?: string;
  front: Blob;
  back: Blob;
  frontName?: string;
  backName?: string;
};

function buildBookmarklet(vcsOrigin: string, productSetId: string) {
  const origin = JSON.stringify(vcsOrigin);
  const setId = JSON.stringify(productSetId);

  return `javascript:(async()=>{try{const O=${origin},P=${setId};if(!/(^|\\.)tcdb\\.com$/i.test(location.hostname))throw new Error("Open a TCDB card page first.");const I=[...document.images].map(i=>({src:i.currentSrc||i.src,alt:i.alt||"",title:i.title||""}));const F=I.find(x=>/RepFr\\.(?:jpe?g|png|webp|gif)(?:\\?|$)/i.test(x.src));const B=I.find(x=>/RepBk\\.(?:jpe?g|png|webp|gif)(?:\\?|$)/i.test(x.src));if(!F||!B)throw new Error("Could not find both TCDB front and back images on this page.");const T=[document.title,...I.flatMap(x=>[x.alt,x.title]),document.body.innerText.slice(0,12000)].join("\\n");let M=T.match(/#\\s*([A-Za-z0-9.-]+)/);if(!M)M=T.match(/Card\\s*(?:No\\.?|Number)?\\s*[:#]?\\s*([A-Za-z0-9.-]+)/i);let C=M?M[1]:"";if(!C)C=prompt("VCS could not detect the card number. Enter it:")||"";if(!C)throw new Error("Card number is required.");const N=(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2));let R=false,D=null,W=null;const H=e=>{if(e.origin===O&&e.data&&e.data.type==="vcs-capture-ready"&&e.data.nonce===N){R=true;S();}};const S=()=>{if(R&&D&&W&&!W.closed){W.postMessage({type:"vcs-card-capture",nonce:N,productSetId:P,cardNumber:C,sourceUrl:location.href,front:D.front,back:D.back,frontName:D.frontName,backName:D.backName},O);removeEventListener("message",H);}};addEventListener("message",H);W=open(O+"/admin/set-factory/capture?receiver=1&nonce="+encodeURIComponent(N)+"&productSetId="+encodeURIComponent(P)+"&cardNumber="+encodeURIComponent(C),"vcsSetCapture","width=560,height=700");if(!W)throw new Error("Popup blocked. Allow popups for TCDB and try again.");const Q=await Promise.all([fetch(F.src,{credentials:"include",cache:"default"}),fetch(B.src,{credentials:"include",cache:"default"})]);if(!Q[0].ok||!Q[1].ok)throw new Error("TCDB image read failed: front "+Q[0].status+", back "+Q[1].status);const Z=await Promise.all(Q.map(r=>r.blob()));const ext=s=>{const m=s.match(/\\.([A-Za-z0-9]+)(?:\\?|$)/);return m?"."+m[1]:".jpg";};D={front:Z[0],back:Z[1],frontName:String(C)+"-front"+ext(F.src),backName:String(C)+"-back"+ext(B.src)};S();}catch(e){alert("VCS Capture: "+(e&&e.message?e.message:e));}})()`;
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
  const [productSetId, setProductSetId] = useState("1990_Topps_Big_Baseball_Base");
  const [cardNumber, setCardNumber] = useState("");
  const [bookmarklet, setBookmarklet] = useState("#");
  const [status, setStatus] = useState("Ready.");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    message?: string;
    frontImageUrl?: string | null;
    backImageUrl?: string | null;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isReceiver = params.get("receiver") === "1";
    const incomingSet = params.get("productSetId")?.trim();
    const incomingCard = params.get("cardNumber")?.trim();
    const incomingNonce = params.get("nonce")?.trim();

    setReceiverMode(isReceiver);
    if (incomingSet) setProductSetId(incomingSet);
    if (incomingCard) setCardNumber(incomingCard);
    if (incomingNonce) setNonce(incomingNonce);

    if (!isReceiver) {
      setBookmarklet(
        buildBookmarklet(window.location.origin, incomingSet || "1990_Topps_Big_Baseball_Base")
      );
    }
  }, []);

  useEffect(() => {
    if (receiverMode) return;
    if (typeof window === "undefined") return;
    setBookmarklet(buildBookmarklet(window.location.origin, productSetId.trim()));
  }, [productSetId, receiverMode]);

  useEffect(() => {
    if (!receiverMode || !nonce) return;

    let handled = false;

    async function onMessage(event: MessageEvent<CaptureMessage>) {
      if (handled) return;
      if (!receiverOriginAllowed(event.origin)) return;
      const data = event.data;
      if (!data || data.type !== "vcs-card-capture" || data.nonce !== nonce) return;

      handled = true;
      setError("");
      setStatus(`Received card #${data.cardNumber}. Uploading front + back to VCS...`);

      try {
        if (!(data.front instanceof Blob) || !(data.back instanceof Blob)) {
          throw new Error("Capture did not contain valid image blobs.");
        }

        const form = new FormData();
        form.append("productSetId", data.productSetId);
        form.append("cardNumber", data.cardNumber);
        form.append("front", data.front, data.frontName || `${data.cardNumber}-front.jpg`);
        form.append("back", data.back, data.backName || `${data.cardNumber}-back.jpg`);

        const response = await fetch("/api/admin/set-factory/capture-card", {
          method: "POST",
          body: form,
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error ?? "VCS capture upload failed.");
        }

        setStatus(payload?.message ?? `Card #${data.cardNumber} captured.`);
        setResult({
          message: payload?.message,
          frontImageUrl: payload?.card?.frontImageUrl ?? null,
          backImageUrl: payload?.card?.backImageUrl ?? null,
        });
      } catch (captureError: any) {
        setError(captureError?.message ?? "Capture failed.");
        setStatus("Capture failed.");
      }
    }

    window.addEventListener("message", onMessage);
    window.opener?.postMessage({ type: "vcs-capture-ready", nonce }, "*");

    return () => window.removeEventListener("message", onMessage);
  }, [receiverMode, nonce]);

  const statusStyle = useMemo<React.CSSProperties>(
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
      <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto", maxWidth: 860 }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>VCS Set Factory Capture</h1>
        <p style={{ color: "#555" }}>
          Product Set: <b>{productSetId}</b>
          {cardNumber ? <> · Card <b>#{cardNumber}</b></> : null}
        </p>

        <div style={statusStyle}>
          <b>{status}</b>
          {error ? <div style={{ marginTop: 8, color: "#b42318" }}>{error}</div> : null}
        </div>

        {result?.frontImageUrl && result?.backImageUrl ? (
          <div style={{ display: "flex", gap: 18, marginTop: 20, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Front</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.frontImageUrl} alt="Captured card front" style={{ width: 180, maxHeight: 260, objectFit: "contain" }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Back</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.backImageUrl} alt="Captured card back" style={{ width: 180, maxHeight: 260, objectFit: "contain" }} />
            </div>
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto", maxWidth: 900 }}>
      <div style={{ marginBottom: 16 }}>
        <a href="/admin">← Back to Admin</a>
      </div>

      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Set Factory: Browser Capture</h1>
      <p style={{ maxWidth: 800, lineHeight: 1.5 }}>
        Pilot workflow: while viewing one card on TCDB, click a browser bookmark. Your browser reads the already-visible
        front/back images into memory, passes the blobs to this VCS receiver, and VCS stores them in R2. No card image
        files are intentionally saved to your computer.
      </p>

      <label style={{ display: "grid", gap: 6, marginTop: 22, maxWidth: 520 }}>
        <span style={{ fontWeight: 700 }}>Product Set ID</span>
        <input
          value={productSetId}
          onChange={(event) => setProductSetId(event.target.value)}
          style={{ padding: "10px 12px", border: "1px solid #bbb", borderRadius: 8, fontSize: 14 }}
        />
      </label>

      <section style={{ marginTop: 24, padding: 18, border: "1px solid #ddd", borderRadius: 12, background: "#fafafa" }}>
        <h2 style={{ marginTop: 0, fontSize: 20 }}>1. Add the bookmark</h2>
        <p>Drag this button to your browser bookmarks bar:</p>
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
          VCS Capture
        </a>
      </section>

      <section style={{ marginTop: 16, padding: 18, border: "1px solid #ddd", borderRadius: 12 }}>
        <h2 style={{ marginTop: 0, fontSize: 20 }}>2. Test Card #1</h2>
        <ol style={{ lineHeight: 1.7, paddingLeft: 22 }}>
          <li>Open the Dwight Evans #1 TCDB card page.</li>
          <li>Make sure both front and back images are available on that page.</li>
          <li>Click <b>VCS Capture</b> in your bookmarks bar.</li>
          <li>A small VCS window should open and show the upload result plus both R2 images.</li>
        </ol>
      </section>

      <p style={{ marginTop: 18, color: "#666", lineHeight: 1.5 }}>
        This pilot is deliberately user-triggered for the current card. It does not crawl a set in the background or
        attempt to defeat TCDB's server-side blocking.
      </p>
    </main>
  );
}
