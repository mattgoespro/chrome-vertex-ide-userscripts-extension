import { createSelector } from "@reduxjs/toolkit";
import type { UserscriptsState } from "./state.userscripts";

type UserscriptsRoot = { userscripts: UserscriptsState };

export const selectAllUserscripts = (state: UserscriptsRoot) =>
  state.userscripts.scripts;

export const selectCurrentUserscript = (state: UserscriptsRoot) =>
  state.userscripts.currentUserscript;

export const selectUserscriptById = (
  state: UserscriptsRoot,
  scriptId: string
) => state.userscripts.scripts[scriptId];

export const selectSharedUserscripts = createSelector(
  selectAllUserscripts,
  (scripts) => Object.values(scripts ?? {}).filter((script) => script.shared)
);
