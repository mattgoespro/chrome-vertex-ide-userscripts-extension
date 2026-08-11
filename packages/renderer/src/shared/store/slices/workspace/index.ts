import { CompilationError } from "@shared/errors";
import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { initialState, type WorkspaceState } from "./workspace.state";

const EMPTY_ERRORS: CompilationError[] = [];

const flattenScriptErrors = (
  errorsByLanguage: WorkspaceState["scriptErrors"][string] | undefined
): CompilationError[] => {
  if (!errorsByLanguage) {
    return EMPTY_ERRORS;
  }

  const errors = Object.values(errorsByLanguage).flatMap(
    (languageErrors) => languageErrors ?? EMPTY_ERRORS
  );

  return errors.length > 0 ? errors : EMPTY_ERRORS;
};

const selectScriptErrorsMemo = createSelector(
  [(state: WorkspaceState, scriptId: string) => state.scriptErrors[scriptId]],
  (errorsByLanguage): CompilationError[] =>
    flattenScriptErrors(errorsByLanguage)
);

const workspaceSlice = createSlice({
  name: "workspace",
  initialState,
  reducers: {
    setScriptErrors: (
      state,
      action: PayloadAction<{
        scriptId: string;
        language: CompilationError["language"];
        errors: CompilationError[];
      }>
    ) => {
      const scriptErrors = state.scriptErrors[action.payload.scriptId] ?? {};

      scriptErrors[action.payload.language] = action.payload.errors;
      state.scriptErrors[action.payload.scriptId] = scriptErrors;
    },
  },
  selectors: {
    selectScriptErrors: (state, scriptId: string) => {
      return selectScriptErrorsMemo(state, scriptId);
    },
    selectErrorCount: (state, scriptId: string) => {
      return selectScriptErrorsMemo(state, scriptId).length;
    },
  },
});

export const { setScriptErrors } = workspaceSlice.actions;

export const { selectScriptErrors, selectErrorCount } =
  workspaceSlice.selectors;

export default workspaceSlice.reducer;
