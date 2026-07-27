import * as monaco from "monaco-editor";
import {
  getModuleSpecifierSuggestions,
  matchScriptsSpecifierPrefix,
  SharedModuleSpecifierInfo,
} from "./module-specifier-helpers";

export type { SharedModuleSpecifierInfo } from "./module-specifier-helpers";
export {
  getModuleSpecifierSuggestions,
  matchScriptsSpecifierPrefix,
} from "./module-specifier-helpers";

/**
 * Completion for `"scripts/<module>/<main|types>"` import specifiers.
 *
 * This is the single piece of import intellisense the TypeScript worker cannot
 * provide natively: Monaco's worker host implements neither `readDirectory`
 * nor `getDirectories`, so the language service cannot enumerate `paths`
 * pattern matches inside string literals (verified by the Phase 0 spike in
 * tests/monaco-worker-vfs.test.mjs). Everything else — named-import member
 * completion, hover, auto-import, diagnostics — comes from the worker against
 * the real script models.
 *
 * The provider is purely data-driven: it renders whatever the supplied getter
 * returns and contains no source-code analysis.
 */

export function registerModuleSpecifierCompletion(
  getSharedModules: () => SharedModuleSpecifierInfo[]
): monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider("typescript", {
    triggerCharacters: ["/", '"', "'"],
    provideCompletionItems(model, position) {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const typedPath = matchScriptsSpecifierPrefix(textUntilPosition);

      if (typedPath === null) {
        return { suggestions: [] };
      }

      const word = model.getWordUntilPosition(position);
      const replaceRange = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        position.column
      );

      const suggestions = getModuleSpecifierSuggestions(
        typedPath,
        getSharedModules()
      );

      return {
        suggestions: suggestions.map((suggestion) => ({
          label: suggestion.label,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: suggestion.insertText,
          range: replaceRange,
          detail: suggestion.detail,
          ...(suggestion.kind === "module-entry"
            ? { documentation: suggestion.documentation }
            : {}),
        })),
      };
    },
  });
}
