import { createAsyncThunk } from "@reduxjs/toolkit/react";
import { ChromeSyncStorage, CompiledCodeStorage } from "@shared/storage";
import { hydrateUserscriptWithCompiled } from "@shared/userscript-hydrate";

/**
 * Storage-only hydrate path — no compile pipeline dependency.
 * Safe for popup / lightweight surfaces.
 */
export const loadUserscripts = createAsyncThunk(
  "userscripts/loadUserscripts",
  async () => {
    const [scriptsMap, compiledCodeMap] = await Promise.all([
      ChromeSyncStorage.getAllScripts(),
      CompiledCodeStorage.getAllCompiledCode(),
    ]);

    return Object.values(scriptsMap).map((script) =>
      hydrateUserscriptWithCompiled(script, compiledCodeMap[script.id])
    );
  }
);
