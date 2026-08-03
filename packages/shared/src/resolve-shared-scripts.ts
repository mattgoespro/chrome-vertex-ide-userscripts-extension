import { getScriptModulePath, type Userscript } from "./model";
import { getSharedImportModuleNames } from "./shared-module-imports";
import { normalizeUserscript } from "./userscript-hydrate";

/**
 * Resolve `scripts/<module>/main` imports in source to shared script IDs.
 */
export function resolveSharedScriptIdsFromSourceOrThrow(
  script: Userscript,
  scriptsMap: Record<string, Userscript>,
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
