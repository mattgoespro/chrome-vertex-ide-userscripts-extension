import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Mirrors packages/shared/src/workspace-closure.ts — keep in sync when changing
 * closure resolution.
 */
function getScriptModulePath(script) {
  const trimmed = script.moduleName?.trim() ?? "";
  const sanitized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || script.id;
}

const SCRIPTS_MAIN_SPECIFIER =
  /^\s*(?:import|export)(?![\s\S]*\btype\s+only\b)(?!\s*type\b)[^\n]*?\bfrom\s*["']scripts\/([^/"']+)\/main["']/gm;

function getSharedImportModuleNames(sourceCode) {
  const names = new Set();
  for (const match of sourceCode.matchAll(SCRIPTS_MAIN_SPECIFIER)) {
    if (match[1]) {
      names.add(match[1]);
    }
  }
  return [...names];
}

function resolveWorkspaceScriptClosure(currentScript, scriptsMap, options) {
  if (!currentScript || !scriptsMap[currentScript.id]) {
    return [];
  }

  const getSource =
    options?.getTypescriptSource ??
    ((script) => script.code?.source?.typescript ?? "");

  const sharedByModulePath = new Map();
  for (const candidate of Object.values(scriptsMap)) {
    if (!candidate.shared) {
      continue;
    }
    sharedByModulePath.set(getScriptModulePath(candidate), candidate.id);
  }

  const seen = new Set();
  const ordered = [];

  const visit = (scriptId) => {
    if (seen.has(scriptId)) {
      return;
    }

    const script = scriptsMap[scriptId];
    if (!script) {
      return;
    }

    seen.add(scriptId);

    for (const sharedId of script.sharedScripts ?? []) {
      visit(sharedId);
    }

    for (const modulePath of getSharedImportModuleNames(getSource(script))) {
      const dependencyId = sharedByModulePath.get(modulePath);
      if (dependencyId) {
        visit(dependencyId);
      }
    }

    ordered.push(scriptId);
  };

  visit(currentScript.id);
  return ordered;
}

function listSharedScriptIds(scriptsMap) {
  return Object.values(scriptsMap)
    .filter((script) => script.shared)
    .map((script) => script.id);
}

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

  it("puts transitive dependencies before the active script", () => {
    const scriptsMap = {
      shared: {
        id: "shared",
        shared: true,
        moduleName: "shared",
        sharedScripts: [],
        code: { source: { typescript: "" } },
      },
      nested: {
        id: "nested",
        shared: true,
        moduleName: "nested",
        sharedScripts: ["shared"],
        code: { source: { typescript: "" } },
      },
      consumer: {
        id: "consumer",
        shared: false,
        sharedScripts: ["nested"],
        code: { source: { typescript: "" } },
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
