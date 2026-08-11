import { Userscripts } from "@shared/model";

export const DefaultNewUserscriptName = "New Script";

export type UserscriptsState = {
  scripts?: Userscripts;
  /** Selected script id; resolve the entity via `scripts[currentScriptId]`. */
  currentScriptId: string | null;
};

export const initialState: UserscriptsState = {
  scripts: {},
  currentScriptId: null,
};
