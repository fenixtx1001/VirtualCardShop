import { NextResponse } from "next/server";

function buildLauncherScript(origin: string) {
  return `
(() => {
  try {
    const O = ${JSON.stringify(origin)};

    if (!/(^|\\.)tcdb\\.com$/i.test(location.hostname)) {
      throw new Error("Open a TCDB card page first.");
    }

    const nonce =
      crypto.randomUUID?.() ??
      (Date.now() + "-" + Math.random().toString(36).slice(2));

    let popup = null;

    const ext = (src) => {
      const match = String(src || "").match(/\\.([A-Za-z0-9]+)(?:\\?|$)/);
      return match ? "." + match[1] : ".jpg";
    };

    const collectImages = () => {
      return [...document.images]
        .map((img) => {
          const rect = img.getBoundingClientRect();
          return {
            src: img.currentSrc || img.src || "",
            alt: img.alt || "",
            title: img.title || "",
            area: Math.max(
              rect.width * rect.height,
              (img.naturalWidth || 0) * (img.naturalHeight || 0)
            ),
            top: rect.top,
            left: rect.left,
          };
        })
        .filter((img) => img.src);
    };

    const detectCardPair = (images) => {
      const frontByName = images.find((img) =>
        /RepFr\\.(?:jpe?g|png|webp|gif)(?:\\?|$)/i.test(img.src)
      );
      const backByName = images.find((img) =>
        /RepBk\\.(?:jpe?g|png|webp|gif)(?:\\?|$)/i.test(img.src)
      );

      if (frontByName && backByName) {
        return { front: frontByName, back: backByName };
      }

      const largeCardImages = images
        .filter(
          (img) => /\\/Images\\/Cards\\//i.test(img.src) && img.area > 20000
        )
        .sort((a, b) => b.area - a.area)
        .slice(0, 4)
        .sort((a, b) => a.top - b.top || a.left - b.left);

      if (largeCardImages.length < 2) {
        return null;
      }

      const front = frontByName || largeCardImages[0];
      const back =
        backByName ||
        largeCardImages.find((img) => img.src !== front.src) ||
        largeCardImages[1];

      if (!front || !back || front.src === back.src) {
        return null;
      }

      return { front, back };
    };

    const detectCardNumber = (images) => {
      const text = [
        document.title,
        ...images.flatMap((img) => [img.alt, img.title]),
        document.body?.innerText?.slice(0, 12000) || "",
      ].join("\\n");

      let match = text.match(/#\\s*([A-Za-z0-9.-]+)/);
      if (!match) {
        match = text.match(
          /Card\\s*(?:No\\.?|Number)?\\s*[:#]?\\s*([A-Za-z0-9.-]+)/i
        );
      }

      let cardNumber = match ? match[1] : "";
      if (!cardNumber) {
        cardNumber =
          prompt("VCS could not detect the card number. Enter it:") || "";
      }

      return cardNumber.trim();
    };

    const onReady = async (event) => {
      if (event.origin !== O) return;
      const data = event.data;
      if (!data || data.type !== "vcs-capture-ready" || data.nonce !== nonce) {
        return;
      }

      try {
        const productSetId = String(data.productSetId || "").trim();
        if (!productSetId) {
          throw new Error(
            "No active Product Set ID is configured in VCS. Open the VCS Capture page and set one first."
          );
        }

        const images = collectImages();
        const pair = detectCardPair(images);

        if (!pair) {
          throw new Error(
            "Could not find both TCDB front and back images on this page."
          );
        }

        const cardNumber = detectCardNumber(images);
        if (!cardNumber) {
          throw new Error("Card number is required.");
        }

        const responses = await Promise.all([
          fetch(pair.front.src, { credentials: "include", cache: "default" }),
          fetch(pair.back.src, { credentials: "include", cache: "default" }),
        ]);

        if (!responses[0].ok || !responses[1].ok) {
          throw new Error(
            "TCDB image read failed: front " +
              responses[0].status +
              ", back " +
              responses[1].status
          );
        }

        const blobs = await Promise.all(responses.map((response) => response.blob()));

        if (!popup || popup.closed) {
          throw new Error("The VCS capture window was closed before upload.");
        }

        popup.postMessage(
          {
            type: "vcs-card-capture",
            nonce,
            productSetId,
            cardNumber,
            sourceUrl: location.href,
            front: blobs[0],
            back: blobs[1],
            frontName: String(cardNumber) + "-front" + ext(pair.front.src),
            backName: String(cardNumber) + "-back" + ext(pair.back.src),
          },
          O
        );

        window.removeEventListener("message", onReady);
      } catch (error) {
        window.removeEventListener("message", onReady);
        alert("VCS Capture: " + (error?.message || error));
      }
    };

    window.addEventListener("message", onReady);

    popup = window.open(
      O + "/admin/set-factory/capture?receiver=1&nonce=" + encodeURIComponent(nonce),
      "vcsSetCapture",
      "width=560,height=700"
    );

    if (!popup) {
      window.removeEventListener("message", onReady);
      throw new Error("Popup blocked. Allow popups and try again.");
    }
  } catch (error) {
    alert("VCS Capture: " + (error?.message || error));
  }
})();
`;
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  return new NextResponse(buildLauncherScript(origin), {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}
