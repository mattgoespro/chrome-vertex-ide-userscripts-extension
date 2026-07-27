import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const sharedRoot = path.resolve(import.meta.dirname, "../packages/shared/src");
const KNOWN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
]);

function resolveSharedSpecifier(specifier) {
  const rest = specifier.slice("@shared/".length);
  const withoutExt = rest.replace(/\.ts$/, "");
  const candidates = [
    path.join(sharedRoot, `${withoutExt}.ts`),
    path.join(sharedRoot, withoutExt, "index.ts"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return pathToFileURL(candidate).href;
    }
  }

  return pathToFileURL(path.join(sharedRoot, `${withoutExt}.ts`)).href;
}

function hasKnownExtension(specifier) {
  const extension = path.extname(specifier).toLowerCase();
  return KNOWN_EXTENSIONS.has(extension);
}

function resolveExtensionlessTs(specifier, parentURL) {
  if (!parentURL || !specifier.startsWith(".")) {
    return null;
  }

  if (hasKnownExtension(specifier)) {
    return null;
  }

  let parentPath;
  try {
    parentPath = fileURLToPath(parentURL);
  } catch {
    return null;
  }

  if (!parentPath.endsWith(".ts") && !parentPath.endsWith(".tsx")) {
    return null;
  }

  const resolvedBase = path.resolve(path.dirname(parentPath), specifier);
  const candidates = [
    `${resolvedBase}.ts`,
    `${resolvedBase}.tsx`,
    path.join(resolvedBase, "index.ts"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return pathToFileURL(candidate).href;
    }
  }

  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@shared/")) {
    return {
      shortCircuit: true,
      url: resolveSharedSpecifier(specifier),
    };
  }

  const extensionless = resolveExtensionlessTs(specifier, context.parentURL);
  if (extensionless) {
    return {
      shortCircuit: true,
      url: extensionless,
    };
  }

  return nextResolve(specifier, context);
}
