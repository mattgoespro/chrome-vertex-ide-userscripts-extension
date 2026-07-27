import { Userscript } from "@shared/model";
import {
  bumpDraftRevision,
  DraftBuffer,
  draftFromScript,
  EditorDraft,
  isDraftDirty,
  RemoteDraftConflict,
} from "./state.editor-drafts";

/**
 * Rebuilds the drafts map from scripts while preserving any locally dirty draft.
 * Shared by initDraftsFromScripts and loadUserscripts.fulfilled.
 */
export function buildDraftsPreservingDirty(
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
 * Apply a buffer edit from the editor UI. No-ops when the draft is missing or
 * the code is unchanged. Always bumps revision when content changes.
 */
export function applyUpdateDraftBuffer(
  draft: EditorDraft | undefined,
  buffer: DraftBuffer,
  code: string
): EditorDraft | undefined {
  if (!draft || draft[buffer] === code) {
    return undefined;
  }

  return {
    ...draft,
    [buffer]: code,
    dirty: {
      ...draft.dirty,
      [buffer]: true,
    },
    revision: draft.revision + 1,
  };
}

/**
 * Mark a single buffer clean and bump revision (used after external clean sync).
 */
export function applyMarkDraftClean(
  draft: EditorDraft | undefined,
  buffer: DraftBuffer
): EditorDraft | undefined {
  if (!draft) {
    return undefined;
  }

  return {
    ...draft,
    dirty: {
      ...draft.dirty,
      [buffer]: false,
    },
    revision: draft.revision + 1,
  };
}

/**
 * Flush Monaco model text into the draft. Unlike updateDraftBuffer, revision
 * only bumps when the buffer was previously clean (first dirtying edit).
 * Subsequent flushes while already dirty update code without bumping revision.
 */
export function applyFlushModelToDraft(
  draft: EditorDraft | undefined,
  buffer: DraftBuffer,
  code: string
): EditorDraft | undefined {
  if (!draft || draft[buffer] === code) {
    return undefined;
  }

  const next: EditorDraft = {
    ...draft,
    [buffer]: code,
    dirty: { ...draft.dirty },
  };

  if (!draft.dirty[buffer]) {
    next.dirty[buffer] = true;
    next.revision += 1;
  }

  return next;
}

/**
 * Record an in-flight save request id and clear dirty for the buffer being
 * written. Always stores lastSaveRequestId so rejection handlers can gate on
 * the latest request; skips code/dirty/revision updates when already clean
 * with matching code.
 */
export function applyCommitDraftForSave(
  draft: EditorDraft | undefined,
  buffer: DraftBuffer,
  code: string,
  saveRequestId: string
): EditorDraft | undefined {
  if (!draft) {
    return undefined;
  }

  const next: EditorDraft = {
    ...draft,
    dirty: { ...draft.dirty },
    lastSaveRequestId: {
      ...draft.lastSaveRequestId,
      [buffer]: saveRequestId,
    },
  };

  if (draft[buffer] === code && !draft.dirty[buffer]) {
    return next;
  }

  next[buffer] = code;
  next.dirty[buffer] = false;
  next.revision += 1;

  return next;
}

/**
 * Replace local draft contents with a remote script, bumping revision when a
 * local draft already existed.
 */
export function applyRemoteScriptToDraft(
  existing: EditorDraft | undefined,
  script: Userscript
): EditorDraft {
  return existing
    ? bumpDraftRevision(existing, script)
    : draftFromScript(script);
}

/**
 * Drop a single pending conflict entry (keep-local resolution).
 */
export function clearPendingConflict(
  pendingConflicts: Record<string, RemoteDraftConflict>,
  scriptId: string
): Record<string, RemoteDraftConflict> {
  if (!(scriptId in pendingConflicts)) {
    return pendingConflicts;
  }

  const next = { ...pendingConflicts };
  delete next[scriptId];
  return next;
}

/**
 * Apply remote script to draft and clear that script's pending conflict
 * (take-remote / applyRemoteScript resolution).
 */
export function applyTakeRemoteScript(
  existing: EditorDraft | undefined,
  script: Userscript,
  pendingConflicts: Record<string, RemoteDraftConflict>
): {
  draft: EditorDraft;
  pendingConflicts: Record<string, RemoteDraftConflict>;
} {
  return {
    draft: applyRemoteScriptToDraft(existing, script),
    pendingConflicts: clearPendingConflict(pendingConflicts, script.id),
  };
}
