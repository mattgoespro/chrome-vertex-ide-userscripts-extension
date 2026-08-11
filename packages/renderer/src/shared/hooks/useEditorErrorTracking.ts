import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor";
import { useAppDispatch } from "@/shared/store/hooks";
import { setScriptErrors } from "@/shared/store/slices/workspace";
import { CompilationError } from "@shared/errors";
import { uuid } from "@shared/utils";

/**
 * Hook that captures Monaco editor errors and syncs them to Redux store.
 *
 * For TypeScript models, Hint- and Info-severity markers from the language
 * service are also promoted to Warning severity via the "invert-ide" marker
 * owner so they render as yellow squiggly lines in the editor. Without this,
 * they appear in the ErrorPanel but have no visible underline decoration.
 */
export function useEditorErrorTracking(
  scriptId: string | undefined,
  model: monaco.editor.ITextModel | null,
  language: CompilationError["language"]
) {
  const dispatch = useAppDispatch();
  const prevHintsHashRef = useRef("");

  useEffect(() => {
    if (!scriptId || !model) {
      return;
    }

    prevHintsHashRef.current = "";

    // TypeScript models have their diagnostics set by the language service under
    // the "typescript" owner. Reading only that owner prevents the "invert-ide"
    // hint-promotion markers set below from being double-counted.
    const isTypescriptModel =
      language === "typescript" || language === "type-definition";

    const updateErrors = () => {
      const markers = isTypescriptModel
        ? monaco.editor.getModelMarkers({
            resource: model.uri,
            owner: "typescript",
          })
        : monaco.editor.getModelMarkers({ resource: model.uri });

      const errors: CompilationError[] = markers.map((marker) => ({
        id: uuid(),
        scriptId,
        language,
        message: marker.message,
        code:
          typeof marker.code === "string"
            ? marker.code
            : marker.code?.value?.toString(),
        severity:
          marker.severity === monaco.MarkerSeverity.Error ? "error" : "warning",
        line: marker.startLineNumber,
        column: marker.startColumn,
        endLine: marker.endLineNumber,
        endColumn: marker.endColumn,
        timestamp: Date.now(),
      }));

      dispatch(setScriptErrors({ scriptId, language, errors }));

      if (isTypescriptModel) {
        // Markers with severity below Warning (Hint = 1, Info = 2) have no
        // yellow squiggly line in the editor but are shown as warnings in the
        // ErrorPanel. Promote them to Warning severity on the "invert-ide" owner
        // so they get a visible yellow underline. A hash guard prevents the
        // resulting onDidChangeMarkers event from triggering a redundant update.
        const subWarningMarkers = markers.filter(
          (m) =>
            m.severity !== monaco.MarkerSeverity.Error &&
            m.severity !== monaco.MarkerSeverity.Warning
        );

        const hintsHash = subWarningMarkers
          .map(
            (m) =>
              `${m.startLineNumber}:${m.startColumn}:${m.endLineNumber}:${m.endColumn}:${m.message}`
          )
          .join("|");

        if (hintsHash !== prevHintsHashRef.current) {
          prevHintsHashRef.current = hintsHash;

          monaco.editor.setModelMarkers(
            model,
            "invert-ide",
            subWarningMarkers.map((m) => ({
              startLineNumber: m.startLineNumber,
              startColumn: m.startColumn,
              endLineNumber: m.endLineNumber,
              endColumn: m.endColumn,
              message: m.message,
              severity: monaco.MarkerSeverity.Warning,
              code:
                typeof m.code === "string" ? m.code : m.code?.value?.toString(),
              source: m.source,
            }))
          );
        }
      }
    };

    // Update errors initially
    updateErrors();

    // Listen for marker changes
    const disposable = monaco.editor.onDidChangeMarkers((uris) => {
      if (uris.some((uri) => uri.toString() === model.uri.toString())) {
        updateErrors();
      }
    });

    return () => {
      disposable.dispose();
      if (isTypescriptModel && !model.isDisposed()) {
        // Drop any hint-promotion markers so they don't linger on cached models
        // after the editor unmounts.
        monaco.editor.setModelMarkers(model, "invert-ide", []);
      }
    };
  }, [scriptId, model, language, dispatch]);
}
