import { createSlice } from "@reduxjs/toolkit";
import { loadSettings, updateSettings } from "./thunks.settings";
import { initialState, SettingsState } from "./state.settings";
import { ChromeSyncStorage } from "@shared/storage";

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  selectors: {
    selectEditorSettings(state: SettingsState) {
      return state.editorSettings;
    },
    selectIsLoading(state: SettingsState) {
      return state.isLoading;
    },
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadSettings.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(loadSettings.fulfilled, (state, action) => {
        state.editorSettings = {
          ...ChromeSyncStorage.defaultSettings,
          ...action.payload,
        };
        state.isLoading = false;
      })
      .addCase(loadSettings.rejected, (state) => {
        state.isLoading = false;
      })
      .addCase(updateSettings.fulfilled, (state, action) => {
        state.editorSettings = { ...state.editorSettings, ...action.payload };
      });
  },
});

export const { selectEditorSettings, selectIsLoading } =
  settingsSlice.selectors;

export default settingsSlice.reducer;
