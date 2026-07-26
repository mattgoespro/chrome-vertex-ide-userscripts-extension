import assert from "node:assert/strict";
import test from "node:test";
import { getAffectedScriptIdsFromStorageChanges } from "../packages/renderer/src/shared/store/slices/editor-drafts/helpers.ts";

test("getAffectedScriptIdsFromStorageChanges collects userscript ids from manifest and chunk keys", () => {
  const scriptIds = getAffectedScriptIdsFromStorageChanges({
    "userscript:alpha": { newValue: {} },
    "userscript:beta:chunk:0": { newValue: "chunk" },
    "userscript:beta:chunk:1": { oldValue: "chunk" },
    globalModules: { newValue: {} },
    editorSettings: { newValue: {} },
    "compiled:alpha": { newValue: {} },
  });

  assert.deepEqual(scriptIds.sort(), ["alpha", "beta"]);
});

test("getAffectedScriptIdsFromStorageChanges returns an empty list when no userscript keys changed", () => {
  assert.deepEqual(
    getAffectedScriptIdsFromStorageChanges({
      globalModules: { newValue: {} },
    }),
    []
  );
});
