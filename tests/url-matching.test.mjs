import assert from "node:assert/strict";
import test from "node:test";
import { matchesUrlPattern } from "../packages/shared/src/url-matching.ts";

test("matchesUrlPattern returns false for empty or missing patterns", () => {
  assert.equal(matchesUrlPattern("https://example.com/", []), false);
  assert.equal(matchesUrlPattern("https://example.com/", null), false);
  assert.equal(matchesUrlPattern("https://example.com/", undefined), false);
});

test("matchesUrlPattern supports * and ? glob wildcards", () => {
  assert.equal(
    matchesUrlPattern("https://example.com/path", ["https://example.com/*"]),
    true
  );
  assert.equal(
    matchesUrlPattern("https://example.com/a", ["https://example.com/?"]),
    true
  );
  assert.equal(
    matchesUrlPattern("https://example.com/ab", ["https://example.com/?"]),
    false
  );
});

test("matchesUrlPattern is anchored to the full URL", () => {
  assert.equal(
    matchesUrlPattern("https://evil.example.com/", ["https://example.com/*"]),
    false
  );
  assert.equal(
    matchesUrlPattern("https://example.com/page?x=1", [
      "https://example.com/page",
    ]),
    false
  );
  assert.equal(
    matchesUrlPattern("https://example.com/page?x=1", [
      "https://example.com/page*",
    ]),
    true
  );
});

test("matchesUrlPattern escapes regex metacharacters in patterns", () => {
  assert.equal(
    matchesUrlPattern("https://example.com/a+b", ["https://example.com/a+b"]),
    true
  );
  assert.equal(
    matchesUrlPattern("https://example.com/ab", ["https://example.com/a+b"]),
    false
  );
  assert.equal(
    matchesUrlPattern("https://example.com/file.js", [
      "https://example.com/file.js",
    ]),
    true
  );
});

test("matchesUrlPattern succeeds when any pattern matches", () => {
  assert.equal(
    matchesUrlPattern("https://news.example.com/story", [
      "https://shop.example.com/*",
      "https://news.example.com/*",
    ]),
    true
  );
});
