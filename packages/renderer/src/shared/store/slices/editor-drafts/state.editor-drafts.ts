import { Userscript } from "@shared/model";

export type DraftBuffer = "typescript" | "scss" | "typeDefinitions";

export type EditorDraft = {
  typescript: string;
  scss: string;
  typeDefinitions: string;
  dirty: Record<DraftBuffer, boolean>;
  revision: number;
  /** Request id of the most recent commitDraftForSave per buffer. */
  lastSaveRequestId: Partial<Record<DraftBuffer, string>>;
};

export type RemoteDraftConflictBuffer = {
  buffer: DraftBuffer;
  local: string;
  remote: string;
};

export type RemoteDraftConflict = {
  scriptId: string;
  scriptName: string;
  remoteScript: Userscript;
  buffers: RemoteDraftConflictBuffer[];
};

export type EditorDraftsState = {
  drafts: Record<string, EditorDraft>;
  pendingConflicts: Record<string, RemoteDraftConflict>;
};

export const initialState: EditorDraftsState = {
  drafts: {},
  pendingConflicts: {},
};

export function draftFromScript(script: Userscript): EditorDraft {
  return {
    typescript: script.code.source.typescript,
    scss: script.code.source.scss,
    typeDefinitions: script.typeDefinitions ?? "",
    dirty: {
      typescript: false,
      scss: false,
      typeDefinitions: false,
    },
    revision: 0,
    lastSaveRequestId: {},
  };
}

export function isDraftDirty(draft: EditorDraft | undefined): boolean {
  if (!draft) {
    return false;
  }

  return Object.values(draft.dirty).some(Boolean);
}

export function bumpDraftRevision(
  existing: EditorDraft,
  script: Userscript
): EditorDraft {
  return {
    ...draftFromScript(script),
    revision: existing.revision + 1,
  };
}

/**
 * Maps a source-language save arg to the draft buffer it mutates.
 */
export function draftBufferForCodeLanguage(
  language: "typescript" | "scss"
): DraftBuffer {
  return language === "typescript" ? "typescript" : "scss";
}

/**
 * Whether a rejected save should restore dirty for a buffer.
 * Only the latest committed in-flight save for that buffer may restore dirty;
 * a superseded rejection must not flip the flag after a newer save committed.
 */
export function shouldRestoreDirtyOnSaveRejection(
  lastSaveRequestId: string | undefined,
  rejectedRequestId: string
): boolean {
  return lastSaveRequestId === rejectedRequestId;
}
