import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStorageSafeScript,
  hasSharedJavascriptConfigChanged,
  resolveSharedScriptIdsFromSourceOrThrow,
} from "../packages/renderer/src/shared/store/slices/userscripts/shared-script-resolution.ts";
import { buildUserscriptFixture } from "./helpers/fixtures.mjs";

describe("buildStorageSafeScript", () => {
  it("clears compiled javascript and css while preserving source", () => {
    const script = buildUserscriptFixture({
      code: {
        source: { typescript: "export const x = 1;", scss: ".a{}" },
        compiled: { javascript: "var x=1;", css: ".a{}" },
      },
    });

    const safe = buildStorageSafeScript(script);

    assert.equal(safe.code.source.typescript, "export const x = 1;");
    assert.equal(safe.code.source.scss, ".a{}");
    assert.equal(safe.code.compiled.javascript, "");
    assert.equal(safe.code.compiled.css, "");
  });
});

describe("hasSharedJavascriptConfigChanged", () => {
  it("returns true when there is no previous script", () => {
    const next = buildUserscriptFixture();
    assert.equal(hasSharedJavascriptConfigChanged(next), true);
  });

  it("returns false when shared config is unchanged", () => {
    const previous = buildUserscriptFixture({
      shared: true,
      moduleName: "utils",
      sharedScripts: ["a", "b"],
    });
    const next = buildUserscriptFixture({
      shared: true,
      moduleName: "utils",
      sharedScripts: ["a", "b"],
    });

    assert.equal(hasSharedJavascriptConfigChanged(next, previous), false);
  });

  it("detects shared flag, moduleName, length, and order changes", () => {
    const previous = buildUserscriptFixture({
      shared: false,
      moduleName: "utils",
      sharedScripts: ["a", "b"],
    });

    assert.equal(
      hasSharedJavascriptConfigChanged(
        { ...previous, shared: true },
        previous
      ),
      true
    );
    assert.equal(
      hasSharedJavascriptConfigChanged(
        { ...previous, moduleName: "other" },
        previous
      ),
      true
    );
    assert.equal(
      hasSharedJavascriptConfigChanged(
        { ...previous, sharedScripts: ["a"] },
        previous
      ),
      true
    );
    assert.equal(
      hasSharedJavascriptConfigChanged(
        { ...previous, sharedScripts: ["b", "a"] },
        previous
      ),
      true
    );
  });
});

describe("resolveSharedScriptIdsFromSourceOrThrow", () => {
  it("returns empty when source has no shared imports", () => {
    const script = buildUserscriptFixture({ id: "consumer" });
    const ids = resolveSharedScriptIdsFromSourceOrThrow(
      script,
      { [script.id]: script },
      "export const x = 1;"
    );
    assert.deepEqual(ids, []);
  });

  it("resolves scripts/<module>/main imports to shared script ids", () => {
    const shared = buildUserscriptFixture({
      id: "shared-1",
      shared: true,
      moduleName: "logger",
      name: "Logger",
    });
    const consumer = buildUserscriptFixture({
      id: "consumer",
      name: "Consumer",
    });

    const ids = resolveSharedScriptIdsFromSourceOrThrow(
      consumer,
      { [shared.id]: shared, [consumer.id]: consumer },
      `import { log } from "scripts/logger/main";\nexport {};`
    );

    assert.deepEqual(ids, ["shared-1"]);
  });

  it("throws when the shared module is unknown", () => {
    const consumer = buildUserscriptFixture({
      id: "consumer",
      name: "Consumer",
    });

    assert.throws(
      () =>
        resolveSharedScriptIdsFromSourceOrThrow(
          consumer,
          { [consumer.id]: consumer },
          `import { log } from "scripts/missing/main";`
        ),
      /Unknown shared module import "scripts\/missing\/main"/
    );
  });

  it("throws on self-import of the same shared module", () => {
    const shared = buildUserscriptFixture({
      id: "shared-1",
      shared: true,
      moduleName: "logger",
      name: "Logger",
    });

    assert.throws(
      () =>
        resolveSharedScriptIdsFromSourceOrThrow(
          shared,
          { [shared.id]: shared },
          `import { log } from "scripts/logger/main";`
        ),
      /cannot import itself/
    );
  });

  it("throws when two scripts claim the same shared module path", () => {
    const a = buildUserscriptFixture({
      id: "a",
      shared: true,
      moduleName: "dup",
      name: "A",
    });
    const b = buildUserscriptFixture({
      id: "b",
      shared: true,
      moduleName: "dup",
      name: "B",
    });
    const consumer = buildUserscriptFixture({ id: "consumer", name: "C" });

    assert.throws(
      () =>
        resolveSharedScriptIdsFromSourceOrThrow(
          consumer,
          { a, b, consumer },
          `import { x } from "scripts/dup/main";`
        ),
      /defined by more than one script/
    );
  });

  it("ignores non-shared scripts when building the module map", () => {
    const nonShared = buildUserscriptFixture({
      id: "private",
      shared: false,
      moduleName: "logger",
    });
    const shared = buildUserscriptFixture({
      id: "shared-1",
      shared: true,
      moduleName: "logger",
    });
    const consumer = buildUserscriptFixture({ id: "consumer" });

    const ids = resolveSharedScriptIdsFromSourceOrThrow(
      consumer,
      { private: nonShared, [shared.id]: shared, [consumer.id]: consumer },
      `import "scripts/logger/main";`
    );

    assert.deepEqual(ids, ["shared-1"]);
  });
});
