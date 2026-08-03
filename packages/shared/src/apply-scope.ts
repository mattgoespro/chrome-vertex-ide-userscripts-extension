import type { Userscripts } from "./model";

/**
 * Expand a set of script IDs to include consumers that import any of them
 * as shared dependencies. Used so saving/rebuilding a shared module also
 * re-applies scripts that depend on it.
 */
export function expandAffectedScriptIds(
  scriptIds: string[],
  scriptsMap: Userscripts
): string[] {
  const seed = new Set(
    scriptIds.filter((scriptId) => scriptsMap[scriptId] != null)
  );
  const affected = new Set(seed);

  for (const script of Object.values(scriptsMap)) {
    if (script.sharedScripts?.some((sharedId) => seed.has(sharedId))) {
      affected.add(script.id);
    }
  }

  return Array.from(affected);
}
