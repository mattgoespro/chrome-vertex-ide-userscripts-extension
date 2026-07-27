import {
  buildScriptFileUri,
  ensureTypescriptDefaults,
  registerModuleSpecifierCompletion,
  syncAmbientTypeDefinitionLibs,
  syncCdnModuleLibs,
  syncModulePackageJsons,
  syncWorkspaceModels,
  type CdnModuleInfo,
  type SharedModuleSpecifierInfo,
  type WorkspaceFile,
} from "@packages/monaco";
import { getScriptModulePath, Userscript } from "@shared/model";
import type { AppStore, RootState } from "../store/store";
import type { EditorDraft } from "../store/slices/editor-drafts";
import { registerBespokeCodeActions } from "../utils/quick-fix-provider";
import {
  isModuleDeclarationFile,
  stripExportsForAmbientLib,
} from "./ambient-type-defs";

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

function getDraftBuffer(
  script: Userscript,
  draft: EditorDraft | undefined,
  buffer: "typescript" | "scss" | "typeDefinitions"
): { contents: string; dirty: boolean } {
  if (!draft) {
    return {
      contents:
        buffer === "typeDefinitions"
          ? (script.typeDefinitions ?? "")
          : script.code.source[buffer],
      dirty: false,
    };
  }

  return { contents: draft[buffer], dirty: draft.dirty[buffer] };
}

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

    const files: WorkspaceFile[] = [];
    const modulePaths: string[] = [];
    const ambientLibs: Array<{
      id: string;
      filePath: string;
      contents: string;
    }> = [];

    for (const script of scripts) {
      const modulePath = getScriptModulePath(script);
      const draft = drafts[script.id];
      const main = getDraftBuffer(script, draft, "typescript");
      const types = getDraftBuffer(script, draft, "typeDefinitions");
      const styles = getDraftBuffer(script, draft, "scss");

      modulePaths.push(modulePath);

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
        },
        {
          uri: buildScriptFileUri(script, "styles"),
          language: "scss",
          contents: styles.contents,
          preserveAttachedBuffer: styles.dirty,
        }
      );

      // Type panes that are modules lose their global visibility; register an
      // export-stripped ambient copy alongside the real model. Non-module
      // panes are already global via the model itself. Skip the open script's
      // own type pane — the real model is already attached to its editor and
      // an ambient copy would duplicate its declarations.
      if (
        script.id !== currentScript?.id &&
        isModuleDeclarationFile(types.contents)
      ) {
        const ambientContents = stripExportsForAmbientLib(types.contents);

        if (ambientContents.trim()) {
          ambientLibs.push({
            id: `ambient:${script.id}`,
            filePath: `file:///scripts/${modulePath}/types.ambient.d.ts`,
            contents: ambientContents,
          });
        }
      }
    }

    syncModulePackageJsons(modulePaths);
    syncWorkspaceModels(files);
    syncAmbientTypeDefinitionLibs(ambientLibs);

    // CDN type acquisition is scoped to the open script and never blocks.
    const cdnModules: CdnModuleInfo[] = (currentScript?.globalModules ?? [])
      .map((id) => state.modules.modules[id])
      .filter((module) => module?.packageName)
      .map((module) => ({ id: module.id, packageName: module.packageName! }));

    void syncCdnModuleLibs(cdnModules).catch((error) => {
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
