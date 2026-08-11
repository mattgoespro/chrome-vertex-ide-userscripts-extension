import type { Userscript } from "@shared/model";
import type { EditorDraft } from "../store/slices/editor-drafts/state.editor-drafts";

export type DraftBufferContents = {
  contents: string;
  dirty: boolean;
};

/**
 * Resolve the effective buffer contents for workspace sync: prefer the draft
 * when present, otherwise the saved script. `dirty` drives
 * `preserveAttachedBuffer` so a stale store value cannot clobber in-progress typing.
 */
export function getDraftBuffer(
  script: Userscript,
  draft: EditorDraft | undefined,
  buffer: "typescript" | "scss" | "typeDefinitions"
): DraftBufferContents {
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
