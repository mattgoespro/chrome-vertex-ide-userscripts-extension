import {
  Userscript,
  Userscripts,
  getScriptModulePath,
} from "@shared/model";
import { getSharedImportModuleNames } from "@shared/shared-module-imports";

export function normalizeUserscript(script: Userscript): Userscript {
  return {
    ...script,
    typeDefinitions: script.typeDefinitions ?? "",
  };
}

/**
 * Strips compiled payloads before Chrome sync writes so large JS/CSS never
 * consume sync quota. Local compiled artifacts live in CompiledCodeStorage.
 */
export function buildStorageSafeScript(script: Userscript): Userscript {
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

/**
 * Resolves `scripts/<module>/main` imports in source to shared script IDs.
 * Throws on unknown modules, duplicate shared module names, or self-imports.
 */
export function resolveSharedScriptIdsFromSourceOrThrow(
  script: Userscript,
  scriptsMap: Userscripts,
  sourceCode: string
): string[] {
  const moduleNames = getSharedImportModuleNames(sourceCode);

  if (moduleNames.length === 0) {
    return [];
  }

  const sharedByModuleName = new Map<string, string>();

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

/**
 * True when shared/moduleName/sharedScripts changed enough that compiled JS
 * must be rebuilt even if the TypeScript source buffer is unchanged.
 */
export function hasSharedJavascriptConfigChanged(
  nextScript: Userscript,
  previousScript?: Userscript
): boolean {
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
