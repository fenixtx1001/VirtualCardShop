"use client";

import { useCallback, useState } from "react";
import { readDroppedImage, type DroppedImage } from "@/lib/image-drop";

type Props = {
  onImage: (image: DroppedImage) => void | Promise<void>;
  disabled?: boolean;
  compact?: boolean;
};

/**
 * Website image URLs can stop working when remote servers are slow or deny
 * requests. Copy Image -> Paste uses the image bytes provided by the user's
 * browser clipboard, and retains the existing R2 upload path.
 */
export default function PasteImageButton({ onImage, disabled = false, compact = false }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const useImage = useCallback(
    async (image: DroppedImage | null) => {
      if (!image) {
        setMessage("No image found. Right-click the picture, choose Copy Image, then paste here.");
        return;
      }
      setMessage(null);
      await onImage(image);
    },
    [onImage]
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled || reading) return;
      void readDroppedImage(event.clipboardData)
        .then(useImage)
        .catch(() => setMessage("Could not read that image. Try copying the image again."));
    },
    [disabled, reading, useImage]
  );

  const handleClick = useCallback(async () => {
    if (disabled || reading) return;
    setReading(true);
    try {
      if (!navigator.clipboard?.read) {
        setMessage("Press Ctrl+V while this button is selected.");
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const mime = item.types.find((type) => /^image\/(png|jpeg|webp|gif)$/.test(type));
        if (!mime) continue;
        const blob = await item.getType(mime);
        const suffix = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
        await useImage(new File([blob], "pasted-card." + suffix, { type: mime }));
        return;
      }
      setMessage("Clipboard contains no image. Choose Copy Image on the picture, then click Paste.");
    } catch {
      // Browsers (particularly Firefox) can restrict clipboard.read; regular
      // Ctrl+V on the focused button is the fallback.
      setMessage("Press Ctrl+V while this button is selected.");
    } finally {
      setReading(false);
    }
  }, [disabled, reading, useImage]);

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
      <button
        type="button"
        onClick={() => { void handleClick(); }}
        onPaste={handlePaste}
        disabled={disabled || reading}
        title="Right-click a permitted image, Copy Image, then click Paste or press Ctrl+V"
        style={{
          padding: compact ? "4px 7px" : "8px 10px",
          border: "1px solid #ccc",
          background: "white",
          borderRadius: 8,
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: compact ? 11 : 12,
          fontWeight: 700,
          whiteSpace: "nowrap"
        }}
      >
        {reading ? "Reading…" : compact ? "Paste" : "Paste image"}
      </button>
      {message ? (
        <span role="status" style={{ color: "#a32f28", maxWidth: compact ? 170 : 250, fontSize: 11 }}>
          {message}
        </span>
      ) : null}
    </span>
  );
}
