import { test } from "node:test";
import assert from "node:assert/strict";
import { binderHref, checklistHref } from "../src/lib/collection/set-view-links";

test("checklist preserves insert product-set selection in URL", () => {
  const href = checklistHref("1999 UD Spx Football", "1999_SpX_Radiance");
  assert.equal(href, "/checklist/1999%20UD%20Spx%20Football?productSetId=1999_SpX_Radiance");
});

test("binder preserves same product set and opens the sleeve page from checklist", () => {
  const href = binderHref("1999 UD Spx Football", "1999_SpX_Radiance", { open: true });
  const url = new URL(href, "https://vcs.example");
  assert.equal(url.pathname, "/collection/1999%20UD%20Spx%20Football/binder");
  assert.equal(url.searchParams.get("productSetId"), "1999_SpX_Radiance");
  assert.equal(url.searchParams.get("open"), "1");
});

test("card link goes to exact card's binder page rather than default set", () => {
  const href = binderHref("2001 Bowman Chrome", "2001_Bowman_Chrome_Inserts", {
    cardId: 6789, open: true,
  });
  const params = new URL(href, "https://vcs.example").searchParams;
  assert.equal(params.get("productSetId"), "2001_Bowman_Chrome_Inserts");
  assert.equal(params.get("cardId"), "6789");
  assert.equal(params.has("open"), false);
});

test("legacy links without set ID still work and show cover", () => {
  assert.equal(checklistHref("1977_Topps"), "/checklist/1977_Topps");
  assert.equal(binderHref("1977_Topps"), "/collection/1977_Topps/binder");
});

test("bad card IDs aren't accepted into navigation links", () => {
  const link = binderHref("1977_Topps", "base", { cardId: -1 });
  assert.equal(new URL(link, "https://vcs.example").searchParams.has("cardId"), false);
});
