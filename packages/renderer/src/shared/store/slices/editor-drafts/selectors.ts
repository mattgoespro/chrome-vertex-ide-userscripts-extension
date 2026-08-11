import { createSelector } from "@reduxjs/toolkit";
import {
  isDraftDirty,
  type EditorDraft,
  type EditorDraftsState,
} from "./state.editor-drafts";

type EditorDraftsRoot = { editorDrafts: EditorDraftsState };

export const selectDraftForScript =
  (scriptId: string) =>
  (state: EditorDraftsRoot): EditorDraft | undefined =>
    state.editorDrafts.drafts[scriptId];

export const selectIsDraftDirty = (scriptId: string) =>
  createSelector(selectDraftForScript(scriptId), (draft) =>
    isDraftDirty(draft)
  );

export const selectPendingConflicts = (state: EditorDraftsRoot) =>
  state.editorDrafts.pendingConflicts;
