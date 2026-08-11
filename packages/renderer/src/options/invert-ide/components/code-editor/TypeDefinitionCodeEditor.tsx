import { PrettierFormatter } from "@/sandbox/formatter";
import { useAppDispatch } from "@/shared/store/hooks";
import { persistScriptBuffers } from "@/shared/store/slices/userscripts/thunks.userscripts";
import { CodeEditor, CodeEditorProps } from "../../shared/CodeEditor";

export function TypeDefinitionCodeEditor(
  props: Omit<CodeEditorProps, "language" | "onSave">
) {
  const dispatch = useAppDispatch();

  return (
    <CodeEditor
      {...props}
      language="typescript"
      onSave={async ({ code, autoFormat, scriptId }) => {
        const formattedCode = autoFormat
          ? await PrettierFormatter.format(code, "typescript")
          : code;

        if (!scriptId) {
          return formattedCode;
        }

        await dispatch(
          persistScriptBuffers({
            scriptId,
            bufferOverrides: { typeDefinitions: formattedCode },
            // Type-only saves historically did not recompile or re-inject.
            applyTabs: false,
            compile: false,
          })
        ).unwrap();

        return formattedCode;
      }}
    />
  );
}
