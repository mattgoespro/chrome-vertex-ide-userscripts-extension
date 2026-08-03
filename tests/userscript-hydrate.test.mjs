import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Mirrors packages/shared/src/userscript-hydrate.ts — keep in sync when changing
 * hydrate helpers.
 */
function normalizeUserscript(script) {
  return {
    ...script,
    typeDefinitions: script.typeDefinitions ?? "",
  };
}

function mergeCompiledCode(script, compiled) {
  if (!compiled) {
    return script;
  }

  return {
    ...script,
    code: {
      ...script.code,
      compiled: {
        javascript: compiled.javascript || script.code.compiled.javascript,
        css: compiled.css || script.code.compiled.css,
      },
    },
  };
}

function hydrateUserscriptWithCompiled(script, compiled) {
  return mergeCompiledCode(normalizeUserscript(script), compiled);
}

function toStorageSafeUserscript(script) {
  return {
    ...script,
    code: {
      source: script.code.source,
      compiled: {
        javascript: "",
        css: "",
      },
    },
  };
}

describe("userscript hydrate helpers", () => {
  const base = {
    id: "a",
    typeDefinitions: undefined,
    code: {
      source: { typescript: " cons x = 1", scss: "" },
      compiled: { javascript: "oldJs", css: "oldCss" },
    },
  };

  it("normalizeUserscript defaults typeDefinitions", () => {
    assert.equal(normalizeUserscript(base).typeDefinitions, "");
  });

  it("mergeCompiledCode overlays non-empty compiled fields", () => {
    const merged = mergeCompiledCode(base, {
      javascript: "newJs",
      css: "",
    });

    assert.equal(merged.code.compiled.javascript, "newJs");
    assert.equal(merged.code.compiled.css, "oldCss");
  });

  it("hydrateUserscriptWithCompiled normalizes then merges", () => {
    const hydrated = hydrateUserscriptWithCompiled(base, {
      javascript: "js",
      css: "css",
    });

    assert.equal(hydrated.typeDefinitions, "");
    assert.equal(hydrated.code.compiled.javascript, "js");
    assert.equal(hydrated.code.compiled.css, "css");
  });

  it("toStorageSafeUserscript clears compiled payloads", () => {
    const safe = toStorageSafeUserscript(base);
    assert.equal(safe.code.compiled.javascript, "");
    assert.equal(safe.code.compiled.css, "");
    assert.equal(safe.code.source.typescript, base.code.source.typescript);
  });
});
