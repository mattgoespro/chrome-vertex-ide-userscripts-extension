import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hydrateUserscript,
  serializeUserscript,
} from "../packages/shared/src/storage/userscript-payload.ts";
import { buildUserscriptFixture } from "./helpers/fixtures.mjs";

describe("serializeUserscript", () => {
  it("omits default-valued fields to keep sync payloads sparse", () => {
    const script = buildUserscriptFixture({
      enabled: false,
      status: "saved",
      shared: false,
      moduleName: "   ",
      sharedScripts: [],
      globalModules: [],
      typeDefinitions: "",
      urlPatterns: [],
      runAt: "beforePageLoad",
      code: {
        source: { typescript: "", scss: "" },
        compiled: { javascript: "should-not-persist", css: ".nope{}" },
      },
    });

    const payload = serializeUserscript(script);

    assert.deepEqual(Object.keys(payload).sort(), [
      "createdAt",
      "name",
      "updatedAt",
    ]);
    assert.equal(payload.enabled, undefined);
    assert.equal(payload.code, undefined);
    assert.equal(payload.runAt, undefined);
  });

  it("includes only non-default flags, sources, and afterPageLoad runAt", () => {
    const script = buildUserscriptFixture({
      enabled: true,
      status: "modified",
      shared: true,
      moduleName: "utils",
      sharedScripts: ["dep-1"],
      globalModules: ["mod-1"],
      typeDefinitions: "export type T = 1;",
      urlPatterns: ["https://example.com/*"],
      runAt: "afterPageLoad",
      error: true,
      code: {
        source: { typescript: "export const x = 1;", scss: "" },
        compiled: { javascript: "ignored", css: "" },
      },
    });

    const payload = serializeUserscript(script);

    assert.equal(payload.enabled, true);
    assert.equal(payload.status, "modified");
    assert.equal(payload.shared, true);
    assert.equal(payload.moduleName, "utils");
    assert.deepEqual(payload.sharedScripts, ["dep-1"]);
    assert.deepEqual(payload.globalModules, ["mod-1"]);
    assert.equal(payload.typeDefinitions, "export type T = 1;");
    assert.deepEqual(payload.urlPatterns, ["https://example.com/*"]);
    assert.equal(payload.runAt, "afterPageLoad");
    assert.equal(payload.error, true);
    assert.deepEqual(payload.code, {
      source: { typescript: "export const x = 1;" },
    });
  });

  it("keeps scss-only source when typescript is empty", () => {
    const script = buildUserscriptFixture({
      code: {
        source: { typescript: "", scss: ".x{}" },
        compiled: { javascript: "", css: "" },
      },
    });

    const payload = serializeUserscript(script);
    assert.deepEqual(payload.code, { source: { scss: ".x{}" } });
  });
});

describe("hydrateUserscript", () => {
  it("applies storage defaults for a sparse payload", () => {
    const script = hydrateUserscript(
      "id-1",
      {
        name: "Sparse",
        createdAt: 100,
        updatedAt: 200,
      },
      999
    );

    assert.equal(script.id, "id-1");
    assert.equal(script.name, "Sparse");
    assert.equal(script.enabled, false);
    assert.equal(script.status, "saved");
    assert.equal(script.shared, false);
    assert.equal(script.moduleName, "");
    assert.deepEqual(script.sharedScripts, []);
    assert.deepEqual(script.globalModules, []);
    assert.equal(script.typeDefinitions, "");
    assert.deepEqual(script.code.source, { typescript: "", scss: "" });
    assert.deepEqual(script.code.compiled, { javascript: "", css: "" });
    assert.deepEqual(script.urlPatterns, []);
    assert.equal(script.runAt, "beforePageLoad");
    assert.equal(script.createdAt, 100);
    assert.equal(script.updatedAt, 200);
  });

  it("fills missing name and timestamps from defaults / now", () => {
    const script = hydrateUserscript("id-2", {}, 12345);

    assert.equal(script.name, "Untitled Script");
    assert.equal(script.createdAt, 12345);
    assert.equal(script.updatedAt, 12345);
  });

  it("uses createdAt as updatedAt fallback when only createdAt is present", () => {
    const script = hydrateUserscript(
      "id-3",
      { name: "X", createdAt: 50 },
      999
    );

    assert.equal(script.createdAt, 50);
    assert.equal(script.updatedAt, 50);
  });

  it("round-trips sparse serialize → hydrate for default script shape", () => {
    const original = buildUserscriptFixture({
      enabled: false,
      runAt: "beforePageLoad",
      code: {
        source: { typescript: "", scss: "" },
        compiled: { javascript: "local-only", css: "" },
      },
    });

    const restored = hydrateUserscript(
      original.id,
      serializeUserscript(original),
      0
    );

    assert.equal(restored.enabled, false);
    assert.equal(restored.runAt, "beforePageLoad");
    assert.equal(restored.code.source.typescript, "");
    // Compiled output is intentionally not persisted in sync storage.
    assert.equal(restored.code.compiled.javascript, "");
  });
});
