/**
 * Zero-database-write performance diagnostics for read-only endpoints.
 *
 * Values are request-scoped, safe to surface in Server-Timing and useful
 * from the browser network inspector without installing paid telemetry.
 * No player names, account identifiers, or query strings are logged.
 */
export class ApiTimings {
  private readonly started = performance.now();
  private readonly measurements: Array<{ name: string; durationMs: number }> = [];

  async measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await operation();
    } finally {
      this.add(name, performance.now() - start);
    }
  }

  add(name: string, durationMs: number): void {
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(name) || !Number.isFinite(durationMs)) return;
    this.measurements.push({ name, durationMs: Math.max(0, durationMs) });
  }

  headers(route: string): HeadersInit {
    const total = Math.max(0, performance.now() - this.started);
    const parts = [
      ...this.measurements.map(({ name, durationMs }) => `${name};dur=${durationMs.toFixed(1)}`),
      `total;dur=${total.toFixed(1)}`,
    ];

    if (total >= 2000) {
      // Threshold-only log: no user identifiers, no sensitive request params.
      console.warn("[vcs-slow-api]", route, Math.round(total) + "ms",
        this.measurements.map(m => m.name + "=" + Math.round(m.durationMs)).join(" "));
    }

    return {
      "Server-Timing": parts.join(", "),
      "Cache-Control": "private, no-store",
    };
  }
}
