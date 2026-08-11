import { CodeEditor, CodeEditorProps } from "../../shared/CodeEditor";

/**
 * TypeScript variant of {@link CodeEditor}.
 *
 * All language-service state — script models, module package.json entries,
 * ambient type libs, and CDN type acquisition — is owned by the
 * WorkspaceService, so mounting an editor performs no synchronization and CDN
 * type fetches never block or unmount it.
 */
export function TypeScriptCodeEditor(
  props: Omit<CodeEditorProps, "language">
) {
  return <CodeEditor {...props} language="typescript" />;
}
