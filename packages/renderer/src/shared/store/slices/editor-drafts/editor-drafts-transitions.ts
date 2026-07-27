import { Userscript } from "@shared/model";
import {
  bumpDraftRevision,
  draftFromScript,
  DraftBuffer,
  EditorDraft,
  EditorDraftsState,
  isDraftDirty,
  RemoteDraftConflict,
} from "./state.editor-drafts";

/**
 * Rebuild the drafts map from scripts, preserving any still-present dirty drafts.
 * Used by initDraftsFromScripts and loadUserscripts.fulfilled.
 */
export function rebuildDraftsPreservingDirty(
  existingDrafts: Record<string, EditorDraft>,
  scripts: Userscript[]
): Record<string, EditorDraft> {
  const nextDrafts: Record<string, EditorDraft> = {};

  for (const script of scripts) {
    const existing = existingDrafts[script.id];

    if (existing && isDraftDirty(existing)) {
      nextDrafts[script.id] = existing;
    } else {
      nextDrafts[script.id] = draftFromScript(script);
    }
  }

  return nextDrafts;
}

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
 * Flush Monaco model text into a draft. Updates the buffer always when different,
 * but only marks dirty + bumps revision when the buffer was previously clean.
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

  if (!draft.dirty[buffer]) {
    draft.dirty[buffer] = true;
    draft.revision += 1;
  }

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
  draft.revision += 1;
  return true;
}

/**
 * Mark a single buffer clean and bump revision. No-ops if draft is missing.
 */
export function applyMarkDraftClean(
  draft: EditorDraft,
  buffer: DraftBuffer
): void {
  draft.dirty[buffer] = false;
  draft.revision += 1;
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
 * Sync a draft from remote without clearing conflicts.
 */
export function applySyncDraftFromRemote(
  drafts: Record<string, EditorDraft>,
  script: Userscript
): void {
  drafts[script.id] = nextDraftFromRemoteScript(drafts[script.id], script);
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

/**
 * Overwrite draft buffers from a successful code save and clear that buffer's dirty.
 */
export function applySuccessfulCodeSave(
  draft: EditorDraft,
  buffer: DraftBuffer,
  code: string
): void {
  draft[buffer] = code;
  draft.dirty[buffer] = false;
  draft.revision += 1;
}
