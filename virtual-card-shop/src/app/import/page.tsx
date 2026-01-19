"use client";

import { useState } from "react";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setStatus("Uploading...");

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/import", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (res.ok) {
      setStatus(`Imported ${data.count} cards`);
    } else {
      setStatus(data.error || "Import failed");
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Import Cards (CSV)</h1>

      <form onSubmit={handleSubmit}>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <br /><br />
        <button type="submit">Import</button>
      </form>

      {status && <p>{status}</p>}
    </main>
  );
}
