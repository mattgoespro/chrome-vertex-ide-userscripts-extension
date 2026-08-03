import type { CompiledCodeEntry, Userscript } from "./model";

/**
 * Normalize a userscript entity after storage/IDE reads so optional fields are
 * always present for consumers.
 */
export function normalizeUserscript(script: Userscript): Userscript {
  return {
    ...script,
    typeDefinitions: script.typeDefinitions ?? "",
  };
}

/**
 * Overlay locally stored compiled artifacts onto a userscript entity.
 */
export function mergeCompiledCode(
  script: Userscript,
  compiled?: Pick<CompiledCodeEntry, "javascript" | "css"> | null
): Userscript {
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
 * Normalize + merge compiled artifacts (IDE/runtime hydrate path).
 */
export function hydrateUserscriptWithCompiled(
  script: Userscript,
  compiled?: Pick<CompiledCodeEntry, "javascript" | "css"> | null
): Userscript {
  return mergeCompiledCode(normalizeUserscript(script), compiled);
}

/**
 * Strip compiled payloads before writing to chrome.storage.sync (quota).
 */
export function toStorageSafeUserscript(script: Userscript): Userscript {
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
