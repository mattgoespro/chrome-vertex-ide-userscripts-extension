import { createAsyncThunk } from "@reduxjs/toolkit/react";
import { buildCompiledCodeEntry } from "@shared/compile-metadata";
import type { Userscript, UserscriptSourceLanguage } from "@shared/model";
import {
  hasSharedJavascriptConfigChanged,
  resolveSharedScriptIdsFromSourceOrThrow,
} from "@shared/resolve-shared-scripts";
import { isCompiledCodeBuildCurrent } from "@shared/compile-metadata";
import { ChromeSyncStorage, CompiledCodeStorage } from "@shared/storage";
import {
  mergeCompiledCode,
  normalizeUserscript,
  toStorageSafeUserscript,
} from "@shared/userscript-hydrate";
import { commitDraftForSave } from "../editor-drafts/actions";
import {
  buildScriptWithDraftSource,
  extractUserscriptMetadataUpdates,
  getDraftOrSavedSource,
} from "../editor-drafts/helpers";
import type { RootState } from "../../store";
import {
  compileAllOutputsOrThrow,
  compileJavascriptOrThrow,
  getBuildOptions,
} from "./compile-helpers";
import { sendApplyScriptsMessage } from "./messaging";

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
  const storageScript = toStorageSafeUserscript(normalizedScript);

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

    await ChromeSyncStorage.updateScript(id, toStorageSafeUserscript(script));

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

    await ChromeSyncStorage.updateScript(id, toStorageSafeUserscript(script));
    await CompiledCodeStorage.saveCompiledCode(id, compiledEntry);

    return script;
  }
);

/**
 * Single write path for persisting the open-document draft buffers to sync
 * storage (compile → storage → apply). Used by conflict keep-local and as the
 * canonical full-buffer save.
 */
export const saveUserscriptDraft = createAsyncThunk<
  { script: Userscript; appliedTabCount: number },
  string,
  { state: RootState }
>("userscripts/saveUserscriptDraft", async (scriptId, { getState, dispatch, requestId }) => {
  const state = getState();
  const draft = state.editorDrafts.drafts[scriptId];

  if (!draft) {
    throw new Error(`No editor draft found for script: ${scriptId}`);
  }

  const scriptsMap = await ChromeSyncStorage.getAllScripts();
  const script = normalizeUserscript(scriptsMap[scriptId]);

  if (!script) {
    throw new Error(`Userscript not found: ${scriptId}`);
  }

  script.code.source.typescript = draft.typescript;
  script.code.source.scss = draft.scss;
  script.typeDefinitions = draft.typeDefinitions;
  script.sharedScripts = resolveSharedScriptIdsFromSourceOrThrow(
    script,
    scriptsMap,
    draft.typescript
  );

  const compiledEntry = await compileAllOutputsOrThrow(script, state);

  script.code.compiled.javascript = compiledEntry.javascript;
  script.code.compiled.css = compiledEntry.css;
  script.status = "saved";
  script.updatedAt = Date.now();

  dispatch(
    commitDraftForSave({
      scriptId,
      buffer: "typescript",
      code: draft.typescript,
      saveRequestId: requestId,
    })
  );
  dispatch(
    commitDraftForSave({
      scriptId,
      buffer: "scss",
      code: draft.scss,
      saveRequestId: requestId,
    })
  );
  dispatch(
    commitDraftForSave({
      scriptId,
      buffer: "typeDefinitions",
      code: draft.typeDefinitions,
      saveRequestId: requestId,
    })
  );

  await ChromeSyncStorage.updateScript(
    scriptId,
    toStorageSafeUserscript(script)
  );
  await CompiledCodeStorage.saveCompiledCode(scriptId, compiledEntry);
  const applyResult = await sendApplyScriptsMessage([scriptId]);

  return {
    script: mergeCompiledCode(script, compiledEntry),
    appliedTabCount: applyResult.appliedTabCount,
  };
});
