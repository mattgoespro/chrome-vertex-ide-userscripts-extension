import {
  buildScriptFileUri,
  ensureTypescriptDefaults,
  registerModuleSpecifierCompletion,
  syncAmbientTypeDefinitionLibs,
  syncCdnModuleLibs,
  syncModulePackageJsons,
  syncWorkspaceModels,
  type SharedModuleSpecifierInfo,
  type WorkspaceFile,
} from "@packages/monaco";
import { getScriptModulePath } from "@shared/model";
import {
  listSharedScriptIds,
  resolveWorkspaceScriptClosure,
} from "@shared/workspace-closure";
import { isDraftDirty } from "../store/slices/editor-drafts";
import type { AppStore, RootState } from "../store/store";
import { registerBespokeCodeActions } from "../utils/quick-fix-provider";
import {
  isModuleDeclarationFile,
  stripExportsForAmbientLib,
} from "./ambient-type-defs";
import { getDraftBuffer } from "./workspace-sync-plan";

/**
 * The single owner of all store -> Monaco synchronization.
 *
 * Subscribes to the Redux store exactly once and reconciles, debounced and
 * revision-diffed:
 *
 * - Monaco models for the active script, its import closure (derived from
 *   TypeScript source), every shared module, plus any dirty offscreen drafts.
 * - Static package.json extra libs, ambient type copies, and CDN @types for
 *   every configured global module (eager, not scoped to the active script).
 *
 * Editors own attached buffers. The service only overwrites an attached buffer
 * when that buffer's draft is clean (e.g. storage-sync take-remote).
 */

const SYNC_DEBOUNCE_MS = 50;

function selectSharedModuleInfos(
  state: RootState
): SharedModuleSpecifierInfo[] {
  return Object.values(state.userscripts.scripts ?? {})
    .filter((script) => script.shared)
    .map((script) => ({
      moduleName: getScriptModulePath(script),
      scriptName: script.name,
    }));
}

function selectCurrentScript(state: RootState) {
  const currentScriptId = state.userscripts.currentScriptId;
  return currentScriptId
    ? (state.userscripts.scripts?.[currentScriptId] ?? undefined)
    : undefined;
}

let running = false;

export function startWorkspaceService(store: AppStore): () => void {
  if (running) {
    return () => {};
  }

  running = true;
  ensureTypescriptDefaults();

  const completionDisposable = registerModuleSpecifierCompletion(() =>
    selectSharedModuleInfos(store.getState())
  );
  const codeActionsDisposable = registerBespokeCodeActions();

  let scheduled: ReturnType<typeof setTimeout> | null = null;
  let lastSignature = "";
  let lastCurrentScriptId = store.getState().userscripts.currentScriptId ?? null;

  const sync = () => {
    scheduled = null;

    const state = store.getState();
    const scriptsMap = state.userscripts.scripts ?? {};
    const scripts = Object.values(scriptsMap);
    const drafts = state.editorDrafts.drafts;
    const currentScript = selectCurrentScript(state);
    const modules = state.modules.modules ?? {};

    const closureIds = resolveWorkspaceScriptClosure(currentScript, scriptsMap, {
      getTypescriptSource: (script) =>
        getDraftBuffer(script, drafts[script.id], "typescript").contents,
    });
    const sharedIds = listSharedScriptIds(scriptsMap);
    const dirtyDraftIds = Object.entries(drafts)
      .filter(([, draft]) => isDraftDirty(draft))
      .map(([scriptId]) => scriptId)
      .filter((scriptId) => scriptsMap[scriptId] != null);

    const closureDeps = closureIds.filter(
      (scriptId) => scriptId !== currentScript?.id
    );
    const extraSharedIds = sharedIds.filter(
      (scriptId) => !closureIds.includes(scriptId)
    );
    const included = new Set([...closureDeps, ...extraSharedIds]);
    const workspaceIds = [...closureDeps, ...extraSharedIds];

    if (currentScript) {
      workspaceIds.push(currentScript.id);
      included.add(currentScript.id);
    }

    for (const scriptId of dirtyDraftIds) {
      if (!included.has(scriptId)) {
        workspaceIds.push(scriptId);
        included.add(scriptId);
      }
    }

    // Signature tracks draft revision + TypeScript text (import edges), not
    // the persisted sharedScripts cache.
    const signature = JSON.stringify([
      workspaceIds.map((scriptId) => {
        const script = scriptsMap[scriptId];
        const typescript = script
          ? getDraftBuffer(script, drafts[scriptId], "typescript").contents
          : "";

        return [
          scriptId,
          script ? getScriptModulePath(script) : "",
          script?.updatedAt ?? 0,
          drafts[scriptId]?.revision ?? -1,
          typescript,
        ];
      }),
      currentScript?.id,
      Object.values(modules).map((module) => [module.id, module.packageName]),
    ]);

    if (signature === lastSignature) {
      return;
    }

    lastSignature = signature;

    const files: WorkspaceFile[] = [];
    const ambientLibs: Array<{
      id: string;
      filePath: string;
      contents: string;
    }> = [];
    const workspaceIdSet = new Set(workspaceIds);

    for (const scriptId of workspaceIds) {
      const script = scriptsMap[scriptId];

      if (!script) {
        continue;
      }

      const isActive = script.id === currentScript?.id;
      const draft = drafts[script.id];
      const main = getDraftBuffer(script, draft, "typescript");
      const types = getDraftBuffer(script, draft, "typeDefinitions");

      files.push(
        {
          uri: buildScriptFileUri(script, "main"),
          language: "typescript",
          contents: main.contents,
          preserveAttachedBuffer: main.dirty,
        },
        {
          uri: buildScriptFileUri(script, "types"),
          language: "typescript",
          contents: types.contents,
          preserveAttachedBuffer: types.dirty,
        }
      );

      if (isActive || isDraftDirty(draft)) {
        const styles = getDraftBuffer(script, draft, "scss");
        files.push({
          uri: buildScriptFileUri(script, "styles"),
          language: "scss",
          contents: styles.contents,
          preserveAttachedBuffer: styles.dirty,
        });
      }

      if (
        !isActive &&
        workspaceIdSet.has(script.id) &&
        script.shared &&
        isModuleDeclarationFile(types.contents)
      ) {
        const ambientContents = stripExportsForAmbientLib(types.contents);

        if (ambientContents.trim()) {
          const modulePath = getScriptModulePath(script);
          ambientLibs.push({
            id: `ambient:${script.id}`,
            filePath: `file:///scripts/${modulePath}/types.ambient.d.ts`,
            contents: ambientContents,
          });
        }
      }
    }

    const modulePaths = scripts.map((script) => getScriptModulePath(script));
    syncModulePackageJsons(modulePaths);
    syncWorkspaceModels(files);
    syncAmbientTypeDefinitionLibs(ambientLibs);

    // Eagerly register @types for every configured CDN module so switching
    // scripts never tears libs down and re-fetches (which flashes diagnostics).
    const cdnModules = Object.values(modules).flatMap((module) =>
      module.packageName
        ? [{ id: module.id, packageName: module.packageName }]
        : []
    );

    void syncCdnModuleLibs(cdnModules).catch((error) => {
      console.warn("CDN type acquisition failed:", error);
    });
  };

  const unsubscribe = store.subscribe(() => {
    const nextId = store.getState().userscripts.currentScriptId ?? null;

    if (nextId !== lastCurrentScriptId) {
      lastCurrentScriptId = nextId;

      if (scheduled != null) {
        clearTimeout(scheduled);
        scheduled = null;
      }

      sync();
      return;
    }

    scheduled ??= setTimeout(sync, SYNC_DEBOUNCE_MS);
  });

  sync();

  return () => {
    unsubscribe();

    if (scheduled != null) {
      clearTimeout(scheduled);
    }

    completionDisposable.dispose();
    codeActionsDisposable.dispose();
    running = false;
  };
}
