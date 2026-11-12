import assert from "node:assert/strict";
import test from "node:test";
import { imageDeliveryUrl, imageDeliveryPreconnectOrigin } from "./r2-cdn";

const origin = "https://pub-example.r2.dev";
const cdn = "https://cards.example.com";
const url = origin + "/virtual-card-shop/cards/1994/topps/17%20front.jpg";
const cfg = { originBaseUrl: origin, cdnBaseUrl: cdn };

test("disabled by default unless both the origin and CDN are configured", () => {
  assert.equal(imageDeliveryUrl(url, { originBaseUrl: origin }), url);
  assert.equal(imageDeliveryUrl(url, { cdnBaseUrl: cdn }), url);
  assert.equal(imageDeliveryUrl(url, {}), url);
  assert.equal(imageDeliveryUrl(null, cfg), null);
  assert.equal(imageDeliveryUrl("", cfg), null);
});

test("maps only exact R2 origin and immutable asset namespace", () => {
  assert.equal(imageDeliveryUrl(url, cfg),
    cdn + "/virtual-card-shop/cards/1994/topps/17%20front.jpg");
  assert.equal(imageDeliveryUrl(url + "?v=2026#front", cfg),
    cdn + "/virtual-card-shop/cards/1994/topps/17%20front.jpg?v=2026#front");
  assert.equal(imageDeliveryUrl(origin + "/not-card-art/photo.jpg", cfg),
    origin + "/not-card-art/photo.jpg");
});

test("foreign URLs, invalid URLs and lookalike hosts are untouched", () => {
  for (const value of [
    "https://example.com/virtual-card-shop/cards/test.jpg",
    "https://pub-example.r2.dev.evil.invalid/virtual-card-shop/cards/a.jpg",
    "https://evil@pub-example.r2.dev/virtual-card-shop/cards/a.jpg",
    "http://pub-example.r2.dev/virtual-card-shop/cards/a.jpg",
    "data:image/png;base64,abc",
    "/uploads/local-card.jpg",
    "not a url",
  ]) assert.equal(imageDeliveryUrl(value, cfg), value, value);
});

test("invalid CDN configuration never changes an existing image", () => {
  const bad = [
    "http://cards.example.com",
    "https://cards.example.com?token=123",
    "https://someone:password@cards.example.com",
    "not a URL",
  ];
  for (const value of bad) {
    assert.equal(imageDeliveryUrl(url, { originBaseUrl: origin, cdnBaseUrl: value }), url);
  }
  assert.equal(imageDeliveryUrl(url, { originBaseUrl: origin, cdnBaseUrl: origin }), url);
});

test("supports prefix-based R2 origins and CDN paths, without duplicating prefixes", () => {
  const prefixed = "https://assets.example.com/source/virtual-card-shop/uploads/x.png";
  assert.equal(imageDeliveryUrl(prefixed, {
    originBaseUrl: "https://assets.example.com/source",
    cdnBaseUrl: "https://cdn.example.com/images/",
  }), "https://cdn.example.com/images/virtual-card-shop/uploads/x.png");
});

test("preconnect chooses the host that actual image requests will use", () => {
  assert.equal(imageDeliveryPreconnectOrigin(cfg, origin), cdn);
  assert.equal(imageDeliveryPreconnectOrigin({}, origin), origin);
  assert.equal(imageDeliveryPreconnectOrigin({}, undefined), null);
  assert.equal(imageDeliveryPreconnectOrigin({ originBaseUrl: origin }, origin), origin);
});
