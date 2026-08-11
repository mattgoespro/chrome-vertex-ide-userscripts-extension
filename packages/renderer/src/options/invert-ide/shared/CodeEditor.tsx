import { FormatterLanguage } from "@/sandbox/formatter";
import { useToast } from "@/shared/components/toast/ToastProvider";
import { useAppDispatch, useAppSelector } from "@/shared/store/hooks";
import { saveEditorCode } from "@/shared/store/slices/code-editor/thunks.code-editor";
import { selectEditorSettings } from "@/shared/store/slices/settings";
import { formatMatchingTabsToast } from "@/shared/store/slices/userscripts/messaging";
import { EditorSettings } from "@shared/model";
import {
  attachWorkspaceModel,
  buildModelUri,
  disposeDetachedModel,
  getOrCreateDetachedModel,
} from "@packages/monaco";
import * as monaco from "monaco-editor";
import { useEffect, useRef } from "react";

export type CodeEditorProps = {
  modelId: string;
  /**
   * Present for script buffers: the model is owned by the workspace (created
   * up front, content-synced by the WorkspaceService, never disposed by the
   * editor). Absent for auxiliary editors (previews, compiled output) whose
   * detached models this component owns and disposes.
   *
   * Monaco → draft flush on script switch is owned by `selectUserscript`, not
   * by this component's unmount path.
   */
  scriptId?: string;
  contents: string;
  language: FormatterLanguage;
  editable?: boolean;
  settingsOverride?: Partial<EditorSettings>;
  onCodeModified?: (value: string) => void;
  onSave?: (args: {
    code: string;
    language: FormatterLanguage;
    autoFormat: boolean;
    scriptId?: string;
  }) => Promise<string | void>;
  onEditorReady?: (editor: monaco.editor.IStandaloneCodeEditor) => void;
};

export function CodeEditor(props: CodeEditorProps) {
  const {
    modelId,
    scriptId,
    language,
    contents,
    settingsOverride,
    editable = true,
    onCodeModified,
    onSave,
    onEditorReady,
  } = props;

  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const appEditorSettings = useAppSelector(selectEditorSettings);
  const settings = settingsOverride
    ? { ...appEditorSettings, ...settingsOverride }
    : appEditorSettings;

  const editorRootRef = useRef<HTMLDivElement>(null);
  const editorInstanceRef = useRef<monaco.editor.IStandaloneCodeEditor>(null);
  const onCodeModifiedRef = useRef(onCodeModified);
  const onEditorReadyRef = useRef(onEditorReady);
  const isWorkspaceModel = scriptId != null;

  useEffect(() => {
    if (!editorRootRef.current) {
      return;
    }

    const editorInstance = monaco.editor.create(editorRootRef.current, {
      automaticLayout: true,
      cursorBlinking: editable ? "blink" : "solid",
      cursorStyle: editable ? "line" : "underline-thin",
      cursorWidth: editable ? undefined : 0,
      domReadOnly: !editable,
      fixedOverflowWidgets: true,
      fontSize: settings.fontSize,
      hideCursorInOverviewRuler: true,
      lineNumbers: editable ? "on" : "off",
      matchBrackets: editable ? "always" : "never",
      minimap: { enabled: false },
      occurrencesHighlight: editable ? "singleFile" : "off",
      padding: { top: 25, bottom: 10 },
      readOnly: !editable,
      renderLineHighlight: editable ? "gutter" : "none",
      bracketPairColorization: {
        enabled: true,
      },
      stickyScroll: { enabled: false },
      scrollbar: {
        vertical: "hidden",
        horizontal: "hidden",
        useShadows: false,
        verticalScrollbarSize: 0,
        horizontalScrollbarSize: 0,
        handleMouseWheel: editable,
      },
      scrollBeyondLastLine: editable,
      selectionHighlight: editable,
      theme: settings.theme,
      wordWrap: "on",
    });

    editorInstanceRef.current = editorInstance;

    return () => {
      const model = editorInstance.getModel();
      const modelUri =
        model && !model.isDisposed() ? model.uri.toString() : null;

      editorInstance.setModel(null);
      editorInstance.dispose();
      editorInstanceRef.current = null;

      // Workspace models outlive editors; detached preview models don't.
      if (!isWorkspaceModel && modelUri) {
        disposeDetachedModel(modelUri);
      }
    };
  }, []);

  useEffect(() => {
    onCodeModifiedRef.current = onCodeModified;
  }, [onCodeModified]);

  useEffect(() => {
    onEditorReadyRef.current = onEditorReady;
  }, [onEditorReady]);

  useEffect(() => {
    monaco.editor.setTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    editorInstanceRef.current?.updateOptions({ fontSize: settings.fontSize });
  }, [settings.fontSize]);

  // Attach the model for this URI and forward buffer changes.
  useEffect(() => {
    const editorInstance = editorInstanceRef.current;

    if (!editorInstance) {
      return;
    }

    const uri = buildModelUri(modelId, language);
    const model = isWorkspaceModel
      ? attachWorkspaceModel(editorInstance, uri, language, contents)
      : getOrCreateDetachedModel(uri, language, contents);

    if (editorInstance.getModel() !== model) {
      editorInstance.setModel(model);
    }

    onEditorReadyRef.current?.(editorInstance);

    const disposable = model.onDidChangeContent(() => {
      onCodeModifiedRef.current?.(model.getValue());
    });

    return () => {
      disposable.dispose();
    };
  }, [modelId, language, isWorkspaceModel, contents]);

  // Detached preview models have no workspace sync; mirror the contents prop.
  useEffect(() => {
    if (isWorkspaceModel) {
      return;
    }

    const model = editorInstanceRef.current?.getModel();

    if (model && !model.isDisposed() && model.getValue() !== contents) {
      model.setValue(contents);
    }
  }, [contents, isWorkspaceModel, modelId, language]);

  useEffect(() => {
    if (!editable || !scriptId || !editorRootRef.current) {
      return;
    }

    const editorElement = editorRootRef.current;

    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        e.stopPropagation();

        const editorInstance = editorInstanceRef.current;

        if (!editorInstance) {
          return;
        }

        const code = editorInstance.getValue();
        const autoFormat = settings?.autoFormat ?? false;

        const result = onSave
          ? await onSave({
              code,
              language,
              autoFormat,
              scriptId,
            })
          : await dispatch(
              saveEditorCode({
                scriptId,
                language,
                code,
                autoFormat,
              })
            ).unwrap();

        if (
          result &&
          typeof result === "object" &&
          "appliedTabCount" in result &&
          typeof result.appliedTabCount === "number"
        ) {
          toast({
            variant: "info",
            message: formatMatchingTabsToast(
              result.appliedTabCount,
              "Applied to"
            ),
          });
        }

        const savedCode =
          typeof result === "string"
            ? result
            : result &&
                typeof result === "object" &&
                "code" in result &&
                typeof result.code === "string"
              ? result.code
              : code;

        const model = editorInstance.getModel();

        if (!model || model.getValue() === savedCode) {
          return;
        }

        // Apply formatting through executeEdits to preserve the cursor and
        // undo stack. The resulting change event round-trips through the
        // draft store, which no-ops on identical content.
        const savedSelections = editorInstance.getSelections() ?? [];

        editorInstance.executeEdits(
          "prettier-format",
          [{ range: model.getFullModelRange(), text: savedCode }],
          savedSelections
        );
      }
    };

    editorElement.addEventListener("keydown", handleKeyDown);

    return () => editorElement.removeEventListener("keydown", handleKeyDown);
  }, [editable, scriptId, settings?.autoFormat, language, dispatch, onSave, toast]);

  return <div ref={editorRootRef} className="h-full w-full min-w-0"></div>;
}
