import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Userscript } from "@shared/model";
import {
  initialState as editorDraftsInitialState,
  type EditorDraftsState,
} from "@/shared/store/slices/editor-drafts/state.editor-drafts";
import {
  initialState as userscriptsInitialState,
  type UserscriptsState,
} from "@/shared/store/slices/userscripts/state.userscripts";
import { loadUserscripts } from "@/shared/store/slices/userscripts/thunks.load";
import { toggleUserscript } from "@/shared/store/slices/userscripts/thunks.crud";

/**
 * Popup-only store: load + toggle. Does not register IDE compile/save thunks
 * or editor draft middleware.
 */
const popupUserscriptsSlice = createSlice({
  name: "userscripts",
  initialState: userscriptsInitialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadUserscripts.fulfilled, (state, action) => {
        state.scripts = Object.fromEntries(
          action.payload.map((script) => [script.id, script])
        );
      })
      .addCase(toggleUserscript.fulfilled, (state, action) => {
        applyUserscriptUpdate(state, action.payload.script);
      });
  },
});

function applyUserscriptUpdate(
  state: UserscriptsState,
  updatedScript: Userscript
) {
  state.scripts[updatedScript.id] = updatedScript;

  if (state.currentUserscript?.id === updatedScript.id) {
    state.currentUserscript = updatedScript;
  }
}

function editorDraftsStubReducer(
  state: EditorDraftsState = editorDraftsInitialState,
  _action: PayloadAction<unknown>
): EditorDraftsState {
  return state;
}

export const popupStore = configureStore({
  reducer: {
    userscripts: popupUserscriptsSlice.reducer,
    editorDrafts: editorDraftsStubReducer,
  },
  devTools: {
    name: "Invert Popup",
  },
});

export type PopupStore = typeof popupStore;
export type PopupRootState = ReturnType<PopupStore["getState"]>;
export type PopupDispatch = PopupStore["dispatch"];
