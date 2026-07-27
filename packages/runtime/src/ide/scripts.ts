import {
  GlobalModule,
  GlobalModules,
  Userscript,
  Userscripts,
} from "@shared/model";
import { ChromeSyncStorage, CompiledCodeStorage } from "@shared/storage";
import {
  collectCompiledCodeScriptIds,
  collectEnabledCdnModuleIds,
  mergeCompiledCode,
  selectMatchingScriptsForInjection,
} from "./injection-plan";

const INLINE_EXECUTION_STATE_KEY = "__INVERT_INLINE_EXECUTION__";

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

export async function injectMatchingScripts(
  tabId: number,
  url: string,
  timing: "beforePageLoad" | "afterPageLoad",
  injectionState?: RuntimeInjectionState
): Promise<void> {
  try {
    const state = injectionState ?? (await loadRuntimeInjectionState());
    const { scriptsMap } = state;

    // Filter before merging compiled code to avoid unnecessary object spreading
    const matchingScripts = selectMatchingScriptsForInjection(
      scriptsMap,
      url,
      timing
    );

    if (matchingScripts.length === 0) {
      return;
    }

    const compiledCodeMap = await CompiledCodeStorage.getCompiledCodeForScripts(
      collectCompiledCodeScriptIds(matchingScripts)
    );

    const resolvedScripts = matchingScripts.map((script) =>
      mergeCompiledCode(script, compiledCodeMap)
    );

    // Phase 1: Inject CDN modules (deduplicated, only fetch modules if needed)
    const needsCdnModules = resolvedScripts.some(
      (s) => s.globalModules?.length > 0
    );
    let modulesMap = state.modulesMap;

    if (needsCdnModules) {
      modulesMap = modulesMap ?? (await ChromeSyncStorage.getAllModules());
      for (const moduleId of collectEnabledCdnModuleIds(
        resolvedScripts,
        modulesMap
      )) {
        const module = modulesMap[moduleId];
        if (module) {
          await injectCdnModule(tabId, module);
        }
      }
    }

    // Phase 2: Inject shared script dependencies, then Phase 3: userscripts
    const injectedShared = new Set<string>();

    for (const script of resolvedScripts) {
      if (script.sharedScripts?.length > 0) {
        for (const sharedId of script.sharedScripts) {
          if (injectedShared.has(sharedId)) {
            continue;
          }
          const shared = scriptsMap[sharedId];

          if (shared?.shared) {
            const resolvedShared = mergeCompiledCode(shared, compiledCodeMap);
            if (resolvedShared.code?.compiled?.javascript) {
              await injectSharedScript(tabId, resolvedShared);
              injectedShared.add(sharedId);
            }
          }
        }
      }
      await injectScript(tabId, script);
    }

    for (const script of resolvedScripts) {
      await injectStylesheet(tabId, script);
    }
  } catch (error) {
    console.error("Error injecting scripts: ", error);
  }
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

/**
 * Injects compiled CSS into a tab using `chrome.scripting.insertCSS`.
 * Skips injection if the script has no compiled CSS.
 */
async function injectStylesheet(
  tabId: number,
  script: Userscript
): Promise<void> {
  const cssCode = script.code?.compiled?.css ?? "";

  if (!cssCode) {
    return;
  }

  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      css: cssCode,
    });
    console.log(`Injected stylesheet: ${script.name} into tab ${tabId}`);
  } catch (error) {
    console.error(`Error injecting stylesheet ${script.name}:`, error);
  }
}
