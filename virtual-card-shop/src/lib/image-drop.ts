/**
 * Browser image drags are not always Files. Firefox/Edge/Chrome may supply a
 * URL, HTML <img>, or DownloadURL instead. Treat all formats as candidates,
 * but never silently turn a webpage link into a card scan.
 */
export type DroppedImage = File | string;

export function supportsImageDrop(data: DataTransfer): boolean {
  const types = Array.from(data.types);
  return types.some((type) =>
    ["Files", "text/uri-list", "text/html", "text/plain", "text/x-moz-url", "text/x-moz-url-data", "DownloadURL"].includes(type) || type.startsWith("image/")
  );
}

function imageCandidate(raw: string): string | null {
  const candidate = raw.trim().replace(/^["']|["']$/g, "");
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(candidate)) return candidate;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function readDroppedImage(data: DataTransfer): Promise<DroppedImage | null> {
  const file = Array.from(data.files).find((f) => f.size > 0 && f.type.startsWith("image/")) ??
    Array.from(data.items).find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
  if (file && file.size > 0) return file;

  const download = data.getData("DownloadURL");
  const downloadMatch = download.match(/^image\/[^:]+:[^:]*:(https:\/\/.+)$/i);

  // HTML often contains an image plus a link to a webpage. Prefer the image.
  const html = data.getData("text/html");
  let htmlImage: string | null = null;
  if (html) {
    const document = new DOMParser().parseFromString(html, "text/html");
    for (const img of Array.from(document.querySelectorAll("img"))) {
      const attrs = ["data-full-src", "data-original", "data-iurl", "data-src", "src"];
      for (const attr of attrs) {
        htmlImage = imageCandidate(img.getAttribute(attr) ?? "");
        if (htmlImage) break;
      }
      if (htmlImage) break;
    }
  }

  const moz = data.getData("text/x-moz-url").split(/\r?\n/)[0];
  const mozData = data.getData("text/x-moz-url-data");
  const uri = data.getData("text/uri-list").split(/\r?\n/).find((line) => line && !line.startsWith("#")) ?? "";
  const plain = data.getData("text/plain").split(/\r?\n/)[0];
  const source = [htmlImage, downloadMatch?.[1], mozData, moz, uri, plain]
    .map((item) => imageCandidate(item ?? ""))
    .find((item): item is string => Boolean(item));

  if (!source) return null;

  if (source.startsWith("data:")) {
    try {
      const response = await fetch(source);
      const blob = await response.blob();
      if (!blob.type.startsWith("image/") || blob.size > 5 * 1024 * 1024) return null;
      return new File([blob], "dragged-image", { type: blob.type });
    } catch {
      return null;
    }
  }
  return source;
}
