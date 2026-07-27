import { createAction } from "@reduxjs/toolkit";
import type { DraftBuffer } from "./state.editor-drafts";

/**
 * Atomically apply the code about to be written to chrome.storage.sync and
 * clear that buffer's dirty flag. Defined outside the slice module so storage
 * thunks can dispatch it without an import cycle.
 */
export const commitDraftForSave = createAction<{
  scriptId: string;
  buffer: DraftBuffer;
  code: string;
  saveRequestId: string;
}>("editorDrafts/commitDraftForSave");
