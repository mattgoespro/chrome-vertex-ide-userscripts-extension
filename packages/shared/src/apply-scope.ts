import type { Userscripts } from "./model";

/**
 * Expand a set of script IDs to include consumers that import any of them
 * as shared dependencies (fixpoint / BFS). Used so saving/rebuilding a shared
 * module also re-applies scripts that depend on it, including nested consumers.
 */
export function expandAffectedScriptIds(
  scriptIds: string[],
  scriptsMap: Userscripts
): string[] {
  const affected = new Set(
    scriptIds.filter((scriptId) => scriptsMap[scriptId] != null)
  );

  let grew = true;

  while (grew) {
    grew = false;

    for (const script of Object.values(scriptsMap)) {
      if (affected.has(script.id)) {
        continue;
      }

      if (script.sharedScripts?.some((sharedId) => affected.has(sharedId))) {
        affected.add(script.id);
        grew = true;
      }
    }
  }

  return Array.from(affected);
}
