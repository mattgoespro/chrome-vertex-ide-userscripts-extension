import { createAsyncThunk } from "@reduxjs/toolkit/react";
import { Userscript } from "@shared/model";
import { ChromeSyncStorage, CompiledCodeStorage } from "@shared/storage";
import type { RootState } from "../../store";
import { decideStorageSyncAction } from "./storage-sync-decision";
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

function parseUserscriptIdFromKey(key: string): string | null {
  const prefix = "userscript:";

  if (!key.startsWith(prefix)) {
    return null;
  }

  const remainder = key.slice(prefix.length);
  const chunkIndex = remainder.indexOf(":chunk:");

  if (chunkIndex === -1) {
    return remainder;
  }

  return remainder.slice(0, chunkIndex);
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
      const hydrated = remoteScript
        ? mergeCompiledCode(
            normalizeUserscript(remoteScript),
            compiledCodeMap[scriptId]
          )
        : undefined;

      const decision = decideStorageSyncAction(
        scriptId,
        localDraft,
        hydrated
      );

      switch (decision.action) {
        case "keep-dirty-orphan":
          break;
        case "remove":
          dispatch(removeDraft(scriptId));
          break;
        case "conflict":
          dispatch(enqueueConflict(decision.conflict));
          conflictIds.push(scriptId);
          break;
        case "sync":
          dispatch(syncDraftFromRemoteScript(decision.script));
          syncedScripts.push(decision.script);
          break;
      }
    }

    return { syncedScripts, conflictIds };
  }
);

export function getAffectedScriptIdsFromStorageChanges(
  changes: Record<string, chrome.storage.StorageChange>
): string[] {
  const scriptIds = new Set<string>();

  for (const key of Object.keys(changes)) {
    const scriptId = parseUserscriptIdFromKey(key);

    if (scriptId) {
      scriptIds.add(scriptId);
    }
  }

  return [...scriptIds];
}
