import {
  buildCompiledCodeEntry,
  buildUserscriptJavascript,
  buildUserscriptStylesheet,
  getCompiledOutputBuildOptions,
  isCompiledCodeBuildCurrent,
} from "@/sandbox/compiler";
import { createAsyncThunk } from "@reduxjs/toolkit/react";
import {
  CompiledCodeEntry,
  Userscript,
  UserscriptSourceLanguage,
  getScriptModulePath,
} from "@shared/model";
import type { RuntimePortMessageEvent } from "@shared/messages";
import { getSharedImportModuleNames } from "@shared/shared-module-imports";
import { ChromeSyncStorage, CompiledCodeStorage } from "@shared/storage";
import { RootState } from "../../store";
import { uuid } from "@/shared/utils";
import { commitDraftForSave } from "../editor-drafts/actions";
import {
  buildScriptWithDraftSource,
  extractUserscriptMetadataUpdates,
  getDraftOrSavedSource,
} from "../editor-drafts/helpers";
import {
  buildStorageSafeScript,
  hasSharedJavascriptConfigChanged,
  normalizeUserscript,
  resolveSharedScriptIdsFromSourceOrThrow,
} from "./shared-script-resolution";
import { UserscriptsTransferFile } from "./transfer.userscripts";
import { DefaultNewUserscriptName } from "./state.userscripts";

function getBuildOptions(state: RootState) {
  return getCompiledOutputBuildOptions(state.settings.editorSettings);
}

async function compileJavascriptOrThrow(
  script: Userscript,
  state: RootState
): Promise<string> {
  const result = await buildUserscriptJavascript(
    script,
    script.code.source.typescript,
    getBuildOptions(state)
  );

  if (!result.success) {
    throw new Error(
      `TypeScript compilation error: ${result.error?.message ?? "Unknown error"}`
    );
  }

  return result.code ?? "";
}

async function compileStylesheetOrThrow(
  script: Userscript,
  state: RootState
): Promise<string> {
  const result = await buildUserscriptStylesheet(
    script.code.source.scss,
    getBuildOptions(state)
  );

  if (!result.success) {
    throw new Error(
      `SCSS compilation error: ${result.error?.message ?? "Unknown error"}`
    );
  }

  return result.code ?? "";
}

async function compileAllOutputsOrThrow(
  script: Userscript,
  state: RootState
): Promise<CompiledCodeEntry> {
  const [javascript, css] = await Promise.all([
    compileJavascriptOrThrow(script, state),
    compileStylesheetOrThrow(script, state),
  ]);

  return buildCompiledCodeEntry(javascript, css, getBuildOptions(state));
}

function mergeCompiledCode(
  script: Userscript,
  compiled?: CompiledCodeEntry | null
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

function sendRefreshTabsMessage() {
  const message: RuntimePortMessageEvent<"refreshTabs"> = {
    source: "options",
    type: "refreshTabs",
  };

  chrome.runtime.sendMessage(message).catch((error) => {
    console.warn("Failed to send refreshTabs message:", error);
  });
}

export const loadUserscripts = createAsyncThunk(
  "userscripts/loadUserscripts",
  async () => {
    const [scriptsMap, compiledCodeMap] = await Promise.all([
      ChromeSyncStorage.getAllScripts(),
      CompiledCodeStorage.getAllCompiledCode(),
    ]);

    return Object.values(scriptsMap).map((script) =>
      mergeCompiledCode(normalizeUserscript(script), compiledCodeMap[script.id])
    );
  }
);

export const createUserscript = createAsyncThunk(
  "userscripts/createUserscript",
  async () => {
    const timestamp = Date.now();
    const id = uuid();
    const script: Userscript = {
      id,
      name: DefaultNewUserscriptName,
      enabled: false,
      status: "modified",
      shared: false,
      moduleName: id,
      sharedScripts: [],
      globalModules: [],
      typeDefinitions: "",
      code: {
        source: {
          typescript: "// Your code here",
          scss: "/* Your styles here */",
        },
        compiled: {
          javascript: "",
          css: "",
        },
      },
      urlPatterns: [],
      runAt: "beforePageLoad",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await ChromeSyncStorage.saveScript(script);
    await CompiledCodeStorage.saveCompiledCode(script.id, {
      javascript: "",
      css: "",
    });
    return script;
  }
);

export const deleteUserscript = createAsyncThunk(
  "userscripts/deleteUserscript",
  async (scriptId: string) => {
    await ChromeSyncStorage.deleteScript(scriptId);
    await CompiledCodeStorage.deleteCompiledCode(scriptId);
    return scriptId;
  }
);

export const toggleUserscript = createAsyncThunk(
  "userscripts/toggleUserscript",
  async (scriptId: string) => {
    const scriptsMap = await ChromeSyncStorage.getAllScripts();
    const script = normalizeUserscript(scriptsMap[scriptId]);

    if (!script) {
      throw new Error(`Userscript not found: ${scriptId}`);
    }

    const updatedScript: Userscript = {
      ...script,
      enabled: !script.enabled,
    };

    // Save storage-safe version without compiled code to preserve quota
    const storageScript: Userscript = {
      ...updatedScript,
      code: {
        source: updatedScript.code.source,
        compiled: {
          javascript: "",
          css: "",
        },
      },
    };

    await ChromeSyncStorage.saveScript(storageScript);
    // Return full version with compiled code for Redux state
    return updatedScript;
  }
);

export const updateUserscript = createAsyncThunk<
  Userscript,
  { id: string; updates: Partial<Userscript> },
  { state: RootState }
>("userscripts/updateUserscript", async ({ id, updates }, { getState }) => {
  const state = getState();
  const previousScriptsMap = await ChromeSyncStorage.getAllScripts();
  const storedEntry = previousScriptsMap[id];

  if (!storedEntry) {
    throw new Error(`Userscript not found: ${id}`);
  }

  const storedScript = normalizeUserscript(storedEntry);

  const metadataUpdates = extractUserscriptMetadataUpdates(updates);
  const draftSource = getDraftOrSavedSource(state, id);
  const normalizedScript = buildScriptWithDraftSource(
    {
      ...storedScript,
      ...metadataUpdates,
      updatedAt: Date.now(),
    },
    draftSource
  );

  const previousScript = previousScriptsMap[normalizedScript.id]
    ? normalizeUserscript(previousScriptsMap[normalizedScript.id])
    : undefined;
  const compiledEntry = await CompiledCodeStorage.getCompiledCode(
    normalizedScript.id
  );
  const storageScript = buildStorageSafeScript(normalizedScript);

  if (!isCompiledCodeBuildCurrent(compiledEntry, getBuildOptions(state))) {
    const rebuiltEntry = await compileAllOutputsOrThrow(
      normalizedScript,
      state
    );

    normalizedScript.code.compiled.javascript = rebuiltEntry.javascript;
    normalizedScript.code.compiled.css = rebuiltEntry.css;

    await CompiledCodeStorage.saveCompiledCode(
      normalizedScript.id,
      rebuiltEntry
    );
  } else if (
    hasSharedJavascriptConfigChanged(normalizedScript, previousScript)
  ) {
    const javascript = await compileJavascriptOrThrow(normalizedScript, state);
    const css = compiledEntry?.css ?? normalizedScript.code.compiled.css;
    const rebuiltEntry = buildCompiledCodeEntry(
      javascript,
      css,
      getBuildOptions(state)
    );

    normalizedScript.code.compiled.javascript = javascript;
    normalizedScript.code.compiled.css = css;

    await CompiledCodeStorage.saveCompiledCode(
      normalizedScript.id,
      rebuiltEntry
    );
  }

  await ChromeSyncStorage.updateScript(normalizedScript.id, {
    ...storageScript,
    code: {
      source: storedScript.code.source,
      compiled: {
        javascript: "",
        css: "",
      },
    },
    typeDefinitions: storedScript.typeDefinitions,
  });

  return normalizedScript;
});

export const updateUserscriptTypeDefinitions = createAsyncThunk(
  "userscripts/updateUserscriptTypeDefinitions",
  async (
    { id, typeDefinitions }: { id: string; typeDefinitions: string },
    { dispatch, requestId }
  ) => {
    const scriptsMap = await ChromeSyncStorage.getAllScripts();
    const script = normalizeUserscript(scriptsMap[id]);

    script.typeDefinitions = typeDefinitions;
    script.status = "saved";
    script.updatedAt = Date.now();

    // Commit before the sync write so the same-tab storage echo does not treat
    // this save as a remote conflict against a still-dirty draft.
    dispatch(
      commitDraftForSave({
        scriptId: id,
        buffer: "typeDefinitions",
        code: typeDefinitions,
        saveRequestId: requestId,
      })
    );

    await ChromeSyncStorage.updateScript(id, buildStorageSafeScript(script));

    return script;
  }
);

export const updateUserscriptCode = createAsyncThunk<
  Userscript,
  {
    id: string;
    language: UserscriptSourceLanguage;
    code: string;
  },
  { state: RootState }
>(
  "userscripts/updateUserscriptCode",
  async ({ id, language, code }, { getState, dispatch, requestId }) => {
    const scriptsMap = await ChromeSyncStorage.getAllScripts();
    const script = normalizeUserscript(scriptsMap[id]);

    if (language === "typescript") {
      script.code.source.typescript = code;
      script.sharedScripts = resolveSharedScriptIdsFromSourceOrThrow(
        script,
        scriptsMap,
        code
      );
    } else if (language === "scss") {
      script.code.source.scss = code;
    }

    const compiledEntry = await compileAllOutputsOrThrow(script, getState());

    script.code.compiled.javascript = compiledEntry.javascript;
    script.code.compiled.css = compiledEntry.css;

    script.status = "saved";
    script.updatedAt = Date.now();

    // Commit immediately before the sync write. Doing this earlier (e.g. before
    // compile) would leave the draft clean if compilation fails; doing it after
    // the write allows the same-tab onChanged echo to race a dirty draft.
    dispatch(
      commitDraftForSave({
        scriptId: id,
        buffer: language === "typescript" ? "typescript" : "scss",
        code,
        saveRequestId: requestId,
      })
    );

    await ChromeSyncStorage.updateScript(id, buildStorageSafeScript(script));
    await CompiledCodeStorage.saveCompiledCode(id, compiledEntry);

    return script;
  }
);

/**
 * Rebuilds compiled userscript code when local artifacts are missing, outdated,
 * or when the caller explicitly requests a full rebuild.
 */
export const rebuildCompiledUserscripts = createAsyncThunk<
  Userscript[],
  { scope?: "stale" | "all" } | undefined,
  { state: RootState }
>("userscripts/rebuildCompiledUserscripts", async (args, { getState }) => {
  const [scriptsMap, compiledCodeMap] = await Promise.all([
    ChromeSyncStorage.getAllScripts(),
    CompiledCodeStorage.getAllCompiledCode(),
  ]);
  const scope = args?.scope ?? "stale";
  const state = getState();
  const buildOptions = getBuildOptions(state);
  const scripts = Object.values(scriptsMap).map(normalizeUserscript);
  const scriptsToRebuild = scripts.filter((script) => {
    if (scope === "all") {
      return true;
    }

    return !isCompiledCodeBuildCurrent(
      compiledCodeMap[script.id],
      buildOptions
    );
  });

  if (scriptsToRebuild.length === 0) {
    return [];
  }

  const rebuiltScripts: Userscript[] = [];

  for (const script of scriptsToRebuild) {
    const compiledEntry = await compileAllOutputsOrThrow(script, state);
    const updatedScript = mergeCompiledCode(script, compiledEntry);

    await CompiledCodeStorage.saveCompiledCode(script.id, compiledEntry);
    rebuiltScripts.push(updatedScript);
  }

  sendRefreshTabsMessage();

  return rebuiltScripts;
});

export const importUserscripts = createAsyncThunk<
  Userscript[],
  UserscriptsTransferFile,
  { state: RootState }
>("userscripts/importUserscripts", async (file, { getState }) => {
  const state = getState();
  const existingScriptsMap = await ChromeSyncStorage.getAllScripts();
  const globalModules = state.modules.modules;
  const timestampBase = Date.now();
  const existingSharedByModuleName = new Map(
    Object.values(existingScriptsMap)
      .map(normalizeUserscript)
      .filter((script) => script.shared)
      .map((script) => [getScriptModulePath(script), script.id])
  );

  const importedScripts = file.userscripts.map((entry, index) => {
    const moduleName = entry.moduleName.trim();

    return {
      id: uuid(),
      name: entry.name,
      enabled: entry.enabled,
      status: "saved",
      shared: moduleName.length > 0,
      moduleName,
      sharedScripts: [] as string[],
      globalModules: entry.globalModuleImports.filter(
        (moduleId) => globalModules[moduleId] != null
      ),
      typeDefinitions: entry.sources["typescript-declarations"],
      code: {
        source: {
          typescript: entry.sources.typescript,
          scss: entry.sources.scss,
        },
        compiled: {
          javascript: "",
          css: "",
        },
      },
      urlPatterns: [...entry.urlPatterns],
      runAt: entry.runAt,
      createdAt: timestampBase + index,
      updatedAt: timestampBase + index,
    } satisfies Userscript;
  });

  const importedSharedByModuleName = new Map(
    importedScripts
      .filter((script) => script.shared)
      .map((script) => [getScriptModulePath(script), script.id])
  );

  for (const [index, entry] of file.userscripts.entries()) {
    const sharedImports = getSharedImportModuleNames(entry.sources.typescript);
    const resolvedImports =
      sharedImports.length > 0 ? sharedImports : entry.sharedImports;

    importedScripts[index].sharedScripts = resolvedImports.map((moduleName) => {
      const trimmedModuleName = moduleName.trim();
      const sharedScriptId =
        importedSharedByModuleName.get(trimmedModuleName) ??
        existingSharedByModuleName.get(trimmedModuleName);

      if (!sharedScriptId) {
        throw new Error(
          `Script \"${entry.name}\" references unknown shared module \"${trimmedModuleName}\".`
        );
      }

      return sharedScriptId;
    });
  }

  const compiledEntries = await Promise.all(
    importedScripts.map((script) => compileAllOutputsOrThrow(script, state))
  );

  await Promise.all(
    importedScripts.map(async (script, index) => {
      const compiledEntry = compiledEntries[index];

      script.code.compiled.javascript = compiledEntry.javascript;
      script.code.compiled.css = compiledEntry.css;

      await Promise.all([
        ChromeSyncStorage.saveScript(buildStorageSafeScript(script)),
        CompiledCodeStorage.saveCompiledCode(script.id, compiledEntry),
      ]);
    })
  );

  sendRefreshTabsMessage();

  return importedScripts;
});
