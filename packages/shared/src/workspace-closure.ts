import type { Userscript, Userscripts } from "./model";
import { getScriptModulePath } from "./model";
import { getSharedImportModuleNames } from "./shared-module-imports";

export type WorkspaceClosureOptions = {
  /**
   * Optional source provider (e.g. draft buffer). Defaults to saved TypeScript.
   * Closure edges are always derived from imports in this source — persisted
   * `sharedScripts` is only a save-time cache for the service worker.
   */
  getTypescriptSource?: (script: Userscript) => string;
};

/**
 * Resolve the set of script IDs that should have Monaco models for IntelliSense:
 * the active script plus its transitive shared-dependency closure.
 *
 * Edges come from `scripts/<module>/main` imports in TypeScript source (draft
 * or saved). Persisted `sharedScripts` is ignored here so IntelliSense tracks
 * unsaved import edits.
 *
 * Order is dependency-first (post-order DFS) so workspace sync can upsert
 * shared modules before the consumer that imports them.
 */
export function resolveWorkspaceScriptClosure(
  currentScript: Userscript | null | undefined,
  scriptsMap: Userscripts,
  options?: WorkspaceClosureOptions
): string[] {
  if (!currentScript || !scriptsMap[currentScript.id]) {
    return [];
  }

  const getSource =
    options?.getTypescriptSource ??
    ((script: Userscript) => script.code.source.typescript);

  const sharedByModulePath = new Map<string, string>();

  for (const candidate of Object.values(scriptsMap)) {
    if (!candidate.shared) {
      continue;
    }

    sharedByModulePath.set(getScriptModulePath(candidate), candidate.id);
  }

  const seen = new Set<string>();
  const ordered: string[] = [];

  const visit = (scriptId: string) => {
    if (seen.has(scriptId)) {
      return;
    }

    const script = scriptsMap[scriptId];

    if (!script) {
      return;
    }

    seen.add(scriptId);

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

/**
 * IDs of every shared module script — kept in the Monaco workspace so switching
 * to an unrelated shared script does not dispose modules other consumers import.
 */
export function listSharedScriptIds(scriptsMap: Userscripts): string[] {
  return Object.values(scriptsMap)
    .filter((script) => script.shared)
    .map((script) => script.id);
}
