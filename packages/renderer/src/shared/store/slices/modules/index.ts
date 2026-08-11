import { createSelector, createSlice } from "@reduxjs/toolkit";
import { initialState, ModulesState } from "./state.modules";
import {
  addModule,
  deleteModule,
  loadModules,
  updateModule,
} from "./thunks.modules";

const selectEnabledModulesMemo = createSelector(
  (state: ModulesState) => state.modules,
  (modules) => Object.values(modules).filter((m) => m.enabled)
);

const modulesSlice = createSlice({
  name: "modules",
  initialState,
  selectors: {
    selectModules(state: ModulesState) {
      return state.modules;
    },
    selectEnabledModules(state: ModulesState) {
      return selectEnabledModulesMemo(state);
    },
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadModules.fulfilled, (state, action) => {
        state.modules = action.payload;
      })
      .addCase(addModule.fulfilled, (state, action) => {
        state.modules[action.payload.id] = action.payload;
      })
      .addCase(updateModule.fulfilled, (state, action) => {
        state.modules[action.payload.id] = action.payload;
      })
      .addCase(deleteModule.fulfilled, (state, action) => {
        delete state.modules[action.payload];
      });
  },
});

export const { selectModules, selectEnabledModules } = modulesSlice.selectors;

export { loadModules, addModule, updateModule, deleteModule };

export default modulesSlice.reducer;
