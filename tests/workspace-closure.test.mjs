import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listSharedScriptIds,
  resolveWorkspaceScriptClosure,
} from "../packages/shared/src/workspace-closure.ts";

describe("resolveWorkspaceScriptClosure", () => {
  it("returns only the active script when it has no deps", () => {
    const scriptsMap = {
      a: {
        id: "a",
        shared: false,
        sharedScripts: [],
        code: { source: { typescript: "" } },
      },
      b: {
        id: "b",
        shared: false,
        sharedScripts: [],
        code: { source: { typescript: "" } },
      },
    };

    assert.deepEqual(
      resolveWorkspaceScriptClosure(scriptsMap.a, scriptsMap),
      ["a"]
    );
  });

  it("puts transitive dependencies before the active script (from imports)", () => {
    const scriptsMap = {
      shared: {
        id: "shared",
        shared: true,
        moduleName: "shared",
        sharedScripts: [],
        code: { source: { typescript: "export const x = 1;" } },
      },
      nested: {
        id: "nested",
        shared: true,
        moduleName: "nested",
        // Persisted cache deliberately stale / empty — closure uses imports.
        sharedScripts: [],
        code: {
          source: {
            typescript: `import { x } from "scripts/shared/main";\nexport const y = x;`,
          },
        },
      },
      consumer: {
        id: "consumer",
        shared: false,
        sharedScripts: [],
        code: {
          source: {
            typescript: `import { y } from "scripts/nested/main";\nexport {};`,
          },
        },
      },
      other: {
        id: "other",
        shared: false,
        sharedScripts: [],
        code: { source: { typescript: "" } },
      },
    };

    assert.deepEqual(
      resolveWorkspaceScriptClosure(scriptsMap.consumer, scriptsMap),
      ["shared", "nested", "consumer"]
    );
  });

  it("resolves deps from TypeScript imports when sharedScripts is stale", () => {
    const scriptsMap = {
      logger: {
        id: "logger",
        shared: true,
        moduleName: "logger",
        sharedScripts: [],
        code: { source: { typescript: "export function createLogger() {}" } },
      },
      consumer: {
        id: "consumer",
        shared: false,
        sharedScripts: [],
        code: {
          source: {
            typescript: `import { createLogger } from "scripts/logger/main";`,
          },
        },
      },
    };

    assert.deepEqual(
      resolveWorkspaceScriptClosure(scriptsMap.consumer, scriptsMap),
      ["logger", "consumer"]
    );
  });

  it("ignores persisted sharedScripts that are not imported", () => {
    const scriptsMap = {
      unused: {
        id: "unused",
        shared: true,
        moduleName: "unused",
        sharedScripts: [],
        code: { source: { typescript: "export const u = 1;" } },
      },
      consumer: {
        id: "consumer",
        shared: false,
        sharedScripts: ["unused"],
        code: { source: { typescript: "export const c = 1;" } },
      },
    };

    assert.deepEqual(
      resolveWorkspaceScriptClosure(scriptsMap.consumer, scriptsMap),
      ["consumer"]
    );
  });

  it("returns empty when current script is missing", () => {
    assert.deepEqual(resolveWorkspaceScriptClosure(null, {}), []);
    assert.deepEqual(
      resolveWorkspaceScriptClosure({ id: "missing", sharedScripts: [] }, {}),
      []
    );
  });
});

describe("listSharedScriptIds", () => {
  it("returns only shared scripts", () => {
    assert.deepEqual(
      listSharedScriptIds({
        a: { id: "a", shared: true },
        b: { id: "b", shared: false },
        c: { id: "c", shared: true },
      }).sort(),
      ["a", "c"]
    );
  });
});
