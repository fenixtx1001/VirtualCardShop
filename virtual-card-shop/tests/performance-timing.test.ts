import assert from "node:assert/strict";
import test from "node:test";
import { serverTimingHeader } from "../src/lib/performance-timing";

test("exposes nonnegative duration as Server-Timing", () => {
  const value = serverTimingHeader(Date.now() - 20, "pack");
  assert.match(value, /^pack;dur=\d+(?:\.\d+)?$/);
});

test("sanitizes timing labels to prevent header injection", () => {
  const value = serverTimingHeader(Date.now(), "pack\r\nSensitive: data");
  assert.match(value, /^packSensitivedata;dur=\d+(?:\.\d+)?$/);
});
