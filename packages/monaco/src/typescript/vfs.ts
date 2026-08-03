import { UserscriptSourceLanguage } from "@shared/model";
import * as monaco from "monaco-editor";

export {
  buildModelUri,
  buildScriptFileUri,
  buildScriptModelId,
  type ScriptEditorKind,
} from "./model-uris";

/**
 * The workspace virtual file system.
 *
 * Open script files are real Monaco text models at canonical
 * `file:///scripts/<module>/...` URIs. The workspace service keeps models for
 * the active script, its import / sharedScripts closure, every shared module
 * (so switching away does not dispose modules other scripts still import),
 * and dirty offscreen drafts. Because the TypeScript language service runs
 * with eager model sync, the worker sees these models as actual program files:
 * `import { x } from "scripts/<module>/main"` resolves through the
 * `baseUrl`/`paths` mapping straight to the dependency's real source — no
 * generated declaration files, no suppression listeners.
 *
 * Monaco's own model registry (keyed by URI) is the single source of truth;
 * this module only tracks which URIs the workspace owns so orphaned models can
 * be disposed exactly, without substring matching.
 */

export interface WorkspaceFile {
  uri: string;
  language: UserscriptSourceLanguage;
  contents: string;
  /**
   * When true and the model is currently attached to an editor, its buffer is
   * left untouched (the editor owns it — content flows back through
   * `onDidChangeContent`). Detached models are always updated.
   */
  preserveAttachedBuffer?: boolean;
}

// ── Model registry ────────────────────────────────────────────────────────────

/** URIs whose models are owned (created/synced/disposed) by the workspace. */
const workspaceOwnedUris = new Set<string>();

/** One-shot detach listeners for models awaiting disposal. */
const pendingDetachDisposals = new Map<string, monaco.IDisposable>();

function getExistingModel(uri: string): monaco.editor.ITextModel | null {
  const model = monaco.editor.getModel(monaco.Uri.parse(uri));
  return model && !model.isDisposed() ? model : null;
}

/**
 * Replaces a model's full contents while preserving the undo stack, unlike
 * `setValue()` which resets it.
 */
function replaceModelContents(
  model: monaco.editor.ITextModel,
  contents: string
): void {
  if (model.getValue() === contents) {
    return;
  }

  model.pushEditOperations(
    [],
    [{ range: model.getFullModelRange(), text: contents }],
    () => null
  );
}

function createModel(
  uri: string,
  language: UserscriptSourceLanguage,
  contents: string
): monaco.editor.ITextModel {
  return monaco.editor.createModel(contents, language, monaco.Uri.parse(uri));
}

/**
 * Creates or updates a workspace-owned model. The content-equality guard here
 * and the draft-store equality guard on the editor side make the sync loop
 * idempotent, so no suppression flags are needed.
 */
export function upsertWorkspaceModel(
  uri: string,
  language: UserscriptSourceLanguage,
  contents: string,
  options?: { preserveAttachedBuffer?: boolean }
): monaco.editor.ITextModel {
  cancelPendingDisposal(uri);
  workspaceOwnedUris.add(uri);

  const existing = getExistingModel(uri);

  if (existing) {
    const skipWrite =
      options?.preserveAttachedBuffer && existing.isAttachedToEditor();

    if (!skipWrite) {
      replaceModelContents(existing, contents);
    }

    return existing;
  }

  return createModel(uri, language, contents);
}

function cancelPendingDisposal(uri: string): void {
  const pending = pendingDetachDisposals.get(uri);

  if (pending) {
    pending.dispose();
    pendingDetachDisposals.delete(uri);
  }
}

/**
 * Disposes a workspace-owned model by exact URI. Models still attached to an
 * editor are disposed once the editor detaches, via a one-shot listener.
 */
export function removeWorkspaceModel(uri: string): void {
  workspaceOwnedUris.delete(uri);

  const model = getExistingModel(uri);

  if (!model) {
    cancelPendingDisposal(uri);
    return;
  }

  if (!model.isAttachedToEditor()) {
    cancelPendingDisposal(uri);
    model.dispose();
    return;
  }

  if (pendingDetachDisposals.has(uri)) {
    return;
  }

  const listener = model.onDidChangeAttached(() => {
    if (!model.isAttachedToEditor()) {
      listener.dispose();
      pendingDetachDisposals.delete(uri);

      // Defer disposal until after Monaco finishes setModel/detach. Disposing
      // synchronously inside this callback races Monaco's own detach cleanup
      // ("Model is disposed!") and can crash the React tree.
      queueMicrotask(() => {
        if (!workspaceOwnedUris.has(uri) && !model.isDisposed()) {
          model.dispose();
        }
      });
    }
  });

  pendingDetachDisposals.set(uri, listener);
}

/**
 * Reconciles the set of workspace-owned models with the desired file list:
 * upserts every desired file first, then disposes owned models that are no
 * longer present. Upsert-before-dispose avoids a gap where a dependency is
 * removed before its replacement (or re-upsert) is registered — that gap made
 * TypeScript briefly (or sticky) report missing `scripts/<m>/main` modules.
 */
export function syncWorkspaceModels(files: WorkspaceFile[]): void {
  const desiredUris = new Set(files.map((file) => file.uri));

  for (const file of files) {
    upsertWorkspaceModel(file.uri, file.language, file.contents, {
      preserveAttachedBuffer: file.preserveAttachedBuffer,
    });
  }

  for (const uri of [...workspaceOwnedUris]) {
    if (!desiredUris.has(uri)) {
      removeWorkspaceModel(uri);
    }
  }
}

/**
 * Resolves (creating if necessary) the model for a script file and attaches it
 * to the given editor. The model joins the workspace registry so external
 * content updates flow into it through `syncWorkspaceModels`.
 */
export function attachWorkspaceModel(
  editor: monaco.editor.IStandaloneCodeEditor,
  uri: string,
  language: UserscriptSourceLanguage,
  initialContents: string
): monaco.editor.ITextModel {
  const model =
    getExistingModel(uri) ??
    upsertWorkspaceModel(uri, language, initialContents);

  if (editor.getModel() !== model) {
    editor.setModel(model);
  }

  return model;
}

/**
 * Creates or reuses a model that is NOT workspace-owned — used by auxiliary
 * read-only editors (compiled output preview, theme preview). The caller is
 * responsible for disposing it via `disposeDetachedModel`.
 */
export function getOrCreateDetachedModel(
  uri: string,
  language: UserscriptSourceLanguage,
  contents: string
): monaco.editor.ITextModel {
  const existing = getExistingModel(uri);

  if (existing) {
    return existing;
  }

  return createModel(uri, language, contents);
}

export function disposeDetachedModel(uri: string): void {
  if (workspaceOwnedUris.has(uri)) {
    return;
  }

  const model = getExistingModel(uri);

  if (model && !model.isAttachedToEditor()) {
    model.dispose();
  }
}
