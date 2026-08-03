import { createAsyncThunk } from "@reduxjs/toolkit/react";
import { isCompiledCodeBuildCurrent } from "@shared/compile-metadata";
import type { Userscript } from "@shared/model";
import { ChromeSyncStorage, CompiledCodeStorage } from "@shared/storage";
import {
  mergeCompiledCode,
  normalizeUserscript,
} from "@shared/userscript-hydrate";
import type { RootState } from "../../store";
import { compileAllOutputsOrThrow, getBuildOptions } from "./compile-helpers";
import { sendApplyScriptsMessage } from "./messaging";

/**
 * Rebuilds compiled userscript code when local artifacts are missing, outdated,
 * or when the caller explicitly requests a full rebuild.
 */
export const rebuildCompiledUserscripts = createAsyncThunk<
  Userscript[],
  { scope?: "stale" | "all" } | undefined,
  { state: RootState }
>("userscripts/rebuildCompiledUserscripts", async (args, { getState }) => {
  const [scriptsMap, compiledCodeMap] = await Promise.all([
    ChromeSyncStorage.getAllScripts(),
    CompiledCodeStorage.getAllCompiledCode(),
  ]);
  const scope = args?.scope ?? "stale";
  const state = getState();
  const buildOptions = getBuildOptions(state);
  const scripts = Object.values(scriptsMap).map(normalizeUserscript);
  const scriptsToRebuild = scripts.filter((script) => {
    if (scope === "all") {
      return true;
    }

    return !isCompiledCodeBuildCurrent(
      compiledCodeMap[script.id],
      buildOptions
    );
  });

  if (scriptsToRebuild.length === 0) {
    return [];
  }

  const rebuiltScripts: Userscript[] = [];

  for (const script of scriptsToRebuild) {
    const compiledEntry = await compileAllOutputsOrThrow(script, state);
    const updatedScript = mergeCompiledCode(script, compiledEntry);

    await CompiledCodeStorage.saveCompiledCode(script.id, compiledEntry);
    rebuiltScripts.push(updatedScript);
  }

  sendApplyScriptsMessage(rebuiltScripts.map((script) => script.id));

  return rebuiltScripts;
});
