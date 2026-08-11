import { createAsyncThunk } from "@reduxjs/toolkit/react";
import { buildCompiledCodeEntry } from "@shared/compile-metadata";
import type { Userscript } from "@shared/model";
import {
  hasSharedJavascriptConfigChanged,
  resolveSharedScriptIdsFromSourceOrThrow,
} from "@shared/resolve-shared-scripts";
import { isCompiledCodeBuildCurrent } from "@shared/compile-metadata";
import { ChromeSyncStorage, CompiledCodeStorage } from "@shared/storage";
import {
  mergeCompiledCode,
  normalizeUserscript,
  toStorageSafeUserscript,
} from "@shared/userscript-hydrate";
import { commitDraftForSave } from "../editor-drafts/actions";
import {
  buildScriptWithDraftSource,
  extractUserscriptMetadataUpdates,
  getDraftOrSavedSource,
} from "../editor-drafts/helpers";
import type { DraftBuffer } from "../editor-drafts/state.editor-drafts";
import type { RootState } from "../../store";
import {
  compileAllOutputsOrThrow,
  compileJavascriptOrThrow,
  getBuildOptions,
} from "./compile-helpers";
import { sendApplyScriptsMessage } from "./messaging";

export const updateUserscript = createAsyncThunk<
  Userscript,
  { id: string; updates: Partial<Userscript> },
  { state: RootState }
>("userscripts/updateUserscript", async ({ id, updates }, { getState }) => {
  const state = getState();
  const previousScriptsMap = await ChromeSyncStorage.getAllScripts();
  const storedEntry = previousScriptsMap[id];

  if (!storedEntry) {
    throw new Error(`Userscript not found: ${id}`);
  }

  const storedScript = normalizeUserscript(storedEntry);

  const metadataUpdates = extractUserscriptMetadataUpdates(updates);
  const draftSource = getDraftOrSavedSource(state, id);
  const normalizedScript = buildScriptWithDraftSource(
    {
      ...storedScript,
      ...metadataUpdates,
      updatedAt: Date.now(),
    },
    draftSource
  );

  const previousScript = previousScriptsMap[normalizedScript.id]
    ? normalizeUserscript(previousScriptsMap[normalizedScript.id])
    : undefined;
  const compiledEntry = await CompiledCodeStorage.getCompiledCode(
    normalizedScript.id
  );
  const storageScript = toStorageSafeUserscript(normalizedScript);

  if (!isCompiledCodeBuildCurrent(compiledEntry, getBuildOptions(state))) {
    const rebuiltEntry = await compileAllOutputsOrThrow(
      normalizedScript,
      state
    );

    normalizedScript.code.compiled.javascript = rebuiltEntry.javascript;
    normalizedScript.code.compiled.css = rebuiltEntry.css;

    await CompiledCodeStorage.saveCompiledCode(
      normalizedScript.id,
      rebuiltEntry
    );
  } else if (
    hasSharedJavascriptConfigChanged(normalizedScript, previousScript)
  ) {
    const javascript = await compileJavascriptOrThrow(normalizedScript, state);
    const css = compiledEntry?.css ?? normalizedScript.code.compiled.css;
    const rebuiltEntry = buildCompiledCodeEntry(
      javascript,
      css,
      getBuildOptions(state)
    );

    normalizedScript.code.compiled.javascript = javascript;
    normalizedScript.code.compiled.css = css;

    await CompiledCodeStorage.saveCompiledCode(
      normalizedScript.id,
      rebuiltEntry
    );
  }

  await ChromeSyncStorage.updateScript(normalizedScript.id, {
    ...storageScript,
    code: {
      source: storedScript.code.source,
      compiled: {
        javascript: "",
        css: "",
      },
    },
    typeDefinitions: storedScript.typeDefinitions,
  });

  return normalizedScript;
});

export type PersistScriptBuffersArgs = {
  scriptId: string;
  /**
   * Optional buffer overrides merged over the current draft (e.g.
   * Prettier-formatted Ctrl+S content for the focused pane).
   */
  bufferOverrides?: Partial<Record<DraftBuffer, string>>;
  /** Re-inject matching tabs after save. Default true. */
  applyTabs?: boolean;
  /**
   * Compile TS/SCSS before persisting. Default true. Type-definition-only
   * saves set this false so broken TypeScript cannot block a types edit.
   */
  compile?: boolean;
};

/**
 * Canonical write path for open-document draft buffers: resolve shared
 * imports → optional compile → commit drafts clean → sync + local → optional apply.
 */
export const persistScriptBuffers = createAsyncThunk<
  { script: Userscript; appliedTabCount: number },
  PersistScriptBuffersArgs,
  { state: RootState }
>(
  "userscripts/persistScriptBuffers",
  async (
    { scriptId, bufferOverrides, applyTabs = true, compile = true },
    { getState, dispatch, requestId }
  ) => {
    const state = getState();
    const draft = state.editorDrafts.drafts[scriptId];

    if (!draft) {
      throw new Error(`No editor draft found for script: ${scriptId}`);
    }

    const typescript = bufferOverrides?.typescript ?? draft.typescript;
    const scss = bufferOverrides?.scss ?? draft.scss;
    const typeDefinitions =
      bufferOverrides?.typeDefinitions ?? draft.typeDefinitions;

    const scriptsMap = await ChromeSyncStorage.getAllScripts();
    const script = normalizeUserscript(scriptsMap[scriptId]);

    if (!script) {
      throw new Error(`Userscript not found: ${scriptId}`);
    }

    script.code.source.typescript = typescript;
    script.code.source.scss = scss;
    script.typeDefinitions = typeDefinitions;

    try {
      script.sharedScripts = resolveSharedScriptIdsFromSourceOrThrow(
        script,
        scriptsMap,
        typescript
      );
    } catch (error) {
      // Types-only saves must not fail on unresolved imports in draft TS.
      if (compile) {
        throw error;
      }
    }

    let compiledEntry = await CompiledCodeStorage.getCompiledCode(scriptId);

    if (compile) {
      compiledEntry = await compileAllOutputsOrThrow(script, getState());
      script.code.compiled.javascript = compiledEntry.javascript;
      script.code.compiled.css = compiledEntry.css;
    } else if (compiledEntry) {
      script.code.compiled.javascript = compiledEntry.javascript;
      script.code.compiled.css = compiledEntry.css;
    }

    script.status = "saved";
    script.updatedAt = Date.now();

    // Commit immediately before the sync write so same-tab onChanged echoes
    // do not race a still-dirty draft.
    const committed: Array<{ buffer: DraftBuffer; code: string }> = [
      { buffer: "typescript", code: typescript },
      { buffer: "scss", code: scss },
      { buffer: "typeDefinitions", code: typeDefinitions },
    ];

    for (const { buffer, code } of committed) {
      dispatch(
        commitDraftForSave({
          scriptId,
          buffer,
          code,
          saveRequestId: requestId,
        })
      );
    }

    await ChromeSyncStorage.updateScript(
      scriptId,
      toStorageSafeUserscript(script)
    );

    if (compile && compiledEntry) {
      await CompiledCodeStorage.saveCompiledCode(scriptId, compiledEntry);
    }

    const applyResult = applyTabs
      ? await sendApplyScriptsMessage([scriptId])
      : { appliedTabCount: 0 };

    return {
      script: compiledEntry
        ? mergeCompiledCode(script, compiledEntry)
        : script,
      appliedTabCount: applyResult.appliedTabCount,
    };
  }
);
