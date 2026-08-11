import { createAsyncThunk } from "@reduxjs/toolkit/react";
import type { Userscript } from "@shared/model";
import { getScriptModulePath } from "@shared/model";
import { getSharedImportModuleNames } from "@shared/shared-module-imports";
import { ChromeSyncStorage, CompiledCodeStorage } from "@shared/storage";
import {
  normalizeUserscript,
  toStorageSafeUserscript,
} from "@shared/userscript-hydrate";
import { uuid } from "@shared/utils";
import type { RootState } from "../../store";
import { compileAllOutputsOrThrow } from "./compile-helpers";
import { sendApplyScriptsMessage } from "./messaging";
import type { UserscriptsTransferFile } from "./transfer.userscripts";

export const importUserscripts = createAsyncThunk<
  Userscript[],
  UserscriptsTransferFile,
  { state: RootState }
>("userscripts/importUserscripts", async (file, { getState }) => {
  const state = getState();
  const existingScriptsMap = await ChromeSyncStorage.getAllScripts();
  const globalModules = state.modules.modules;
  const timestampBase = Date.now();
  const existingSharedByModuleName = new Map(
    Object.values(existingScriptsMap)
      .map(normalizeUserscript)
      .filter((script) => script.shared)
      .map((script) => [getScriptModulePath(script), script.id])
  );

  const importedScripts = file.userscripts.map((entry, index) => {
    const moduleName = entry.moduleName.trim();

    return {
      id: uuid(),
      name: entry.name,
      enabled: entry.enabled,
      status: "saved",
      shared: moduleName.length > 0,
      moduleName,
      sharedScripts: [] as string[],
      globalModules: entry.globalModuleImports.filter(
        (moduleId) => globalModules[moduleId] != null
      ),
      typeDefinitions: entry.sources["typescript-declarations"],
      code: {
        source: {
          typescript: entry.sources.typescript,
          scss: entry.sources.scss,
        },
        compiled: {
          javascript: "",
          css: "",
        },
      },
      urlPatterns: [...entry.urlPatterns],
      runAt: entry.runAt,
      createdAt: timestampBase + index,
      updatedAt: timestampBase + index,
    } satisfies Userscript;
  });

  const importedSharedByModuleName = new Map(
    importedScripts
      .filter((script) => script.shared)
      .map((script) => [getScriptModulePath(script), script.id])
  );

  for (const [index, entry] of file.userscripts.entries()) {
    const sharedImports = getSharedImportModuleNames(entry.sources.typescript);
    const resolvedImports =
      sharedImports.length > 0 ? sharedImports : entry.sharedImports;

    importedScripts[index].sharedScripts = resolvedImports.map((moduleName) => {
      const trimmedModuleName = moduleName.trim();
      const sharedScriptId =
        importedSharedByModuleName.get(trimmedModuleName) ??
        existingSharedByModuleName.get(trimmedModuleName);

      if (!sharedScriptId) {
        throw new Error(
          `Script \"${entry.name}\" references unknown shared module \"${trimmedModuleName}\".`
        );
      }

      return sharedScriptId;
    });
  }

  const compiledEntries = await Promise.all(
    importedScripts.map((script) => compileAllOutputsOrThrow(script, state))
  );

  await Promise.all(
    importedScripts.map(async (script, index) => {
      const compiledEntry = compiledEntries[index];

      script.code.compiled.javascript = compiledEntry.javascript;
      script.code.compiled.css = compiledEntry.css;

      await Promise.all([
        ChromeSyncStorage.saveScript(toStorageSafeUserscript(script)),
        CompiledCodeStorage.saveCompiledCode(script.id, compiledEntry),
      ]);
    })
  );

  sendApplyScriptsMessage(importedScripts.map((script) => script.id));

  return importedScripts;
});
