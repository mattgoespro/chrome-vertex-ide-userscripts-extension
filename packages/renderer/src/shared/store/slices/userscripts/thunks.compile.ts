import { createAsyncThunk } from "@reduxjs/toolkit/react";
import { isCompiledCodeBuildCurrent } from "@shared/compile-metadata";
import type { Userscript } from "@shared/model";
import { resolveSharedScriptIdsFromSourceOrThrow } from "@shared/resolve-shared-scripts";
import {
  ChromeSyncStorage,
  CompiledCodeStorage,
} from "@shared/storage";
import {
  mergeCompiledCode,
  normalizeUserscript,
  toStorageSafeUserscript,
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
    const previousSharedScripts = script.sharedScripts ?? [];

    try {
      script.sharedScripts = resolveSharedScriptIdsFromSourceOrThrow(
        script,
        scriptsMap,
        script.code.source.typescript
      );
    } catch (error) {
      console.warn(
        `Failed to re-resolve sharedScripts for "${script.name}" during rebuild:`,
        error
      );
    }

    const compiledEntry = await compileAllOutputsOrThrow(script, state);
    const updatedScript = mergeCompiledCode(script, compiledEntry);

    await CompiledCodeStorage.saveCompiledCode(script.id, compiledEntry);

    const nextSharedScripts = updatedScript.sharedScripts ?? [];
    const sharedScriptsChanged =
      previousSharedScripts.length !== nextSharedScripts.length ||
      previousSharedScripts.some(
        (sharedId, index) => sharedId !== nextSharedScripts[index]
      );

    if (sharedScriptsChanged) {
      await ChromeSyncStorage.updateScript(
        script.id,
        toStorageSafeUserscript(updatedScript)
      );
    }

    rebuiltScripts.push(updatedScript);
  }

  sendApplyScriptsMessage(rebuiltScripts.map((script) => script.id));

  return rebuiltScripts;
});
