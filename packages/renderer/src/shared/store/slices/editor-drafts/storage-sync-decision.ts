import { Userscript } from "@shared/model";
import { detectDraftConflict } from "./helpers";
import {
  EditorDraft,
  RemoteDraftConflict,
  isDraftDirty,
} from "./state.editor-drafts";

export type StorageSyncDecision =
  | { action: "keep-dirty-orphan" }
  | { action: "remove" }
  | { action: "sync"; script: Userscript }
  /** Update the entity from remote; leave a dirty draft overlay untouched. */
  | { action: "sync-entity"; script: Userscript }
  | { action: "conflict"; conflict: RemoteDraftConflict };

/**
 * Decides how a storage-sync refresh should treat one script id given the
 * remote manifest entry (if any) and the local draft (if any).
 *
 * - Missing remote + dirty local → keep the orphan draft (user still editing)
 * - Missing remote + clean/absent local → remove the draft
 * - Present remote + no local → sync from remote
 * - Present remote + dirty conflict → enqueue conflict
 * - Present remote + dirty, no conflict → sync entity only (remote snapshot);
 *   draft buffers stay as the open overlay (never merged onto the entity)
 * - Present remote + no conflict → sync from remote (may overwrite clean draft)
 */
export function decideStorageSyncAction(
  scriptId: string,
  localDraft: EditorDraft | undefined,
  remoteScript: Userscript | undefined
): StorageSyncDecision {
  if (!remoteScript) {
    if (localDraft && isDraftDirty(localDraft)) {
      return { action: "keep-dirty-orphan" };
    }

    return { action: "remove" };
  }

  if (!localDraft) {
    return { action: "sync", script: remoteScript };
  }

  const conflict = detectDraftConflict(scriptId, localDraft, remoteScript);

  if (conflict) {
    return { action: "conflict", conflict };
  }

  if (isDraftDirty(localDraft)) {
    // Entity stays the remote/persisted snapshot; UI reads buffers via drafts.
    return { action: "sync-entity", script: remoteScript };
  }

  return { action: "sync", script: remoteScript };
}
