import assert from "node:assert/strict";
import test from "node:test";
import { isRuntimePort } from "../packages/shared/src/messages.ts";

test("isRuntimePort accepts known runtime port sources", () => {
  assert.equal(isRuntimePort("background"), true);
  assert.equal(isRuntimePort("options"), true);
  assert.equal(isRuntimePort("popup"), true);
});

test("isRuntimePort rejects unknown sources", () => {
  assert.equal(isRuntimePort("sandbox"), false);
  assert.equal(isRuntimePort(""), false);
  assert.equal(isRuntimePort("Background"), false);
});
