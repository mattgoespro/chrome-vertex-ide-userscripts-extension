import {
  buildUserscriptJavascript,
  buildUserscriptStylesheet,
  getCompiledOutputBuildOptions,
} from "@/sandbox/compiler";
import { buildCompiledCodeEntry } from "@shared/compile-metadata";
import type { CompiledCodeEntry, Userscript } from "@shared/model";
import type { RootState } from "../../store";

export function getBuildOptions(state: RootState) {
  return getCompiledOutputBuildOptions(state.settings.editorSettings);
}

export async function compileJavascriptOrThrow(
  script: Userscript,
  state: RootState
): Promise<string> {
  const result = await buildUserscriptJavascript(
    script,
    script.code.source.typescript,
    getBuildOptions(state)
  );

  if (!result.success) {
    throw new Error(
      `TypeScript compilation error: ${result.error?.message ?? "Unknown error"}`
    );
  }

  return result.code ?? "";
}

export async function compileStylesheetOrThrow(
  script: Userscript,
  state: RootState
): Promise<string> {
  const result = await buildUserscriptStylesheet(
    script.code.source.scss,
    getBuildOptions(state)
  );

  if (!result.success) {
    throw new Error(
      `SCSS compilation error: ${result.error?.message ?? "Unknown error"}`
    );
  }

  return result.code ?? "";
}

export async function compileAllOutputsOrThrow(
  script: Userscript,
  state: RootState
): Promise<CompiledCodeEntry> {
  const [javascript, css] = await Promise.all([
    compileJavascriptOrThrow(script, state),
    compileStylesheetOrThrow(script, state),
  ]);

  return buildCompiledCodeEntry(javascript, css, getBuildOptions(state));
}
