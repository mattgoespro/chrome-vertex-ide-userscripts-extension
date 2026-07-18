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
  bumpDraftRevision,
  draftFromScript,
  DraftBuffer,
  EditorDraft,
  initialState,
  isDraftDirty,
  RemoteDraftConflict,
} from "./state.editor-drafts";

const editorDraftsSlice = createSlice({
  name: "editorDrafts",
  initialState,
  reducers: {
    initDraftsFromScripts: {
      prepare: (scripts: Userscript[]) => ({ payload: scripts }),
      reducer: (state, action: PayloadAction<Userscript[]>) => {
        const nextDrafts: Record<string, EditorDraft> = {};

        for (const script of action.payload) {
          const existing = state.drafts[script.id];

          if (existing && isDraftDirty(existing)) {
            nextDrafts[script.id] = existing;
          } else {
            nextDrafts[script.id] = draftFromScript(script);
          }
        }

        state.drafts = nextDrafts;
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

        if (draft[buffer] === code) {
          return;
        }

        draft[buffer] = code;
        draft.dirty[buffer] = true;
        draft.revision += 1;
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

        draft.dirty[buffer] = false;
        draft.revision += 1;
      },
    },
    applyRemoteScript: {
      prepare: (script: Userscript) => ({ payload: script }),
      reducer: (state, action: PayloadAction<Userscript>) => {
        const script = action.payload;
        const existing = state.drafts[script.id];

        state.drafts[script.id] = existing
          ? bumpDraftRevision(existing, script)
          : draftFromScript(script);
        delete state.pendingConflicts[script.id];
      },
    },
    syncDraftFromRemoteScript: {
      prepare: (script: Userscript) => ({ payload: script }),
      reducer: (state, action: PayloadAction<Userscript>) => {
        const script = action.payload;
        const existing = state.drafts[script.id];

        state.drafts[script.id] = existing
          ? bumpDraftRevision(existing, script)
          : draftFromScript(script);
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
        delete state.pendingConflicts[action.payload];
      },
    },
    resolveAllConflictsKeepLocal: (state) => {
      state.pendingConflicts = {};
    },
    resolveConflictTakeRemote: {
      prepare: (script: Userscript) => ({ payload: script }),
      reducer: (state, action: PayloadAction<Userscript>) => {
        const script = action.payload;
        const existing = state.drafts[script.id];

        state.drafts[script.id] = existing
          ? bumpDraftRevision(existing, script)
          : draftFromScript(script);
        delete state.pendingConflicts[script.id];
      },
    },
    resolveAllConflictsTakeRemote: {
      prepare: (scripts: Userscript[]) => ({ payload: scripts }),
      reducer: (state, action: PayloadAction<Userscript[]>) => {
        for (const script of action.payload) {
          const existing = state.drafts[script.id];

          state.drafts[script.id] = existing
            ? bumpDraftRevision(existing, script)
            : draftFromScript(script);
          delete state.pendingConflicts[script.id];
        }
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

        if (!draft || draft[buffer] === code) {
          return;
        }

        draft[buffer] = code;

        if (!draft.dirty[buffer]) {
          draft.dirty[buffer] = true;
          draft.revision += 1;
        }
      },
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(commitDraftForSave, (state, action) => {
        const { scriptId, buffer, code } = action.payload;
        const draft = state.drafts[scriptId];

        if (!draft) {
          return;
        }

        if (draft[buffer] === code && !draft.dirty[buffer]) {
          return;
        }

        draft[buffer] = code;
        draft.dirty[buffer] = false;
        draft.revision += 1;
      })
      .addCase(loadUserscripts.fulfilled, (state, action) => {
        const nextDrafts: Record<string, EditorDraft> = {};

        for (const script of action.payload) {
          const existing = state.drafts[script.id];

          if (existing && isDraftDirty(existing)) {
            nextDrafts[script.id] = existing;
          } else {
            nextDrafts[script.id] = draftFromScript(script);
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

        const buffer: DraftBuffer =
          language === "typescript" ? "typescript" : "scss";

        draft[buffer] = action.payload.code;
        draft.dirty[buffer] = false;
        draft.revision += 1;
      })
      // commitDraftForSave runs before the sync write so same-tab storage echoes
      // do not false-positive; if the write fails, restore the dirty flag.
      .addCase(updateUserscriptCode.rejected, (state, action) => {
        const { id, language } = action.meta.arg;
        const draft = state.drafts[id];

        if (!draft) {
          return;
        }

        const buffer: DraftBuffer =
          language === "typescript" ? "typescript" : "scss";

        draft.dirty[buffer] = true;
        draft.revision += 1;
      })
      .addCase(updateUserscriptTypeDefinitions.rejected, (state, action) => {
        const draft = state.drafts[action.meta.arg.id];

        if (!draft) {
          return;
        }

        draft.dirty.typeDefinitions = true;
        draft.revision += 1;
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

export default editorDraftsSlice.reducer;
