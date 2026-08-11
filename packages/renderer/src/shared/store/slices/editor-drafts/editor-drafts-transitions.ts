import { Userscript } from "@shared/model";
import {
  bumpDraftRevision,
  draftFromScript,
  DraftBuffer,
  EditorDraft,
  EditorDraftsState,
  RemoteDraftConflict,
} from "./state.editor-drafts";

/**
 * Apply an editor edit to a draft buffer. No-ops when the code is unchanged.
 * Returns true when the draft was mutated.
 */
export function applyUpdateDraftBuffer(
  draft: EditorDraft,
  buffer: DraftBuffer,
  code: string
): boolean {
  if (draft[buffer] === code) {
    return false;
  }

  draft[buffer] = code;
  draft.dirty[buffer] = true;
  draft.revision += 1;
  return true;
}

/**
 * Flush Monaco model text into a draft before a script switch / model reconcile.
 * Always marks dirty and bumps revision when the buffer differs so WorkspaceService
 * sees the update and will not overwrite the attached model with a stale draft.
 * Returns true when the draft was mutated.
 */
export function applyFlushModelToDraft(
  draft: EditorDraft,
  buffer: DraftBuffer,
  code: string
): boolean {
  if (draft[buffer] === code) {
    return false;
  }

  draft[buffer] = code;
  draft.dirty[buffer] = true;
  draft.revision += 1;
  return true;
}

/**
 * Record an in-flight save request id and clear dirty for the committed buffer.
 * Always stores saveRequestId. Only mutates code/dirty/revision when the buffer
 * still needs a commit (code differs or still dirty).
 * Returns true when code/dirty/revision changed (request id is always written).
 */
export function applyCommitDraftForSave(
  draft: EditorDraft,
  buffer: DraftBuffer,
  code: string,
  saveRequestId: string
): boolean {
  draft.lastSaveRequestId[buffer] = saveRequestId;

  if (draft[buffer] === code && !draft.dirty[buffer]) {
    return false;
  }

  draft[buffer] = code;
  draft.dirty[buffer] = false;
  draft.lastSynced[buffer] = code;
  draft.revision += 1;
  return true;
}

/**
 * Replace a draft from a remote script, bumping revision when one already exists.
 */
export function nextDraftFromRemoteScript(
  existing: EditorDraft | undefined,
  script: Userscript
): EditorDraft {
  return existing ? bumpDraftRevision(existing, script) : draftFromScript(script);
}

/**
 * Apply a remote script and clear any pending conflict for that script.
 */
export function applyRemoteScriptAndClearConflict(
  state: EditorDraftsState,
  script: Userscript
): void {
  state.drafts[script.id] = nextDraftFromRemoteScript(
    state.drafts[script.id],
    script
  );
  delete state.pendingConflicts[script.id];
}

/**
 * Keep local draft; only drop the pending conflict entry.
 */
export function applyResolveConflictKeepLocal(
  pendingConflicts: Record<string, RemoteDraftConflict>,
  scriptId: string
): void {
  delete pendingConflicts[scriptId];
}

/**
 * Take remote script contents into the draft and clear the conflict.
 */
export function applyResolveConflictTakeRemote(
  state: EditorDraftsState,
  script: Userscript
): void {
  applyRemoteScriptAndClearConflict(state, script);
}

/**
 * Take remote for many scripts and clear each conflict.
 */
export function applyResolveAllConflictsTakeRemote(
  state: EditorDraftsState,
  scripts: Userscript[]
): void {
  for (const script of scripts) {
    applyRemoteScriptAndClearConflict(state, script);
  }
}

/**
 * Restore dirty after a rejected save when the request id is still current.
 * Returns true when dirty was restored.
 */
export function applySaveRejectionDirtyRestore(
  draft: EditorDraft,
  buffer: DraftBuffer,
  rejectedRequestId: string
): boolean {
  if (draft.lastSaveRequestId[buffer] !== rejectedRequestId) {
    return false;
  }

  draft.dirty[buffer] = true;
  draft.revision += 1;
  return true;
}
