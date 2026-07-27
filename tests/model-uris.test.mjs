import assert from "node:assert/strict";
import test from "node:test";
import {
  buildModelUri,
  buildScriptFileUri,
  buildScriptModelId,
} from "../packages/monaco/src/typescript/model-uris.ts";

test("buildScriptModelId uses sanitized moduleName for main and styles", () => {
  assert.equal(
    buildScriptModelId({ id: "script-1", moduleName: "Dom Utils" }, "main"),
    "scripts/dom-utils/main"
  );
  assert.equal(
    buildScriptModelId({ id: "script-1", moduleName: "Dom Utils" }, "styles"),
    "scripts/dom-utils/styles"
  );
});

test("buildScriptModelId uses types.d suffix for declaration buffers", () => {
  assert.equal(
    buildScriptModelId({ id: "script-1", moduleName: "helpers" }, "types"),
    "scripts/helpers/types.d"
  );
});

test("buildScriptModelId falls back to script id when moduleName sanitizes empty", () => {
  assert.equal(
    buildScriptModelId({ id: "script-42", moduleName: "@@@" }, "main"),
    "scripts/script-42/main"
  );
  assert.equal(
    buildScriptModelId({ id: "script-42" }, "types"),
    "scripts/script-42/types.d"
  );
});

test("buildModelUri appends language-specific extensions", () => {
  assert.equal(
    buildModelUri("scripts/helpers/main", "typescript"),
    "file:///scripts/helpers/main.ts"
  );
  assert.equal(
    buildModelUri("scripts/helpers/styles", "scss"),
    "file:///scripts/helpers/styles.scss"
  );
});

test("buildScriptFileUri builds canonical Monaco URIs per editor kind", () => {
  const script = { id: "script-1", moduleName: "shared-lib" };

  assert.equal(
    buildScriptFileUri(script, "main"),
    "file:///scripts/shared-lib/main.ts"
  );
  assert.equal(
    buildScriptFileUri(script, "types"),
    "file:///scripts/shared-lib/types.d.ts"
  );
  assert.equal(
    buildScriptFileUri(script, "styles"),
    "file:///scripts/shared-lib/styles.scss"
  );
});
