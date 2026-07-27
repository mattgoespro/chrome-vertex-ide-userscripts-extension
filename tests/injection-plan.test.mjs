import assert from "node:assert/strict";
import test from "node:test";
import {
  collectCompiledCodeScriptIds,
  collectEnabledCdnModuleIds,
  collectSharedScriptIdsToInject,
  mergeCompiledCode,
  selectMatchingScriptsForInjection,
} from "../packages/runtime/src/ide/injection-plan.ts";
import {
  buildModuleFixture,
  buildUserscriptFixture,
} from "./helpers/fixtures.mjs";

test("selectMatchingScriptsForInjection requires enabled + runAt + URL match", () => {
  const scriptsMap = {
    match: buildUserscriptFixture({
      id: "match",
      enabled: true,
      runAt: "afterPageLoad",
      urlPatterns: ["https://example.com/*"],
    }),
    disabled: buildUserscriptFixture({
      id: "disabled",
      enabled: false,
      runAt: "afterPageLoad",
      urlPatterns: ["https://example.com/*"],
    }),
    wrongTiming: buildUserscriptFixture({
      id: "wrongTiming",
      enabled: true,
      runAt: "beforePageLoad",
      urlPatterns: ["https://example.com/*"],
    }),
    wrongHost: buildUserscriptFixture({
      id: "wrongHost",
      enabled: true,
      runAt: "afterPageLoad",
      urlPatterns: ["https://other.example.com/*"],
    }),
  };

  const matching = selectMatchingScriptsForInjection(
    scriptsMap,
    "https://example.com/page",
    "afterPageLoad"
  );

  assert.deepEqual(
    matching.map((script) => script.id),
    ["match"]
  );
});

test("collectCompiledCodeScriptIds includes shared dependency ids", () => {
  const matching = [
    buildUserscriptFixture({
      id: "page",
      sharedScripts: ["shared-a", "shared-b"],
    }),
    buildUserscriptFixture({
      id: "other",
      sharedScripts: ["shared-a"],
    }),
  ];

  const ids = collectCompiledCodeScriptIds(matching).sort();

  assert.deepEqual(ids, ["other", "page", "shared-a", "shared-b"]);
});

test("mergeCompiledCode overlays local compiled payloads and keeps missing fields", () => {
  const script = buildUserscriptFixture({
    id: "script-1",
    code: {
      compiled: {
        javascript: "manifestJs()",
        css: "manifestCss{}",
      },
    },
  });

  assert.equal(mergeCompiledCode(script, {}), script);

  const merged = mergeCompiledCode(script, {
    "script-1": {
      javascript: "localJs()",
      css: "",
    },
  });

  assert.equal(merged.code.compiled.javascript, "localJs()");
  assert.equal(merged.code.compiled.css, "manifestCss{}");
  assert.notEqual(merged, script);
});

test("collectEnabledCdnModuleIds dedupes and skips disabled/missing modules", () => {
  const scripts = [
    buildUserscriptFixture({
      id: "a",
      globalModules: ["mod-1", "mod-2", "missing"],
    }),
    buildUserscriptFixture({
      id: "b",
      globalModules: ["mod-2", "mod-3"],
    }),
  ];
  const modulesMap = {
    "mod-1": buildModuleFixture({ id: "mod-1", enabled: true }),
    "mod-2": buildModuleFixture({ id: "mod-2", enabled: false }),
    "mod-3": buildModuleFixture({ id: "mod-3", enabled: true }),
  };

  assert.deepEqual(collectEnabledCdnModuleIds(scripts, modulesMap), [
    "mod-1",
    "mod-3",
  ]);
});

test("collectSharedScriptIdsToInject keeps first-seen order and ignores non-shared entries", () => {
  const matching = [
    buildUserscriptFixture({
      id: "page-a",
      sharedScripts: ["shared-1", "not-shared", "shared-2"],
    }),
    buildUserscriptFixture({
      id: "page-b",
      sharedScripts: ["shared-2", "shared-1"],
    }),
  ];
  const scriptsMap = {
    "shared-1": buildUserscriptFixture({
      id: "shared-1",
      shared: true,
      moduleName: "shared-1",
    }),
    "shared-2": buildUserscriptFixture({
      id: "shared-2",
      shared: true,
      moduleName: "shared-2",
    }),
    "not-shared": buildUserscriptFixture({
      id: "not-shared",
      shared: false,
    }),
  };

  assert.deepEqual(collectSharedScriptIdsToInject(matching, scriptsMap), [
    "shared-1",
    "shared-2",
  ]);
});
