import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Mirrors packages/shared/src/resolve-shared-scripts.ts — keep in sync when
 * changing shared-import resolution.
 */
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

function getScriptModulePath(script) {
  const trimmed = script.moduleName?.trim() ?? "";
  return trimmed || script.id;
}

function normalizeUserscript(script) {
  return {
    ...script,
    typeDefinitions: script.typeDefinitions ?? "",
  };
}

function resolveSharedScriptIdsFromSourceOrThrow(
  script,
  scriptsMap,
  sourceCode
) {
  const moduleNames = getSharedImportModuleNames(sourceCode);

  if (moduleNames.length === 0) {
    return [];
  }

  const sharedByModuleName = new Map();

  for (const candidate of Object.values(scriptsMap).map(normalizeUserscript)) {
    if (!candidate.shared) {
      continue;
    }

    const modulePath = getScriptModulePath(candidate);
    const existingScriptId = sharedByModuleName.get(modulePath);

    if (existingScriptId && existingScriptId !== candidate.id) {
      throw new Error(
        `Shared module "${modulePath}" is defined by more than one script.`
      );
    }

    sharedByModuleName.set(modulePath, candidate.id);
  }

  return moduleNames.map((modulePath) => {
    const sharedScriptId = sharedByModuleName.get(modulePath);

    if (!sharedScriptId) {
      throw new Error(
        `Unknown shared module import "scripts/${modulePath}/main" in script "${script.name}".`
      );
    }

    if (sharedScriptId === script.id) {
      throw new Error(
        `Script "${script.name}" cannot import itself from "scripts/${modulePath}/main".`
      );
    }

    return sharedScriptId;
  });
}

function hasSharedJavascriptConfigChanged(nextScript, previousScript) {
  if (!previousScript) {
    return true;
  }

  const nextSharedScripts = nextScript.sharedScripts ?? [];
  const previousSharedScripts = previousScript.sharedScripts ?? [];

  if (
    nextScript.shared !== previousScript.shared ||
    nextScript.moduleName !== previousScript.moduleName ||
    nextSharedScripts.length !== previousSharedScripts.length
  ) {
    return true;
  }

  return nextSharedScripts.some(
    (sharedScriptId, index) => sharedScriptId !== previousSharedScripts[index]
  );
}

describe("resolveSharedScriptIdsFromSourceOrThrow", () => {
  it("resolves scripts/<module>/main imports to shared script ids", () => {
    const scriptsMap = {
      shared: {
        id: "shared",
        shared: true,
        moduleName: "utils",
        name: "Utils",
      },
      consumer: {
        id: "consumer",
        shared: false,
        moduleName: "app",
        name: "App",
      },
    };

    const ids = resolveSharedScriptIdsFromSourceOrThrow(
      scriptsMap.consumer,
      scriptsMap,
      `import { x } from "scripts/utils/main";`
    );

    assert.deepEqual(ids, ["shared"]);
  });

  it("throws when the shared module is missing", () => {
    assert.throws(
      () =>
        resolveSharedScriptIdsFromSourceOrThrow(
          { id: "a", name: "A", shared: false },
          {},
          `import { x } from "scripts/missing/main";`
        ),
      /Unknown shared module/
    );
  });
});

describe("hasSharedJavascriptConfigChanged", () => {
  it("returns true when sharedScripts differ", () => {
    assert.equal(
      hasSharedJavascriptConfigChanged(
        { shared: true, moduleName: "a", sharedScripts: ["x"] },
        { shared: true, moduleName: "a", sharedScripts: ["y"] }
      ),
      true
    );
  });

  it("returns false when shared config is unchanged", () => {
    assert.equal(
      hasSharedJavascriptConfigChanged(
        { shared: true, moduleName: "a", sharedScripts: ["x"] },
        { shared: true, moduleName: "a", sharedScripts: ["x"] }
      ),
      false
    );
  });
});
