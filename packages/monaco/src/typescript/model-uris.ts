import { getScriptModulePath, UserscriptSourceLanguage } from "@shared/model";

/**
 * Map source language identifiers to file extensions recognised by
 * the Monaco TypeScript worker's module resolution.
 */
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  typescript: "ts",
  scss: "scss",
};

export type ScriptEditorKind = "main" | "types" | "styles";

/**
 * Canonical workspace model id for a script editor buffer
 * (`scripts/<modulePath>/main|types.d|styles`).
 */
export function buildScriptModelId(
  script: { id: string; moduleName?: string },
  editor: ScriptEditorKind
): string {
  const modulePath = getScriptModulePath(script);

  if (editor === "types") {
    return `scripts/${modulePath}/types.d`;
  }

  return `scripts/${modulePath}/${editor}`;
}

/**
 * Monaco `file:///` URI for a model id and source language.
 */
export function buildModelUri(
  modelId: string,
  language: UserscriptSourceLanguage
): string {
  const ext = LANGUAGE_EXTENSIONS[language] ?? language;
  return `file:///${modelId}.${ext}`;
}

/**
 * Monaco URI for a script's main / types / styles buffer.
 */
export function buildScriptFileUri(
  script: { id: string; moduleName?: string },
  editor: ScriptEditorKind
): string {
  return buildModelUri(
    buildScriptModelId(script, editor),
    editor === "styles" ? "scss" : "typescript"
  );
}
