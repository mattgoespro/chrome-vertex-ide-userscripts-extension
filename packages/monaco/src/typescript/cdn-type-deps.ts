const TRIPLE_SLASH_PATH_PATTERN =
  /^\s*\/\/\/\s*<reference\s+path\s*=\s*["']([^"']+)["']/gm;
const TRIPLE_SLASH_TYPES_PATTERN =
  /^\s*\/\/\/\s*<reference\s+types\s*=\s*["']([^"']+)["']/gm;
const RELATIVE_SPECIFIER_PATTERN =
  /(?:^|\n)\s*(?:import|export)\b[^\n]*?from\s*["'](\.[^"']+)["']|(?:^|\n)\s*import\s*\(\s*["'](\.[^"']+)["']\s*\)/g;

/**
 * Resolves a relative path against a `.d.ts` file path inside an `@types`
 * package, appending `.d.ts` when the specifier omits an extension.
 */
export function normalizeRelativePath(
  fromFile: string,
  relative: string
): string {
  const baseSegments = fromFile.split("/").slice(0, -1);
  const segments = relative.split("/");

  for (const segment of segments) {
    if (segment === "." || segment === "") {
      continue;
    }

    if (segment === "..") {
      baseSegments.pop();
      continue;
    }

    baseSegments.push(segment);
  }

  let path = baseSegments.join("/");

  if (!path.endsWith(".d.ts")) {
    path = path.endsWith(".ts") ? path : `${path}.d.ts`;
  }

  return path;
}

/**
 * Collects intra-package file references and transitive `@types` package names
 * from a single declaration file's contents.
 */
export function extractFileDependencies(
  filePath: string,
  contents: string
): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();

  for (const match of contents.matchAll(TRIPLE_SLASH_PATH_PATTERN)) {
    files.add(normalizeRelativePath(filePath, match[1]));
  }

  for (const match of contents.matchAll(TRIPLE_SLASH_TYPES_PATTERN)) {
    packages.add(match[1]);
  }

  for (const match of contents.matchAll(RELATIVE_SPECIFIER_PATTERN)) {
    const specifier = match[1] ?? match[2];

    if (specifier) {
      files.add(normalizeRelativePath(filePath, specifier));
    }
  }

  return { files: [...files], packages: [...packages] };
}
