import { createSelector } from "@reduxjs/toolkit";
import type { UserscriptsState } from "./state.userscripts";

type UserscriptsRoot = { userscripts: UserscriptsState };

export const selectAllUserscripts = (state: UserscriptsRoot) =>
  state.userscripts.scripts;

export const selectCurrentUserscript = (state: UserscriptsRoot) => {
  const id = state.userscripts.currentScriptId;
  return id ? state.userscripts.scripts?.[id] : undefined;
};

export const selectSharedUserscripts = createSelector(
  selectAllUserscripts,
  (scripts) => Object.values(scripts ?? {}).filter((script) => script.shared)
);
