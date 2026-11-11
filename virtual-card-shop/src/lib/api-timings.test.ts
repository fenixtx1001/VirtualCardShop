import assert from "node:assert/strict";
import test from "node:test";
import { ApiTimings } from "./api-timings";

test("performance headers include named durations and total", async () => {
  const timer = new ApiTimings();
  const value = await timer.measure("database", async () => 42);
  assert.equal(value, 42);
  timer.add("compute", 2.25);
  const headers = new Headers(timer.headers("/api/analytics/cards"));
  assert.match(headers.get("Server-Timing") || "", /database;dur=[0-9.]+, compute;dur=2.3, total;dur=[0-9.]+/);
  assert.equal(headers.get("Cache-Control"), "private, no-store");
});

test("failed operations are still timed without masking the error", async () => {
  const timer = new ApiTimings();
  await assert.rejects(
    timer.measure("database", async () => { throw new Error("expected"); }),
    /expected/
  );
  assert.match(new Headers(timer.headers("test")).get("Server-Timing") || "", /database;dur=/);
});

test("invalid timing labels and durations cannot corrupt headers", () => {
  const timer = new ApiTimings();
  timer.add('bad\\r\\nheader', 1);
  timer.add("bad", Number.POSITIVE_INFINITY);
  const header = new Headers(timer.headers("test")).get("Server-Timing") || "";
  assert.doesNotMatch(header, /bad/);
  assert.match(header, /total;dur=/);
});
