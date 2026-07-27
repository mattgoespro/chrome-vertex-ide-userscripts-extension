import assert from "node:assert/strict";
import test from "node:test";
import {
  getScriptModulePath,
  sanitizeModuleName,
} from "../packages/shared/src/model.ts";

test("sanitizeModuleName kebab-cases and trims punctuation", () => {
  assert.equal(sanitizeModuleName("Hello World!"), "hello-world");
  assert.equal(sanitizeModuleName("  Foo__Bar--Baz  "), "foo-bar-baz");
  assert.equal(sanitizeModuleName("@@@"), "");
});

test("getScriptModulePath prefers sanitized moduleName and falls back to id", () => {
  assert.equal(
    getScriptModulePath({ id: "script-1", moduleName: "My Module" }),
    "my-module"
  );
  assert.equal(
    getScriptModulePath({ id: "script-1", moduleName: "   " }),
    "script-1"
  );
  assert.equal(getScriptModulePath({ id: "script-1" }), "script-1");
});
