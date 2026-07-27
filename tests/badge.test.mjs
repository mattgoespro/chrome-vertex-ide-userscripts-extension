import assert from "node:assert/strict";
import test from "node:test";
import { countMatchingScripts } from "../packages/runtime/src/ide/badge.ts";
import { buildUserscriptFixture } from "./helpers/fixtures.mjs";

test("countMatchingScripts includes disabled scripts that match the URL", () => {
  const scriptsMap = {
    enabled: buildUserscriptFixture({
      id: "enabled",
      enabled: true,
      urlPatterns: ["https://example.com/*"],
    }),
    disabled: buildUserscriptFixture({
      id: "disabled",
      enabled: false,
      urlPatterns: ["https://example.com/*"],
    }),
    otherHost: buildUserscriptFixture({
      id: "otherHost",
      enabled: true,
      urlPatterns: ["https://other.example.com/*"],
    }),
  };

  assert.equal(
    countMatchingScripts("https://example.com/page", scriptsMap),
    2
  );
});

test("countMatchingScripts returns 0 when nothing matches", () => {
  const scriptsMap = {
    script: buildUserscriptFixture({
      urlPatterns: ["https://shop.example.com/*"],
    }),
  };

  assert.equal(
    countMatchingScripts("https://example.com/page", scriptsMap),
    0
  );
});
