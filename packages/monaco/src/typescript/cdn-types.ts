import type * as monaco from "monaco-editor";
import { extractFileDependencies } from "./cdn-type-deps";
import { addTypeLib } from "./defaults";

/**
 * Dependency-aware automatic type acquisition (ATA) for CDN global modules.
 *
 * For each module with a `packageName`, the resolver fetches the package's
 * DefinitelyTyped entry point and then walks its dependency graph:
 * triple-slash `path` references and relative import/export specifiers pull in
 * sibling `.d.ts` files; triple-slash `types` references pull in transitive
 * `@types` packages. Every fetched file is registered with the TypeScript
 * language service at its real `node_modules/@types/...` path so multi-file
 * type packages resolve exactly as they would in a Node project.
 *
 * Results persist in IndexedDB so subsequent sessions skip the network
 * entirely, and registration is non-blocking — editors never wait on it.
 */

type PackageFiles = Record<string, string>;

const CDN_BASES = [
  "https://unpkg.com/@types/",
  "https://cdn.jsdelivr.net/npm/@types/",
];

const MAX_FILES_PER_PACKAGE = 50;
const MAX_TRANSITIVE_PACKAGES = 10;

// ── IndexedDB cache ───────────────────────────────────────────────────────────

const DB_NAME = "invert-ide-type-cache";
const DB_STORE = "packages";
const DB_VERSION = 1;

interface CachedPackage {
  packageName: string;
  fetchedAt: number;
  /** null marks a confirmed "no types available" so we don't refetch. */
  files: PackageFiles | null;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function openTypeCacheDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "packageName" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

let dbPromise: Promise<IDBDatabase | null> | undefined;

function getDb(): Promise<IDBDatabase | null> {
  dbPromise ??= openTypeCacheDb();
  return dbPromise;
}

async function readCachedPackage(
  packageName: string
): Promise<CachedPackage | null> {
  const db = await getDb();

  if (!db) {
    return null;
  }

  return new Promise((resolve) => {
    const request = db
      .transaction(DB_STORE, "readonly")
      .objectStore(DB_STORE)
      .get(packageName);

    request.onsuccess = () => {
      const entry = request.result as CachedPackage | undefined;

      if (!entry || Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
        resolve(null);
        return;
      }

      resolve(entry);
    };
    request.onerror = () => resolve(null);
  });
}

async function writeCachedPackage(entry: CachedPackage): Promise<void> {
  const db = await getDb();

  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    const request = db
      .transaction(DB_STORE, "readwrite")
      .objectStore(DB_STORE)
      .put(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

// ── Fetch + dependency walk ───────────────────────────────────────────────────

async function fetchTypeFile(
  packageName: string,
  filePath: string
): Promise<string | null> {
  for (const base of CDN_BASES) {
    try {
      const response = await fetch(`${base}${packageName}/${filePath}`);

      if (response.ok) {
        return await response.text();
      }
    } catch {
      // Fall through to the next CDN.
    }
  }

  return null;
}

/**
 * Fetches a single `@types` package and its intra-package file graph.
 * Returns the fetched files plus any transitive `@types` package names it
 * references, or `null` when the package has no published types.
 */
async function fetchPackageFileGraph(
  packageName: string
): Promise<{ files: PackageFiles; transitivePackages: string[] } | null> {
  const entry = await fetchTypeFile(packageName, "index.d.ts");

  if (entry === null) {
    return null;
  }

  const files: PackageFiles = { "index.d.ts": entry };
  const transitivePackages = new Set<string>();
  const queue = [...extractFileDependencies("index.d.ts", entry).files];

  for (const pkg of extractFileDependencies("index.d.ts", entry).packages) {
    transitivePackages.add(pkg);
  }

  while (
    queue.length > 0 &&
    Object.keys(files).length < MAX_FILES_PER_PACKAGE
  ) {
    const filePath = queue.shift()!;

    if (files[filePath] !== undefined) {
      continue;
    }

    const contents = await fetchTypeFile(packageName, filePath);

    if (contents === null) {
      continue;
    }

    files[filePath] = contents;

    const deps = extractFileDependencies(filePath, contents);
    queue.push(...deps.files.filter((f) => files[f] === undefined));

    for (const pkg of deps.packages) {
      transitivePackages.add(pkg);
    }
  }

  return { files, transitivePackages: [...transitivePackages] };
}

/**
 * Resolves the complete set of type files for a package, following transitive
 * `@types` references. Results are cached in IndexedDB per package.
 */
export async function acquirePackageTypes(
  rootPackageName: string
): Promise<Map<string, PackageFiles>> {
  const resolved = new Map<string, PackageFiles>();
  const queue = [rootPackageName];
  const visited = new Set<string>();

  while (queue.length > 0 && visited.size < MAX_TRANSITIVE_PACKAGES) {
    const packageName = queue.shift()!;

    if (visited.has(packageName)) {
      continue;
    }

    visited.add(packageName);

    const cached = await readCachedPackage(packageName);

    if (cached) {
      if (cached.files) {
        resolved.set(packageName, cached.files);

        // Re-derive transitive package references from cached contents.
        for (const [filePath, contents] of Object.entries(cached.files)) {
          queue.push(...extractFileDependencies(filePath, contents).packages);
        }
      }

      continue;
    }

    const result = await fetchPackageFileGraph(packageName);

    await writeCachedPackage({
      packageName,
      fetchedAt: Date.now(),
      files: result?.files ?? null,
    });

    if (result) {
      resolved.set(packageName, result.files);
      queue.push(...result.transitivePackages);
    }
  }

  return resolved;
}

// ── Language-service registration ─────────────────────────────────────────────

export interface CdnModuleInfo {
  id: string;
  packageName: string;
}

interface CdnLibEntry {
  disposables: monaco.IDisposable[];
  packageName: string;
}

const cdnLibEntries = new Map<string, CdnLibEntry>();

let syncGeneration = 0;

/**
 * Syncs CDN module type registrations with the provided list. Fetching and
 * registration are asynchronous and incremental: each package's files are
 * registered as soon as they resolve, so editors keep working while types
 * stream in. Disposes registrations for modules no longer in the list.
 */
export async function syncCdnModuleLibs(
  modules: CdnModuleInfo[]
): Promise<void> {
  const generation = ++syncGeneration;
  const currentIds = new Set(modules.map((m) => m.id));

  for (const [id, entry] of cdnLibEntries) {
    if (!currentIds.has(id)) {
      entry.disposables.forEach((d) => d.dispose());
      cdnLibEntries.delete(id);
    }
  }

  await Promise.all(
    modules
      .filter((module) => module.packageName)
      .map(async (module) => {
        const existing = cdnLibEntries.get(module.id);

        if (existing && existing.packageName === module.packageName) {
          return;
        }

        const packages = await acquirePackageTypes(module.packageName);

        // A newer sync superseded this one while fetching.
        if (generation !== syncGeneration) {
          return;
        }

        if (existing) {
          existing.disposables.forEach((d) => d.dispose());
        }

        const disposables: monaco.IDisposable[] = [];

        for (const [packageName, files] of packages) {
          for (const [filePath, contents] of Object.entries(files)) {
            disposables.push(
              addTypeLib(
                contents,
                `file:///node_modules/@types/${packageName}/${filePath}`
              )
            );
          }
        }

        cdnLibEntries.set(module.id, {
          disposables,
          packageName: module.packageName,
        });
      })
  );
}
