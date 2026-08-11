import { expandAffectedScriptIds } from "@shared/apply-scope";
import {
  GlobalModule,
  GlobalModules,
  Userscript,
  Userscripts,
} from "@shared/model";
import { resolveSharedScriptIdsFromSourceOrThrow } from "@shared/resolve-shared-scripts";
import { ChromeSyncStorage, CompiledCodeStorage } from "@shared/storage";
import { matchesUrlPattern } from "@shared/url-matching";
import { hydrateUserscriptWithCompiled } from "@shared/userscript-hydrate";
import {
  clearCssBookmark,
  clearCssBookmarksForTab,
  getCssBookmark,
  setCssBookmark,
} from "./css-bookmarks";

const INLINE_EXECUTION_STATE_KEY = "__INVERT_INLINE_EXECUTION__";

/**
 * Prefer live source imports; fall back to persisted sharedScripts when
 * resolution fails (e.g. temporarily missing shared module).
 */
function sharedScriptIdsForInjection(
  script: Userscript,
  scriptsMap: Userscripts
): string[] {
  try {
    return resolveSharedScriptIdsFromSourceOrThrow(
      script,
      scriptsMap,
      script.code.source.typescript
    );
  } catch {
    return script.sharedScripts ?? [];
  }
}

export interface RuntimeInjectionState {
  scriptsMap: Userscripts;
  modulesMap?: GlobalModules;
}

export async function loadRuntimeInjectionState(
  includeModules = false
): Promise<RuntimeInjectionState> {
  const [scriptsMap, modulesMap] = await Promise.all([
    ChromeSyncStorage.getAllScripts(),
    includeModules
      ? ChromeSyncStorage.getAllModules()
      : Promise.resolve(undefined),
  ]);

  return {
    scriptsMap,
    modulesMap,
  };
}

async function executeInlineMainWorldScript(
  tabId: number,
  code: string,
  label: string
): Promise<void> {
  if (!code.trim()) {
    return;
  }

  const executionKey = `${label}:${crypto.randomUUID()}`;
  const instrumentedCode = [
    code,
    `window.${INLINE_EXECUTION_STATE_KEY}[${JSON.stringify(executionKey)}]=true;`,
  ].join("\n");

  await chrome.scripting.executeScript({
    target: { tabId },
    func: (payload: string, key: string, stateKey: string) => {
      const globalWindow = window as unknown as Window &
        Record<string, Record<string, boolean> | undefined>;
      const container =
        document.head ?? document.documentElement ?? document.body;

      if (!container) {
        throw new Error(
          "No document container available for script injection."
        );
      }

      const executionState = globalWindow[stateKey] ?? {};
      executionState[key] = false;
      globalWindow[stateKey] = executionState;

      const scriptEl = document.createElement("script");
      scriptEl.textContent = payload;
      container.appendChild(scriptEl);
      scriptEl.remove();

      const didComplete = Boolean(globalWindow[stateKey]?.[key]);
      delete executionState[key];

      if (!didComplete) {
        throw new Error(
          "Injected inline script did not complete. The page may have blocked it or it threw during evaluation."
        );
      }
    },
    args: [instrumentedCode, executionKey, INLINE_EXECUTION_STATE_KEY],
    world: "MAIN",
  });
}

/**
 * Inject a specific set of already-filtered scripts into a tab (CDN → shared →
 * JS → CSS). Callers own URL/enabled/runAt filtering.
 */
async function injectResolvedScripts(
  tabId: number,
  scripts: Userscript[],
  injectionState: RuntimeInjectionState
): Promise<void> {
  if (scripts.length === 0) {
    return;
  }

  const { scriptsMap } = injectionState;
  const allScripts = Object.values(scriptsMap);

  const scriptIdsToFetch = new Set<string>(scripts.map((s) => s.id));
  for (const script of scripts) {
    for (const sharedId of sharedScriptIdsForInjection(script, scriptsMap)) {
      scriptIdsToFetch.add(sharedId);
    }
  }

  const compiledCodeMap = await CompiledCodeStorage.getCompiledCodeForScripts(
    Array.from(scriptIdsToFetch)
  );

  const resolvedScripts = scripts.map((script) =>
    hydrateUserscriptWithCompiled(script, compiledCodeMap[script.id])
  );

  const scriptById = new Map(allScripts.map((s) => [s.id, s]));

  const needsCdnModules = resolvedScripts.some(
    (s) => s.globalModules?.length > 0
  );
  let modulesMap = injectionState.modulesMap;

  if (needsCdnModules) {
    modulesMap = modulesMap ?? (await ChromeSyncStorage.getAllModules());
    const injectedModules = new Set<string>();

    for (const script of resolvedScripts) {
      if (script.globalModules?.length > 0) {
        for (const moduleId of script.globalModules) {
          if (!injectedModules.has(moduleId)) {
            const module = modulesMap[moduleId];
            if (module?.enabled) {
              await injectCdnModule(tabId, module);
              injectedModules.add(moduleId);
            }
          }
        }
      }
    }
  }

  const injectedShared = new Set<string>();

  for (const script of resolvedScripts) {
    for (const sharedId of sharedScriptIdsForInjection(script, scriptsMap)) {
      if (injectedShared.has(sharedId)) {
        continue;
      }
      const shared = scriptById.get(sharedId);

      if (shared?.shared) {
        const resolvedShared = hydrateUserscriptWithCompiled(
          shared,
          compiledCodeMap[sharedId]
        );
        if (resolvedShared.code?.compiled?.javascript) {
          await injectSharedScript(tabId, resolvedShared);
          injectedShared.add(sharedId);
        }
      }
    }
    await injectScript(tabId, script);
  }

  for (const script of resolvedScripts) {
    await injectStylesheet(tabId, script);
  }
}

export async function injectMatchingScripts(
  tabId: number,
  url: string,
  timing: "beforePageLoad" | "afterPageLoad",
  injectionState?: RuntimeInjectionState
): Promise<void> {
  try {
    const state = injectionState ?? (await loadRuntimeInjectionState());
    const matchingScripts = Object.values(state.scriptsMap).filter(
      (script) =>
        script.enabled &&
        script.runAt === timing &&
        matchesUrlPattern(url, script.urlPatterns)
    );

    await injectResolvedScripts(tabId, matchingScripts, state);
  } catch (error) {
    console.error("Error injecting scripts: ", error);
  }
}

/**
 * Re-apply the given scripts to open tabs whose URL matches. Empty `scriptIds`
 * means every script. Shared-module consumers are included automatically.
 * Unrelated tabs are not touched.
 */
export async function applyScriptsToMatchingTabs(
  scriptIds: string[]
): Promise<{ appliedTabCount: number }> {
  const injectionState = await loadRuntimeInjectionState(true);
  const { scriptsMap } = injectionState;

  const affectedIds =
    scriptIds.length === 0
      ? Object.keys(scriptsMap)
      : expandAffectedScriptIds(scriptIds, scriptsMap);

  const affectedScripts = affectedIds
    .map((id) => scriptsMap[id])
    .filter((script): script is Userscript => Boolean(script?.enabled));

  if (affectedScripts.length === 0) {
    return { appliedTabCount: 0 };
  }

  const tabs = await chrome.tabs.query({});
  let appliedTabCount = 0;

  for (const tab of tabs) {
    if (!tab.id || !tab.url) {
      continue;
    }

    const matchingForTab = affectedScripts.filter((script) =>
      matchesUrlPattern(tab.url!, script.urlPatterns)
    );

    if (matchingForTab.length === 0) {
      continue;
    }

    try {
      const before = matchingForTab.filter(
        (script) => script.runAt === "beforePageLoad"
      );
      const after = matchingForTab.filter(
        (script) => script.runAt === "afterPageLoad"
      );

      await injectResolvedScripts(tab.id, before, injectionState);
      await injectResolvedScripts(tab.id, after, injectionState);
      appliedTabCount += 1;
    } catch (error) {
      console.error(`Error applying scripts to tab ${tab.id}:`, error);
    }
  }

  return { appliedTabCount };
}

/**
 * Best-effort teardown for a disabled script: remove tracked CSS from matching
 * open tabs. MAIN-world JS side effects are not undone without a reload.
 */
export async function removeScriptFromMatchingTabs(
  scriptId: string
): Promise<{ removedTabCount: number }> {
  const scriptsMap = await ChromeSyncStorage.getAllScripts();
  const script = scriptsMap[scriptId];

  if (!script) {
    return { removedTabCount: 0 };
  }

  const tabs = await chrome.tabs.query({});
  let removedTabCount = 0;

  for (const tab of tabs) {
    if (!tab.id || !tab.url) {
      continue;
    }

    if (!matchesUrlPattern(tab.url, script.urlPatterns)) {
      continue;
    }

    await removeInjectedStylesheet(tab.id, scriptId);
    removedTabCount += 1;
  }

  return { removedTabCount };
}

export async function prepareTabForInjection(tabId: number): Promise<void> {
  await clearCssBookmarksForTab(tabId);
}

export async function injectScript(
  tabId: number,
  script: Userscript
): Promise<void> {
  try {
    const jsCode = script.code?.compiled?.javascript ?? "";

    await executeInlineMainWorldScript(
      tabId,
      jsCode,
      `userscript:${script.id}`
    );
    console.log(`Injected script: ${script.name} into tab ${tabId}`);
  } catch (error) {
    console.error(`Error injecting script ${script.name}:`, error);
  }
}

async function injectSharedScript(
  tabId: number,
  script: Userscript
): Promise<void> {
  try {
    await executeInlineMainWorldScript(
      tabId,
      script.code.compiled.javascript,
      `shared:${script.id}`
    );
    console.log(`Injected shared script: ${script.name} into tab ${tabId}`);
  } catch (error) {
    console.error(`Error injecting shared script ${script.name}:`, error);
  }
}

/**
 * Injects a CDN module into the page by creating a `<script src="url">` element.
 * Waits for the script to load before resolving so that downstream userscripts
 * can safely reference globals provided by the module.
 */
async function injectCdnModule(
  tabId: number,
  module: GlobalModule
): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (url: string) => {
        return new Promise<void>((resolve, reject) => {
          const container =
            document.head ?? document.documentElement ?? document.body;

          if (!container) {
            reject(
              new Error("No document container available for module injection.")
            );
            return;
          }

          const scriptEl = document.createElement("script");
          scriptEl.src = url;
          scriptEl.onload = () => {
            scriptEl.remove();
            resolve();
          };
          scriptEl.onerror = () => {
            scriptEl.remove();
            reject(new Error(`Failed to load CDN module: ${url}`));
          };
          container.appendChild(scriptEl);
        });
      },
      args: [module.url],
      world: "MAIN",
    });
    console.log(`Injected CDN module: ${module.name} into tab ${tabId}`);
  } catch (error) {
    console.error(`Error injecting CDN module ${module.name}:`, error);
  }
}

async function removeInjectedStylesheet(
  tabId: number,
  scriptId: string
): Promise<void> {
  const previousCss = await getCssBookmark(tabId, scriptId);

  if (!previousCss) {
    return;
  }

  try {
    await chrome.scripting.removeCSS({
      target: { tabId },
      css: previousCss,
    });
  } catch (error) {
    console.warn(
      `Failed to remove stylesheet for script ${scriptId} from tab ${tabId}:`,
      error
    );
  }

  await clearCssBookmark(tabId, scriptId);
}

/**
 * Injects compiled CSS with replace semantics: previous insertion for this
 * tab/script is removed first (when known). Identical re-apply is a no-op.
 */
async function injectStylesheet(
  tabId: number,
  script: Userscript
): Promise<void> {
  const cssCode = script.code?.compiled?.css ?? "";
  const previousCss = await getCssBookmark(tabId, script.id);

  if (previousCss && previousCss === cssCode) {
    return;
  }

  if (previousCss) {
    try {
      await chrome.scripting.removeCSS({
        target: { tabId },
        css: previousCss,
      });
    } catch (error) {
      console.warn(
        `Failed to remove previous stylesheet for ${script.name}:`,
        error
      );
    }
    await clearCssBookmark(tabId, script.id);
  }

  if (!cssCode) {
    return;
  }

  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      css: cssCode,
    });
    await setCssBookmark(tabId, script.id, cssCode);
    console.log(`Injected stylesheet: ${script.name} into tab ${tabId}`);
  } catch (error) {
    console.error(`Error injecting stylesheet ${script.name}:`, error);
  }
}
