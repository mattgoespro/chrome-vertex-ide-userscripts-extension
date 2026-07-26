import { createAsyncThunk } from "@reduxjs/toolkit/react";
import { Userscript } from "@shared/model";
import { ChromeSyncStorage, CompiledCodeStorage } from "@shared/storage";
import type { RootState } from "../../store";
import { detectDraftConflict } from "./helpers";
import { isDraftDirty } from "./state.editor-drafts";
import {
  enqueueConflict,
  removeDraft,
  syncDraftFromRemoteScript,
} from "./index";

function normalizeUserscript(script: Userscript): Userscript {
  return {
    ...script,
    typeDefinitions: script.typeDefinitions ?? "",
  };
}

function mergeCompiledCode(
  script: Userscript,
  compiled?: { javascript: string; css: string } | null
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

export const refreshScriptsFromStorage = createAsyncThunk<
  { syncedScripts: Userscript[]; conflictIds: string[] },
  { scriptIds?: string[] } | undefined,
  { state: RootState }
>(
  "editorDrafts/refreshScriptsFromStorage",
  async (args, { getState, dispatch }) => {
    const [scriptsMap, compiledCodeMap] = await Promise.all([
      ChromeSyncStorage.getAllScripts(),
      CompiledCodeStorage.getAllCompiledCode(),
    ]);

    // Re-read after awaits so an in-flight local save can clear dirty flags
    // before we decide whether a storage echo is a real conflict.
    const state = getState();
    const targetIds = args?.scriptIds ?? [
      ...new Set([
        ...Object.keys(state.editorDrafts.drafts),
        ...Object.keys(scriptsMap),
      ]),
    ];

    const syncedScripts: Userscript[] = [];
    const conflictIds: string[] = [];

    for (const scriptId of targetIds) {
      const remoteScript = scriptsMap[scriptId];
      const localDraft = getState().editorDrafts.drafts[scriptId];

      if (!remoteScript) {
        if (localDraft && isDraftDirty(localDraft)) {
          continue;
        }

        dispatch(removeDraft(scriptId));
        continue;
      }

      const hydrated = mergeCompiledCode(
        normalizeUserscript(remoteScript),
        compiledCodeMap[scriptId]
      );

      if (!localDraft) {
        dispatch(syncDraftFromRemoteScript(hydrated));
        syncedScripts.push(hydrated);
        continue;
      }

      const conflict = detectDraftConflict(scriptId, localDraft, hydrated);

      if (conflict) {
        dispatch(enqueueConflict(conflict));
        conflictIds.push(scriptId);
        continue;
      }

      dispatch(syncDraftFromRemoteScript(hydrated));
      syncedScripts.push(hydrated);
    }

    return { syncedScripts, conflictIds };
  }
);
