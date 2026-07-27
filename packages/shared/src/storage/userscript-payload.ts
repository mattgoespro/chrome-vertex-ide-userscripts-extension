import { Userscript } from "../model";

/**
 * Sparse sync-storage representation of a userscript. Optional fields are
 * omitted when they match storage defaults so Chrome sync quotas stay small.
 */
export type StoredUserscriptPayload = {
  name: string;
  enabled?: true;
  status?: Userscript["status"];
  error?: true;
  shared?: true;
  moduleName?: string;
  sharedScripts?: string[];
  globalModules?: string[];
  typeDefinitions?: string;
  code?: {
    source?: {
      typescript?: string;
      scss?: string;
    };
    compiled?: {
      javascript?: string;
      css?: string;
    };
  };
  urlPatterns?: string[];
  runAt?: Userscript["runAt"];
  createdAt: number;
  updatedAt: number;
};

/**
 * Serialize a userscript for Chrome sync storage, omitting default-valued
 * fields (disabled, empty sources, beforePageLoad, etc.).
 */
export function serializeUserscript(script: Userscript): StoredUserscriptPayload {
  const payload: StoredUserscriptPayload = {
    name: script.name,
    createdAt: script.createdAt,
    updatedAt: script.updatedAt,
  };

  if (script.enabled) {
    payload.enabled = true;
  }

  if (script.status === "modified") {
    payload.status = script.status;
  }

  if (script.error) {
    payload.error = true;
  }

  if (script.shared) {
    payload.shared = true;
  }

  if (script.moduleName.trim().length > 0) {
    payload.moduleName = script.moduleName;
  }

  if (script.sharedScripts.length > 0) {
    payload.sharedScripts = [...script.sharedScripts];
  }

  if (script.globalModules.length > 0) {
    payload.globalModules = [...script.globalModules];
  }

  if (script.typeDefinitions.length > 0) {
    payload.typeDefinitions = script.typeDefinitions;
  }

  const typescriptSource = script.code.source.typescript;
  const scssSource = script.code.source.scss;

  if (typescriptSource.length > 0 || scssSource.length > 0) {
    payload.code = {
      source: {
        ...(typescriptSource.length > 0
          ? { typescript: typescriptSource }
          : {}),
        ...(scssSource.length > 0 ? { scss: scssSource } : {}),
      },
    };
  }

  if (script.urlPatterns.length > 0) {
    payload.urlPatterns = [...script.urlPatterns];
  }

  if (script.runAt === "afterPageLoad") {
    payload.runAt = script.runAt;
  }

  return payload;
}

/**
 * Hydrate a userscript from a sparse stored payload, applying storage defaults
 * for omitted fields. `now` is injectable so missing timestamps stay deterministic in tests.
 */
export function hydrateUserscript(
  scriptId: string,
  payload: Partial<Userscript> | StoredUserscriptPayload,
  now: number = Date.now()
): Userscript {
  return {
    id: scriptId,
    name: payload.name ?? "Untitled Script",
    enabled: payload.enabled ?? false,
    status: payload.status ?? "saved",
    error: payload.error,
    shared: payload.shared ?? false,
    moduleName: payload.moduleName ?? "",
    sharedScripts: payload.sharedScripts ?? [],
    globalModules: payload.globalModules ?? [],
    typeDefinitions: payload.typeDefinitions ?? "",
    code: {
      source: {
        typescript: payload.code?.source?.typescript ?? "",
        scss: payload.code?.source?.scss ?? "",
      },
      compiled: {
        javascript: payload.code?.compiled?.javascript ?? "",
        css: payload.code?.compiled?.css ?? "",
      },
    },
    urlPatterns: payload.urlPatterns ?? [],
    runAt: payload.runAt ?? "beforePageLoad",
    createdAt: payload.createdAt ?? now,
    updatedAt: payload.updatedAt ?? payload.createdAt ?? now,
  };
}
