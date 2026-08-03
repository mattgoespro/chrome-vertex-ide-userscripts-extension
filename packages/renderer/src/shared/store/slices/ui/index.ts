import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  AppSidebarTab,
  GlobalState,
  GlobalStateSizes,
  ScriptEditorDrawerTab,
} from "@shared/storage";
import { setCurrentUserscript } from "../userscripts";
import { createUserscript } from "../userscripts/thunks.userscripts";
import { initialUiState, UiState } from "./state.ui";
import { hydrateUi } from "./thunks.ui";

const uiSlice = createSlice({
  name: "ui",
  initialState: initialUiState,
  reducers: {
    setActiveSidebarTab: (state, action: PayloadAction<AppSidebarTab>) => {
      state.activeSidebarTab = action.payload;
    },
    setSelectedScriptId: (
      state,
      action: PayloadAction<string | null | undefined>
    ) => {
      state.selectedScriptId = action.payload ?? null;
    },
    setOutputDrawerCollapsed: (state, action: PayloadAction<boolean>) => {
      state.outputDrawerCollapsed = action.payload;
    },
    setOutputDrawerActiveTab: (
      state,
      action: PayloadAction<ScriptEditorDrawerTab>
    ) => {
      state.outputDrawerActiveTab = action.payload;
    },
    updatePanelSizes: (
      state,
      action: PayloadAction<Partial<GlobalStateSizes>>
    ) => {
      state.panelSizes = {
        ...state.panelSizes,
        ...action.payload,
      };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(hydrateUi.fulfilled, (state, action) => {
        const stored = action.payload;
        state.hydrated = true;
        state.activeSidebarTab =
          stored.activeSidebarTab ?? state.activeSidebarTab;
        state.selectedScriptId =
          stored.selectedScriptId ?? state.selectedScriptId;
        state.outputDrawerCollapsed =
          stored.outputDrawerCollapsed ?? state.outputDrawerCollapsed;
        state.outputDrawerActiveTab =
          stored.outputDrawerActiveTab ?? state.outputDrawerActiveTab;
        state.panelSizes = {
          ...state.panelSizes,
          ...(stored.panelSizes ?? {}),
        };
      })
      .addCase(setCurrentUserscript, (state, action) => {
        state.selectedScriptId = action.payload.id;
      })
      .addCase(createUserscript.fulfilled, (state, action) => {
        state.selectedScriptId = action.payload.id;
        state.activeSidebarTab = "scripts";
      });
  },
});

export const {
  setActiveSidebarTab,
  setSelectedScriptId,
  setOutputDrawerCollapsed,
  setOutputDrawerActiveTab,
  updatePanelSizes,
} = uiSlice.actions;

export const selectUi = (state: { ui: UiState }) => state.ui;
export const selectUiHydrated = (state: { ui: UiState }) => state.ui.hydrated;
export const selectActiveSidebarTab = (state: { ui: UiState }) =>
  state.ui.activeSidebarTab;
export const selectSelectedScriptId = (state: { ui: UiState }) =>
  state.ui.selectedScriptId;
export const selectOutputDrawerCollapsed = (state: { ui: UiState }) =>
  state.ui.outputDrawerCollapsed;
export const selectOutputDrawerActiveTab = (state: { ui: UiState }) =>
  state.ui.outputDrawerActiveTab;
export const selectPanelSizes = (state: { ui: UiState }) => state.ui.panelSizes;

export function toPersistedGlobalState(ui: UiState): GlobalState {
  return {
    activeSidebarTab: ui.activeSidebarTab,
    selectedScriptId: ui.selectedScriptId,
    outputDrawerCollapsed: ui.outputDrawerCollapsed,
    outputDrawerActiveTab: ui.outputDrawerActiveTab,
    panelSizes: { ...ui.panelSizes },
  };
}

export { hydrateUi } from "./thunks.ui";
export type { UiState };

export default uiSlice.reducer;
