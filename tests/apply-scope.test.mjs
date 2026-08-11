import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Mirrors packages/shared/src/apply-scope.ts — keep in sync when changing expand logic.
 * (Node's test runner loads .mjs without a TS import graph.)
 */
function expandAffectedScriptIds(scriptIds, scriptsMap) {
  const affected = new Set(
    scriptIds.filter((scriptId) => scriptsMap[scriptId] != null)
  );

  let grew = true;

  while (grew) {
    grew = false;

    for (const script of Object.values(scriptsMap)) {
      if (affected.has(script.id)) {
        continue;
      }

      if (script.sharedScripts?.some((sharedId) => affected.has(sharedId))) {
        affected.add(script.id);
        grew = true;
      }
    }
  }

  return Array.from(affected);
}

describe("expandAffectedScriptIds", () => {
  it("returns only the seed script when nothing depends on it", () => {
    const scriptsMap = {
      a: { id: "a", sharedScripts: [] },
      b: { id: "b", sharedScripts: [] },
    };

    assert.deepEqual(expandAffectedScriptIds(["a"], scriptsMap), ["a"]);
  });

  it("includes consumers of a shared module", () => {
    const scriptsMap = {
      shared: { id: "shared", sharedScripts: [] },
      consumer: { id: "consumer", sharedScripts: ["shared"] },
      other: { id: "other", sharedScripts: [] },
    };

    const result = expandAffectedScriptIds(["shared"], scriptsMap).sort();
    assert.deepEqual(result, ["consumer", "shared"]);
  });

  it("includes nested consumers via fixpoint expansion", () => {
    const scriptsMap = {
      leaf: { id: "leaf", sharedScripts: [] },
      mid: { id: "mid", sharedScripts: ["leaf"] },
      top: { id: "top", sharedScripts: ["mid"] },
    };

    const result = expandAffectedScriptIds(["leaf"], scriptsMap).sort();
    assert.deepEqual(result, ["leaf", "mid", "top"]);
  });

  it("ignores unknown script ids", () => {
    const scriptsMap = {
      a: { id: "a", sharedScripts: [] },
    };

    assert.deepEqual(expandAffectedScriptIds(["missing"], scriptsMap), []);
  });
});
