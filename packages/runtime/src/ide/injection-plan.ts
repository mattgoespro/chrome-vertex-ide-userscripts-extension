import {
  CompiledCodeEntry,
  GlobalModules,
  Userscript,
  Userscripts,
} from "@shared/model";
import { matchesUrlPattern } from "@shared/url-matching";

/**
 * Selects enabled userscripts that match the tab URL and requested run timing.
 * Matching happens before compiled-code merge so disabled/unmatched scripts are
 * not hydrated from local storage.
 */
export function selectMatchingScriptsForInjection(
  scriptsMap: Userscripts,
  url: string,
  timing: Userscript["runAt"]
): Userscript[] {
  return Object.values(scriptsMap).filter(
    (script) =>
      script.enabled &&
      script.runAt === timing &&
      matchesUrlPattern(url, script.urlPatterns)
  );
}

/**
 * Collects script IDs whose compiled payloads must be loaded for injection,
 * including shared-script dependencies referenced by matching userscripts.
 */
export function collectCompiledCodeScriptIds(
  matchingScripts: Userscript[]
): string[] {
  const scriptIdsToFetch = new Set<string>(matchingScripts.map((s) => s.id));

  for (const script of matchingScripts) {
    if (script.sharedScripts?.length > 0) {
      for (const sharedId of script.sharedScripts) {
        scriptIdsToFetch.add(sharedId);
      }
    }
  }

  return Array.from(scriptIdsToFetch);
}

/**
 * Overlays locally cached compiled JS/CSS onto a userscript manifest entry.
 * Missing compiled entries leave the script unchanged.
 */
export function mergeCompiledCode(
  script: Userscript,
  compiledCodeMap: Record<string, CompiledCodeEntry>
): Userscript {
  const compiled = compiledCodeMap[script.id];

  if (!compiled) {
    return script;
  }

  return {
    ...script,
    code: {
      ...script.code,
      compiled: {
        javascript: compiled.javascript || script.code.compiled.javascript,
        css: compiled.css || script.code.compiled.css,
      },
    },
  };
}

/**
 * Returns enabled CDN module IDs in first-seen injection order across the
 * matching userscripts. Disabled or missing modules are skipped.
 */
export function collectEnabledCdnModuleIds(
  scripts: Userscript[],
  modulesMap: GlobalModules
): string[] {
  const injectedModules = new Set<string>();
  const ordered: string[] = [];

  for (const script of scripts) {
    if (!script.globalModules?.length) {
      continue;
    }

    for (const moduleId of script.globalModules) {
      if (injectedModules.has(moduleId)) {
        continue;
      }

      const module = modulesMap[moduleId];

      if (module?.enabled) {
        ordered.push(moduleId);
        injectedModules.add(moduleId);
      }
    }
  }

  return ordered;
}

/**
 * Returns shared-script IDs to inject (deduplicated, first-seen order) for the
 * matching userscripts. Only entries marked `shared` are included.
 */
export function collectSharedScriptIdsToInject(
  matchingScripts: Userscript[],
  scriptsMap: Userscripts
): string[] {
  const injectedShared = new Set<string>();
  const ordered: string[] = [];

  for (const script of matchingScripts) {
    if (!script.sharedScripts?.length) {
      continue;
    }

    for (const sharedId of script.sharedScripts) {
      if (injectedShared.has(sharedId)) {
        continue;
      }

      const shared = scriptsMap[sharedId];

      if (shared?.shared) {
        ordered.push(sharedId);
        injectedShared.add(sharedId);
      }
    }
  }

  return ordered;
}
