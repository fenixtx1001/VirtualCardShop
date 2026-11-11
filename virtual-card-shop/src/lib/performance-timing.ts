/**
 * Low-overhead request timing with no new network call, database record, or
 * paid observability event. DevTools exposes this in the Server-Timing header.
 * Do not include user IDs, queries, or database values in timing labels.
 */
export function serverTimingHeader(startedAtMs: number, label = "vcs") {
  const elapsed = Math.max(0, Math.round((Date.now() - startedAtMs) * 10) / 10);
  const metric = label.replace(/[^a-zA-Z0-9_-]/g, "") || "vcs";
  return `${metric};dur=${elapsed}`;
}
