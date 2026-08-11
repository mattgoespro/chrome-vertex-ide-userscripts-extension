import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Userscript } from "@shared/model";
import { loadUserscripts } from "./thunks.load";
import {
  createUserscript,
  deleteUserscript,
  toggleUserscript,
} from "./thunks.crud";
import { persistScriptBuffers, updateUserscript } from "./thunks.save";
import { rebuildCompiledUserscripts } from "./thunks.compile";
import { importUserscripts } from "./thunks.import";
import { initialState } from "./state.userscripts";

export {
  selectAllUserscripts,
  selectCurrentUserscript,
  selectSharedUserscripts,
} from "./selectors";

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
        state.currentScriptId = action.payload.id;
      },
    },
    syncScriptsFromRemote: (state, action: PayloadAction<Userscript[]>) => {
      for (const script of action.payload) {
        state.scripts[script.id] = script;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadUserscripts.fulfilled, (state, action) => {
        state.scripts = Object.fromEntries(
          action.payload.map((script) => [script.id, script])
        );

        if (
          state.currentScriptId &&
          !state.scripts[state.currentScriptId]
        ) {
          state.currentScriptId = null;
        }
      })
      .addCase(createUserscript.fulfilled, (state, action) => {
        state.scripts[action.payload.id] = action.payload;
        state.currentScriptId = action.payload.id;
      })
      .addCase(deleteUserscript.fulfilled, (state, action) => {
        const id = action.payload;

        state.scripts = Object.fromEntries(
          Object.entries(state.scripts).filter(([scriptId]) => scriptId !== id)
        );

        if (state.currentScriptId === id) {
          state.currentScriptId = null;
        }
      })
      .addCase(toggleUserscript.fulfilled, (state, action) => {
        state.scripts[action.payload.script.id] = action.payload.script;
      })
      .addCase(updateUserscript.fulfilled, (state, action) => {
        state.scripts[action.payload.id] = action.payload;
      })
      .addCase(persistScriptBuffers.fulfilled, (state, action) => {
        state.scripts[action.payload.script.id] = action.payload.script;
      })
      .addCase(rebuildCompiledUserscripts.fulfilled, (state, action) => {
        for (const script of action.payload) {
          state.scripts[script.id] = script;
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

export default userscriptsSlice.reducer;
