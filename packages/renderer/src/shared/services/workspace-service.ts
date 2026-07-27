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
import type { AppStore, RootState } from "../store/store";
import { registerBespokeCodeActions } from "../utils/quick-fix-provider";
import { buildWorkspaceSyncPlan } from "./workspace-sync-plan";

/**
 * The single owner of all store → Monaco synchronization.
 *
 * Subscribes to the Redux store exactly once and reconciles, debounced and
 * revision-diffed:
 *
 * - one real Monaco model per script buffer (main.ts / types.d.ts /
 *   styles.scss) so the eager-synced TypeScript worker always type-checks
 *   against actual source — no generated declaration files;
 * - a static `package.json` extra lib per script module (re-registered only on
 *   rename) that keeps auto-import emitting canonical `scripts/<m>/main`
 *   specifiers;
 * - ambient copies of type panes that are modules (their globals would
 *   otherwise stop being globally visible);
 * - CDN `@types` acquisition for the currently open script's global modules,
 *   fully non-blocking.
 *
 * Editors own the buffers of attached models; drafts flow back through
 * `onDidChangeContent`. The service only overwrites an attached buffer when
 * its draft is clean (e.g. storage-sync "take remote"), so a stale store value
 * can never clobber in-progress typing.
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

  const sync = () => {
    scheduled = null;

    const state = store.getState();
    const scripts = Object.values(state.userscripts.scripts ?? {});
    const drafts = state.editorDrafts.drafts;
    const currentScript = state.userscripts.currentUserscript;

    // Cheap change detection: draft revisions capture buffer edits, updatedAt
    // and moduleName capture metadata changes, current script + its module
    // list capture CDN acquisition inputs. Avoids hashing source contents.
    const modules = state.modules.modules ?? {};

    const signature = JSON.stringify([
      scripts.map((script) => [
        script.id,
        getScriptModulePath(script),
        script.updatedAt,
        drafts[script.id]?.revision ?? -1,
      ]),
      currentScript?.id,
      currentScript?.globalModules,
      Object.values(modules).map((module) => [module.id, module.packageName]),
    ]);

    if (signature === lastSignature) {
      return;
    }

    lastSignature = signature;

    const plan = buildWorkspaceSyncPlan({
      scripts,
      drafts,
      currentScriptId: currentScript?.id,
      currentGlobalModules: currentScript?.globalModules,
      modules,
    });

    const scriptById = new Map(scripts.map((script) => [script.id, script]));
    const files: WorkspaceFile[] = [];
    const modulePaths: string[] = [];

    for (const buffer of plan.buffers) {
      const script = scriptById.get(buffer.scriptId);

      if (!script) {
        continue;
      }

      modulePaths.push(buffer.modulePath);

      files.push(
        {
          uri: buildScriptFileUri(script, "main"),
          language: "typescript",
          contents: buffer.main.contents,
          preserveAttachedBuffer: buffer.main.dirty,
        },
        {
          uri: buildScriptFileUri(script, "types"),
          language: "typescript",
          contents: buffer.types.contents,
          preserveAttachedBuffer: buffer.types.dirty,
        },
        {
          uri: buildScriptFileUri(script, "styles"),
          language: "scss",
          contents: buffer.styles.contents,
          preserveAttachedBuffer: buffer.styles.dirty,
        }
      );
    }

    syncModulePackageJsons(modulePaths);
    syncWorkspaceModels(files);
    syncAmbientTypeDefinitionLibs(plan.ambientLibs);

    // CDN type acquisition is scoped to the open script and never blocks.
    void syncCdnModuleLibs(plan.cdnModules).catch((error) => {
      console.warn("CDN type acquisition failed:", error);
    });
  };

  const unsubscribe = store.subscribe(() => {
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
