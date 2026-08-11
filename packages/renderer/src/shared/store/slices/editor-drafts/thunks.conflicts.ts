import { createAction, createAsyncThunk } from "@reduxjs/toolkit";
import { persistScriptBuffers } from "../userscripts/thunks.userscripts";
import type { RootState } from "../../store";

/** Keep action types stable with the editorDrafts slice reducers. */
const resolveConflictKeepLocal = createAction<string>(
  "editorDrafts/resolveConflictKeepLocal"
);
const resolveAllConflictsKeepLocal = createAction(
  "editorDrafts/resolveAllConflictsKeepLocal"
);

/**
 * Persist local draft buffers to sync, then clear the conflict. This makes
 * "Keep local" overwrite remote without requiring a separate Save.
 */
export const keepLocalConflictAndPersist = createAsyncThunk<
  void,
  string,
  { state: RootState }
>(
  "editorDrafts/keepLocalConflictAndPersist",
  async (scriptId, { dispatch }) => {
    await dispatch(persistScriptBuffers({ scriptId })).unwrap();
    dispatch(resolveConflictKeepLocal(scriptId));
  }
);

export const keepAllLocalConflictsAndPersist = createAsyncThunk<
  void,
  void,
  { state: RootState }
>(
  "editorDrafts/keepAllLocalConflictsAndPersist",
  async (_arg, { dispatch, getState }) => {
    const scriptIds = Object.keys(getState().editorDrafts.pendingConflicts);

    for (const scriptId of scriptIds) {
      await dispatch(persistScriptBuffers({ scriptId })).unwrap();
    }

    dispatch(resolveAllConflictsKeepLocal());
  }
);
