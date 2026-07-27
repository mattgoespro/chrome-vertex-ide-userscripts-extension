/**
 * Pure helpers for `"scripts/<module>/<main|types>"` import-specifier completion.
 * Kept free of Monaco so unit tests can cover matching without loading the editor.
 */

export interface SharedModuleSpecifierInfo {
  moduleName: string;
  scriptName: string;
}

export type ModuleSpecifierSuggestion =
  | {
      kind: "entry";
      moduleName: string;
      entry: "main" | "types";
      label: string;
      insertText: string;
      detail: string;
    }
  | {
      kind: "module-entry";
      moduleName: string;
      entry: "main" | "types";
      label: string;
      insertText: string;
      detail: string;
      documentation: string;
    };

const SPECIFIER_PREFIX_PATTERN =
  /(?:import|export)\s[^\n]*?from\s*["']scripts\/([\w./-]*)$|import\s*\(\s*["']scripts\/([\w./-]*)$/;

/**
 * Returns the typed path after `scripts/` when the cursor is inside a matching
 * import/export specifier, otherwise `null`.
 */
export function matchScriptsSpecifierPrefix(
  textUntilPosition: string
): string | null {
  const match = textUntilPosition.match(SPECIFIER_PREFIX_PATTERN);

  if (!match) {
    return null;
  }

  return match[1] ?? match[2] ?? "";
}

/**
 * Builds completion candidates for a typed `scripts/<path>` prefix.
 */
export function getModuleSpecifierSuggestions(
  typedPath: string,
  sharedModules: SharedModuleSpecifierInfo[]
): ModuleSpecifierSuggestion[] {
  const segmentEnd = typedPath.indexOf("/");

  if (segmentEnd !== -1) {
    const moduleName = typedPath.slice(0, segmentEnd);
    const known = sharedModules.some((info) => info.moduleName === moduleName);

    if (!known) {
      return [];
    }

    return (["main", "types"] as const).map((entry) => ({
      kind: "entry" as const,
      moduleName,
      entry,
      label: entry,
      insertText: entry,
      detail: `scripts/${moduleName}/${entry}`,
    }));
  }

  return sharedModules.flatMap((info) =>
    (["main", "types"] as const).map((entry) => ({
      kind: "module-entry" as const,
      moduleName: info.moduleName,
      entry,
      label: `${info.moduleName}/${entry}`,
      insertText: `${info.moduleName}/${entry}`,
      detail: info.scriptName,
      documentation: `Shared script: ${info.scriptName}`,
    }))
  );
}
