import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Userscript } from "@shared/model";
import { setCurrentUserscript } from "../userscripts";
import {
  createUserscript,
  deleteUserscript,
  importUserscripts,
  loadUserscripts,
  saveUserscriptDraft,
  updateUserscriptCode,
  updateUserscriptTypeDefinitions,
} from "../userscripts/thunks.userscripts";
import { saveEditorCode } from "../code-editor/thunks.code-editor";
import { commitDraftForSave } from "./actions";
import {
  applyCommitDraftForSave,
  applyFlushModelToDraft,
  applyMarkDraftClean,
  applyRemoteScriptAndClearConflict,
  applyResolveAllConflictsTakeRemote,
  applyResolveConflictKeepLocal,
  applyResolveConflictTakeRemote,
  applySaveRejectionDirtyRestore,
  applySuccessfulCodeSave,
  applyUpdateDraftBuffer,
} from "./editor-drafts-transitions";
import {
  bumpDraftRevision,
  draftBufferForCodeLanguage,
  draftFromScript,
  DraftBuffer,
  EditorDraft,
  initialState,
  isDraftDirty,
  RemoteDraftConflict,
} from "./state.editor-drafts";

function ensureDraftFromScript(
  state: typeof initialState,
  script: Userscript
): EditorDraft {
  const existing = state.drafts[script.id];

  if (existing) {
    return existing;
  }

  const created = draftFromScript(script);
  state.drafts[script.id] = created;
  return created;
}

function pruneCleanDrafts(
  state: typeof initialState,
  keepScriptIds: Iterable<string>
) {
  const keep = new Set(keepScriptIds);

  for (const scriptId of Object.keys(state.drafts)) {
    if (keep.has(scriptId)) {
      continue;
    }

    if (!isDraftDirty(state.drafts[scriptId])) {
      delete state.drafts[scriptId];
    }
  }
}

const editorDraftsSlice = createSlice({
  name: "editorDrafts",
  initialState,
  reducers: {
    /**
     * Ensure an open-document draft exists for a script (lazy create).
     */
    ensureDraft: {
      prepare: (script: Userscript) => ({ payload: script }),
      reducer: (state, action: PayloadAction<Userscript>) => {
        ensureDraftFromScript(state, action.payload);
      },
    },
    updateDraftBuffer: {
      prepare: (args: {
        scriptId: string;
        buffer: DraftBuffer;
        code: string;
      }) => ({ payload: args }),
      reducer: (
        state,
        action: PayloadAction<{
          scriptId: string;
          buffer: DraftBuffer;
          code: string;
        }>
      ) => {
        const { scriptId, buffer, code } = action.payload;
        const draft = state.drafts[scriptId];

        if (!draft) {
          return;
        }

        applyUpdateDraftBuffer(draft, buffer, code);
      },
    },
    markDraftClean: {
      prepare: (args: { scriptId: string; buffer: DraftBuffer }) => ({
        payload: args,
      }),
      reducer: (
        state,
        action: PayloadAction<{ scriptId: string; buffer: DraftBuffer }>
      ) => {
        const { scriptId, buffer } = action.payload;
        const draft = state.drafts[scriptId];

        if (!draft) {
          return;
        }

        applyMarkDraftClean(draft, buffer);
      },
    },
    applyRemoteScript: {
      prepare: (script: Userscript) => ({ payload: script }),
      reducer: (state, action: PayloadAction<Userscript>) => {
        applyRemoteScriptAndClearConflict(state, action.payload);
      },
    },
    syncDraftFromRemoteScript: {
      prepare: (script: Userscript) => ({ payload: script }),
      reducer: (state, action: PayloadAction<Userscript>) => {
        const script = action.payload;
        const existing = state.drafts[script.id];

        // Only refresh drafts that already exist (open / dirty). Untouched
        // scripts stay draft-less until opened.
        if (!existing) {
          return;
        }

        state.drafts[script.id] = bumpDraftRevision(existing, script);
      },
    },
    removeDraft: {
      prepare: (scriptId: string) => ({ payload: scriptId }),
      reducer: (state, action: PayloadAction<string>) => {
        delete state.drafts[action.payload];
        delete state.pendingConflicts[action.payload];
      },
    },
    enqueueConflict: {
      prepare: (conflict: RemoteDraftConflict) => ({ payload: conflict }),
      reducer: (state, action: PayloadAction<RemoteDraftConflict>) => {
        state.pendingConflicts[action.payload.scriptId] = action.payload;
      },
    },
    resolveConflictKeepLocal: {
      prepare: (scriptId: string) => ({ payload: scriptId }),
      reducer: (state, action: PayloadAction<string>) => {
        applyResolveConflictKeepLocal(state.pendingConflicts, action.payload);
      },
    },
    resolveAllConflictsKeepLocal: (state) => {
      state.pendingConflicts = {};
    },
    resolveConflictTakeRemote: {
      prepare: (script: Userscript) => ({ payload: script }),
      reducer: (state, action: PayloadAction<Userscript>) => {
        applyResolveConflictTakeRemote(state, action.payload);
      },
    },
    resolveAllConflictsTakeRemote: {
      prepare: (scripts: Userscript[]) => ({ payload: scripts }),
      reducer: (state, action: PayloadAction<Userscript[]>) => {
        applyResolveAllConflictsTakeRemote(state, action.payload);
      },
    },
    flushModelToDraft: {
      prepare: (args: {
        scriptId: string;
        buffer: DraftBuffer;
        code: string;
      }) => ({ payload: args }),
      reducer: (
        state,
        action: PayloadAction<{
          scriptId: string;
          buffer: DraftBuffer;
          code: string;
        }>
      ) => {
        const { scriptId, buffer, code } = action.payload;
        const draft = state.drafts[scriptId];

        if (!draft) {
          return;
        }

        applyFlushModelToDraft(draft, buffer, code);
      },
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(commitDraftForSave, (state, action) => {
        const { scriptId, buffer, code, saveRequestId } = action.payload;
        const draft = state.drafts[scriptId];

        if (!draft) {
          return;
        }

        applyCommitDraftForSave(draft, buffer, code, saveRequestId);
      })
      .addCase(setCurrentUserscript, (state, action) => {
        // Draft ensure for the newly selected script happens in the listener
        // (needs the userscripts entity). Here we only prune clean offscreen
        // drafts so the map stays open-document sized.
        pruneCleanDrafts(state, [
          action.payload.id,
          ...Object.keys(state.drafts).filter((scriptId) =>
            isDraftDirty(state.drafts[scriptId])
          ),
        ]);
      })
      .addCase(loadUserscripts.fulfilled, (state, action) => {
        // Keep only dirty drafts across reload of the entity map; clean drafts
        // are recreated lazily when a script is opened.
        const validIds = new Set(action.payload.map((script) => script.id));
        const nextDrafts: Record<string, EditorDraft> = {};

        for (const [scriptId, draft] of Object.entries(state.drafts)) {
          if (validIds.has(scriptId) && isDraftDirty(draft)) {
            nextDrafts[scriptId] = draft;
          }
        }

        state.drafts = nextDrafts;
      })
      .addCase(createUserscript.fulfilled, (state, action) => {
        state.drafts[action.payload.id] = draftFromScript(action.payload);
      })
      .addCase(deleteUserscript.fulfilled, (state, action) => {
        delete state.drafts[action.payload];
        delete state.pendingConflicts[action.payload];
      })
      .addCase(importUserscripts.fulfilled, (state, action) => {
        for (const script of action.payload) {
          state.drafts[script.id] = draftFromScript(script);
        }
      })
      .addCase(updateUserscriptCode.fulfilled, (state, action) => {
        const script = action.payload;
        const draft = state.drafts[script.id];

        if (!draft) {
          return;
        }

        draft.typescript = script.code.source.typescript;
        draft.scss = script.code.source.scss;
        draft.dirty.typescript = false;
        draft.dirty.scss = false;
        draft.revision += 1;
      })
      .addCase(updateUserscriptTypeDefinitions.fulfilled, (state, action) => {
        const script = action.payload;
        const draft = state.drafts[script.id];

        if (!draft) {
          return;
        }

        draft.typeDefinitions = script.typeDefinitions ?? "";
        draft.dirty.typeDefinitions = false;
        draft.revision += 1;
      })
      .addCase(saveUserscriptDraft.fulfilled, (state, action) => {
        const script = action.payload.script;
        const draft = state.drafts[script.id];

        if (!draft) {
          state.drafts[script.id] = draftFromScript(script);
          return;
        }

        draft.typescript = script.code.source.typescript;
        draft.scss = script.code.source.scss;
        draft.typeDefinitions = script.typeDefinitions ?? "";
        draft.dirty.typescript = false;
        draft.dirty.scss = false;
        draft.dirty.typeDefinitions = false;
        draft.revision += 1;
        delete state.pendingConflicts[script.id];
      })
      .addCase(saveEditorCode.fulfilled, (state, action) => {
        const { scriptId, language } = action.meta.arg;
        const draft = state.drafts[scriptId];

        if (!draft) {
          return;
        }

        const buffer = draftBufferForCodeLanguage(language);

        applySuccessfulCodeSave(draft, buffer, action.payload.code);
      })
      // commitDraftForSave runs before the sync write so same-tab storage echoes
      // do not false-positive; if the write fails, restore the dirty flag.
      // Ignore rejections from superseded in-flight saves so a stale failure
      // cannot mark the draft dirty after a newer save already committed.
      .addCase(updateUserscriptCode.rejected, (state, action) => {
        const { id, language } = action.meta.arg;
        const draft = state.drafts[id];

        if (!draft) {
          return;
        }

        const buffer: DraftBuffer =
          language === "typescript" ? "typescript" : "scss";

        applySaveRejectionDirtyRestore(draft, buffer, action.meta.requestId);
      })
      .addCase(updateUserscriptTypeDefinitions.rejected, (state, action) => {
        const draft = state.drafts[action.meta.arg.id];

        if (!draft) {
          return;
        }

        applySaveRejectionDirtyRestore(
          draft,
          "typeDefinitions",
          action.meta.requestId
        );
      });
  },
});

export const {
  ensureDraft,
  updateDraftBuffer,
  markDraftClean,
  applyRemoteScript,
  syncDraftFromRemoteScript,
  removeDraft,
  enqueueConflict,
  resolveConflictKeepLocal,
  resolveConflictTakeRemote,
  resolveAllConflictsKeepLocal,
  resolveAllConflictsTakeRemote,
  flushModelToDraft,
} = editorDraftsSlice.actions;

export { commitDraftForSave } from "./actions";

export {
  buildScriptWithDraftSource,
  detectDraftConflict,
  extractUserscriptMetadataUpdates,
  getDraftOrSavedSource,
} from "./helpers";

export {
  selectDraftBuffer,
  selectDraftForScript,
  selectDraftRevision,
  selectHasPendingConflicts,
  selectIsDraftBufferDirty,
  selectIsDraftDirty,
  selectPendingConflicts,
} from "./selectors";

export { isDraftDirty, draftFromScript };
export type { DraftBuffer, EditorDraft, RemoteDraftConflict };

export {
  draftBufferForCodeLanguage,
  shouldRestoreDirtyOnSaveRejection,
} from "./state.editor-drafts";

export {
  rebuildDraftsPreservingDirty,
  applyUpdateDraftBuffer,
  applyFlushModelToDraft,
  applyCommitDraftForSave,
  nextDraftFromRemoteScript,
} from "./editor-drafts-transitions";

export default editorDraftsSlice.reducer;
