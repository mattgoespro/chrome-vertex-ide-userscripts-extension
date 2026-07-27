/** Matches TypeScript's module detection for declaration files closely enough
 * for UI purposes: a top-level `import`/`export` makes the file a module. */
export function isModuleDeclarationFile(contents: string): boolean {
  return /^\s*(?:export|import)\b/m.test(contents);
}

/**
 * Strips top-level `export` keywords from type definition content before
 * registering it as an ambient (globally-visible) extra lib.
 *
 * A `.d.ts` file containing any top-level `export` is a module — its
 * declarations become module-scoped and require an explicit `import`.
 * The stripped ambient copy keeps them globally visible as well, matching the
 * long-standing behavior where a script's type pane declares page globals.
 * The real `types.d.ts` model still carries the exports, so
 * `import type { X } from "scripts/<m>/types"` resolves normally.
 */
export function stripExportsForAmbientLib(typeDefinitions: string): string {
  return (
    typeDefinitions
      // Strip `export` from named declarations: `export type X` → `type X`.
      // The negative lookahead prevents `export type { X }` from being matched
      // here; that form is a re-export and is removed by the next rule.
      .replace(
        /^export\s+(type(?!\s*\{)|interface|const|let|var|function|class|enum|declare|abstract)\b/gm,
        "$1"
      )
      // Remove named re-exports: `export { X }`, `export type { X }`,
      // `export { X } from '...'`, `export type { X } from '...'`.
      .replace(
        /^export\s*(?:type\s+)?\{[^}]*\}(?:\s*from\s*["'][^"']*["'])?\s*;?\s*$/gm,
        ""
      )
      // Remove namespace re-exports: `export * from '...'`, `export * as X from '...'`.
      .replace(
        /^export\s*\*(?:\s*as\s+\w+)?\s*from\s*["'][^"']*["']\s*;?\s*$/gm,
        ""
      )
  );
}
