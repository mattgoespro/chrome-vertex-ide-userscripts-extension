import { getScriptModulePath, GlobalModule, Userscript } from "@shared/model";
import type { EditorDraft } from "../store/slices/editor-drafts/state.editor-drafts";
import {
  isModuleDeclarationFile,
  stripExportsForAmbientLib,
} from "./ambient-type-defs";

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

export type WorkspaceBufferPlan = {
  scriptId: string;
  modulePath: string;
  main: DraftBufferContents;
  types: DraftBufferContents;
  styles: DraftBufferContents;
};

export type AmbientLibPlan = {
  id: string;
  filePath: string;
  contents: string;
};

export type CdnModulePlan = {
  id: string;
  packageName: string;
};

export type WorkspaceSyncPlan = {
  buffers: WorkspaceBufferPlan[];
  ambientLibs: AmbientLibPlan[];
  cdnModules: CdnModulePlan[];
};

/**
 * Pure planning for Monaco workspace reconciliation: per-script buffer
 * contents + dirty flags, ambient type libs for other scripts' module panes,
 * and CDN `@types` acquisition scoped to the open script.
 */
export function buildWorkspaceSyncPlan(args: {
  scripts: Userscript[];
  drafts: Record<string, EditorDraft | undefined>;
  currentScriptId?: string | null;
  currentGlobalModules?: string[];
  modules: Record<string, GlobalModule | undefined>;
}): WorkspaceSyncPlan {
  const {
    scripts,
    drafts,
    currentScriptId,
    currentGlobalModules = [],
    modules,
  } = args;

  const buffers: WorkspaceBufferPlan[] = [];
  const ambientLibs: AmbientLibPlan[] = [];

  for (const script of scripts) {
    const modulePath = getScriptModulePath(script);
    const draft = drafts[script.id];
    const main = getDraftBuffer(script, draft, "typescript");
    const types = getDraftBuffer(script, draft, "typeDefinitions");
    const styles = getDraftBuffer(script, draft, "scss");

    buffers.push({
      scriptId: script.id,
      modulePath,
      main,
      types,
      styles,
    });

    // Type panes that are modules lose their global visibility; register an
    // export-stripped ambient copy alongside the real model. Skip the open
    // script's own type pane — the real model is already attached.
    if (
      script.id !== currentScriptId &&
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

  const cdnModules: CdnModulePlan[] = currentGlobalModules
    .map((id) => modules[id])
    .filter((module): module is GlobalModule => Boolean(module?.packageName))
    .map((module) => ({ id: module.id, packageName: module.packageName! }));

  return { buffers, ambientLibs, cdnModules };
}
