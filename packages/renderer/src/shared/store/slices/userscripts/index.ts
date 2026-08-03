import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Userscript } from "@shared/model";
import { isDraftDirty } from "../editor-drafts/state.editor-drafts";
import type { RootState } from "../../store";
import { loadUserscripts } from "./thunks.load";
import {
  createUserscript,
  deleteUserscript,
  toggleUserscript,
} from "./thunks.crud";
import {
  saveUserscriptDraft,
  updateUserscript,
  updateUserscriptCode,
  updateUserscriptTypeDefinitions,
} from "./thunks.save";
import { rebuildCompiledUserscripts } from "./thunks.compile";
import { importUserscripts } from "./thunks.import";
import { initialState, UserscriptsState } from "./state.userscripts";

export {
  selectAllUserscripts,
  selectCurrentUserscript,
  selectSharedUserscripts,
  selectUserscriptById,
} from "./selectors";

function applyUserscriptUpdate(
  state: UserscriptsState,
  updatedScript: Userscript
) {
  state.scripts[updatedScript.id] = updatedScript;

  if (state.currentUserscript?.id === updatedScript.id) {
    state.currentUserscript = updatedScript;
  }
}

const userscriptsSlice = createSlice({
  name: "userscripts",
  initialState,
  reducers: {
    setCurrentUserscript: {
      prepare: (id: string) => {
        return {
          payload: { id },
        };
      },
      reducer: (state, action: PayloadAction<{ id: string }>) => {
        state.currentUserscript = state.scripts[action.payload.id];
      },
    },
    syncScriptsFromRemote: (state, action: PayloadAction<Userscript[]>) => {
      for (const script of action.payload) {
        state.scripts[script.id] = script;

        if (state.currentUserscript?.id === script.id) {
          state.currentUserscript = script;
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadUserscripts.fulfilled, (state, action) => {
        state.scripts = Object.fromEntries(
          action.payload.map((script) => [script.id, script])
        );
      })
      .addCase(createUserscript.fulfilled, (state, action) => {
        state.scripts[action.payload.id] = action.payload;
        state.currentUserscript = action.payload;
      })
      .addCase(deleteUserscript.fulfilled, (state, action) => {
        const id = action.payload;

        state.scripts = Object.fromEntries(
          Object.entries(state.scripts).filter(([scriptId]) => scriptId !== id)
        );

        if (state.currentUserscript?.id === id) {
          state.currentUserscript = undefined;
        }
      })
      .addCase(toggleUserscript.fulfilled, (state, action) => {
        applyUserscriptUpdate(state, action.payload.script);
      })
      .addCase(updateUserscript.fulfilled, (state, action) => {
        applyUserscriptUpdate(state, action.payload);
      })
      .addCase(updateUserscriptCode.fulfilled, (state, action) => {
        applyUserscriptUpdate(state, action.payload);
      })
      .addCase(updateUserscriptTypeDefinitions.fulfilled, (state, action) => {
        applyUserscriptUpdate(state, action.payload);
      })
      .addCase(saveUserscriptDraft.fulfilled, (state, action) => {
        applyUserscriptUpdate(state, action.payload.script);
      })
      .addCase(rebuildCompiledUserscripts.fulfilled, (state, action) => {
        for (const script of action.payload) {
          applyUserscriptUpdate(state, script);
        }
      })
      .addCase(importUserscripts.fulfilled, (state, action) => {
        for (const script of action.payload) {
          state.scripts[script.id] = script;
        }
      });
  },
});

export const { setCurrentUserscript, syncScriptsFromRemote } =
  userscriptsSlice.actions;

/** Dirty scripts are derived from editor drafts — not mirrored entity status. */
export const selectUnsavedUserscripts = (state: RootState) =>
  Object.values(state.userscripts.scripts ?? {}).filter((script) =>
    isDraftDirty(state.editorDrafts.drafts[script.id])
  );

export default userscriptsSlice.reducer;
