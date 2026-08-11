import { CompilationError } from "@shared/errors";
import { uuid } from "@shared/utils";
import * as monaco from "monaco-editor";

/**
 * Converts TypeScript diagnostics to CompilationError format
 */
export function convertTsDiagnosticsToErrors(
  scriptId: string,
  diagnostics: monaco.typescript.Diagnostic[]
): CompilationError[] {
  return diagnostics.map((diag) => {
    return {
      id: uuid(),
      scriptId,
      language: "typescript",
      message:
        typeof diag.messageText === "string"
          ? diag.messageText
          : diag.messageText.messageText,
      code: diag.code ? `TS${diag.code}` : undefined,
      severity:
        diag.category === monaco.MarkerSeverity.Error.valueOf()
          ? "error"
          : "warning",
      line: 1, // Will be calculated from model
      column: 1,
      timestamp: Date.now(),
    };
  });
}

/**
 * Sets error markers on a Monaco model
 */
export function setModelErrors(
  model: monaco.editor.ITextModel,
  errors: CompilationError[]
): void {
  const markers: monaco.editor.IMarkerData[] = errors.map((error) => ({
    startLineNumber: error.line,
    startColumn: error.column,
    endLineNumber: error.endLine ?? error.line,
    endColumn: error.endColumn ?? error.column + 1,
    message: error.message,
    severity:
      error.severity === "error"
        ? monaco.MarkerSeverity.Error
        : monaco.MarkerSeverity.Warning,
    code: error.code,
  }));

  monaco.editor.setModelMarkers(model, "invert-ide", markers);
}

/**
 * Clears error markers from a Monaco model
 */
export function clearModelErrors(model: monaco.editor.ITextModel): void {
  monaco.editor.setModelMarkers(model, "invert-ide", []);
}

/**
 * Gets current error markers from a Monaco model
 */
export function getModelErrors(
  model: monaco.editor.ITextModel
): monaco.editor.IMarker[] {
  return monaco.editor.getModelMarkers({ resource: model.uri });
}
