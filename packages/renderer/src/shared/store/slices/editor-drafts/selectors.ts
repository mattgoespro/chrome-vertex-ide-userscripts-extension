import { createSelector } from "@reduxjs/toolkit";
import {
  isDraftDirty,
  type DraftBuffer,
  type EditorDraft,
  type EditorDraftsState,
} from "./state.editor-drafts";

type EditorDraftsRoot = { editorDrafts: EditorDraftsState };

export const selectDraftForScript =
  (scriptId: string) =>
  (state: EditorDraftsRoot): EditorDraft | undefined =>
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

export const selectPendingConflicts = (state: EditorDraftsRoot) =>
  state.editorDrafts.pendingConflicts;

export const selectHasPendingConflicts = createSelector(
  selectPendingConflicts,
  (conflicts) => Object.keys(conflicts).length > 0
);
