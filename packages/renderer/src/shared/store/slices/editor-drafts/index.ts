import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Userscript } from "@shared/model";
import type { RootState } from "../../store";
import {
  createUserscript,
  deleteUserscript,
  importUserscripts,
  loadUserscripts,
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
  applySyncDraftFromRemote,
  applyUpdateDraftBuffer,
  rebuildDraftsPreservingDirty,
} from "./editor-drafts-transitions";
import {
  draftBufferForCodeLanguage,
  draftFromScript,
  DraftBuffer,
  EditorDraft,
  initialState,
  isDraftDirty,
  RemoteDraftConflict,
  shouldRestoreDirtyOnSaveRejection,
} from "./state.editor-drafts";

const editorDraftsSlice = createSlice({
  name: "editorDrafts",
  initialState,
  reducers: {
    initDraftsFromScripts: {
      prepare: (scripts: Userscript[]) => ({ payload: scripts }),
      reducer: (state, action: PayloadAction<Userscript[]>) => {
        state.drafts = rebuildDraftsPreservingDirty(
          state.drafts,
          action.payload
        );
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
        applySyncDraftFromRemote(state.drafts, action.payload);
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
      .addCase(loadUserscripts.fulfilled, (state, action) => {
        state.drafts = rebuildDraftsPreservingDirty(
          state.drafts,
          action.payload
        );
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
          state.drafts[script.id] = draftFromScript(script);
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
          state.drafts[script.id] = draftFromScript(script);
          return;
        }

        draft.typeDefinitions = script.typeDefinitions ?? "";
        draft.dirty.typeDefinitions = false;
        draft.revision += 1;
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
  initDraftsFromScripts,
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

export const selectDraftForScript =
  (scriptId: string) =>
  (state: RootState): EditorDraft | undefined =>
    state.editorDrafts.drafts[scriptId];

export const selectDraftBuffer = (scriptId: string, buffer: DraftBuffer) =>
  createSelector(
    selectDraftForScript(scriptId),
    (draft) => draft?.[buffer] ?? ""
  );

export const selectDraftRevision = (scriptId: string) =>
  createSelector(
    selectDraftForScript(scriptId),
    (draft) => draft?.revision ?? 0
  );

export const selectIsDraftDirty = (scriptId: string) =>
  createSelector(selectDraftForScript(scriptId), (draft) =>
    isDraftDirty(draft)
  );

export const selectIsDraftBufferDirty = (
  scriptId: string,
  buffer: DraftBuffer
) =>
  createSelector(
    selectDraftForScript(scriptId),
    (draft) => draft?.dirty[buffer] ?? false
  );

export const selectPendingConflicts = (state: RootState) =>
  state.editorDrafts.pendingConflicts;

export const selectHasPendingConflicts = createSelector(
  selectPendingConflicts,
  (conflicts) => Object.keys(conflicts).length > 0
);

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
