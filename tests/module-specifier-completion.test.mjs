import assert from "node:assert/strict";
import test from "node:test";
import {
  getModuleSpecifierSuggestions,
  matchScriptsSpecifierPrefix,
} from "../packages/monaco/src/typescript/module-specifier-helpers.ts";

const modules = [
  { moduleName: "dom-utils", scriptName: "DOM Utils" },
  { moduleName: "helpers", scriptName: "Helpers" },
];

test("matchScriptsSpecifierPrefix matches static import from scripts/", () => {
  assert.equal(
    matchScriptsSpecifierPrefix('import { x } from "scripts/dom'),
    "dom"
  );
  assert.equal(
    matchScriptsSpecifierPrefix("export { y } from 'scripts/helpers/"),
    "helpers/"
  );
});

test("matchScriptsSpecifierPrefix matches dynamic import from scripts/", () => {
  assert.equal(
    matchScriptsSpecifierPrefix('const m = import("scripts/dom-utils/'),
    "dom-utils/"
  );
});

test("matchScriptsSpecifierPrefix returns null outside scripts/ import prefixes", () => {
  assert.equal(matchScriptsSpecifierPrefix('import { x } from "lodash'), null);
  assert.equal(matchScriptsSpecifierPrefix("const x = 1;"), null);
  assert.equal(
    matchScriptsSpecifierPrefix('import type { X } from "scripts/dom'),
    null
  );
});

test("getModuleSpecifierSuggestions lists module/entry pairs before a slash", () => {
  const suggestions = getModuleSpecifierSuggestions("do", modules);

  assert.deepEqual(
    suggestions.map((item) => item.insertText),
    ["dom-utils/main", "dom-utils/types", "helpers/main", "helpers/types"]
  );
  assert.equal(suggestions[0].kind, "module-entry");
  assert.equal(suggestions[0].detail, "DOM Utils");
});

test("getModuleSpecifierSuggestions offers main/types after a known module slash", () => {
  const suggestions = getModuleSpecifierSuggestions("dom-utils/", modules);

  assert.deepEqual(
    suggestions.map((item) => ({
      label: item.label,
      detail: item.detail,
      kind: item.kind,
    })),
    [
      {
        label: "main",
        detail: "scripts/dom-utils/main",
        kind: "entry",
      },
      {
        label: "types",
        detail: "scripts/dom-utils/types",
        kind: "entry",
      },
    ]
  );
});

test("getModuleSpecifierSuggestions returns nothing for unknown module segments", () => {
  assert.deepEqual(getModuleSpecifierSuggestions("missing/", modules), []);
});
