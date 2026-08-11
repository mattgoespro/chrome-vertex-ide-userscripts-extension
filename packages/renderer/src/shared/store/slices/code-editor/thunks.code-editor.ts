import { registerMonaco } from "@packages/monaco";
import { createAction, createAsyncThunk } from "@reduxjs/toolkit/react";
import { persistScriptBuffers } from "../userscripts/thunks.userscripts";
import { PrettierFormatter } from "@/sandbox/formatter";
import { UserscriptSourceLanguage } from "@shared/model";
import type { DraftBuffer } from "../editor-drafts/state.editor-drafts";

export const setIdeReady = createAction<boolean>("code-editor/setIdeReady");

export const initializeMonaco = createAsyncThunk(
  "code-editor/initializeMonaco",
  async () => {
    await registerMonaco();
  }
);

function draftBufferForLanguage(
  language: UserscriptSourceLanguage
): DraftBuffer {
  return language === "typescript" ? "typescript" : "scss";
}

/**
 * Ctrl+S from a code pane: format the focused buffer, then persist all draft
 * buffers through the canonical save path (compile + apply).
 */
export const saveEditorCode = createAsyncThunk(
  "code-editor/saveEditorCode",
  async (
    {
      scriptId,
      language,
      code,
      autoFormat,
    }: {
      scriptId: string;
      language: UserscriptSourceLanguage;
      code: string;
      autoFormat: boolean;
    },
    { dispatch }
  ) => {
    let formattedCode = code;

    if (autoFormat) {
      formattedCode = await PrettierFormatter.format(code, language);
    }

    const result = await dispatch(
      persistScriptBuffers({
        scriptId,
        bufferOverrides: {
          [draftBufferForLanguage(language)]: formattedCode,
        },
        applyTabs: true,
      })
    ).unwrap();

    return {
      code: formattedCode,
      appliedTabCount: result.appliedTabCount,
    };
  }
);
