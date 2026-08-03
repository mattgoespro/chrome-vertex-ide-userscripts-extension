import { registerMonaco } from "@packages/monaco";
import { createAction, createAsyncThunk } from "@reduxjs/toolkit/react";
import { updateUserscriptCode } from "../userscripts/thunks.userscripts";
import { PrettierFormatter } from "@/sandbox/formatter";
import { UserscriptSourceLanguage } from "@shared/model";
import { sendApplyScriptsMessage } from "../userscripts/messaging";

export const setIdeReady = createAction<boolean>("code-editor/setIdeReady");

export const initializeMonaco = createAsyncThunk(
  "code-editor/initializeMonaco",
  async () => {
    await registerMonaco();
  }
);

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

    await dispatch(
      updateUserscriptCode({ id: scriptId, language, code: formattedCode })
    ).unwrap();

    const applyResult = await sendApplyScriptsMessage([scriptId]);

    return {
      code: formattedCode,
      appliedTabCount: applyResult.appliedTabCount,
    };
  }
);
