export type AppSidebarTab = "scripts" | "modules" | "settings";

export type ScriptEditorDrawerTab = "javascript" | "css" | "errors";

export interface GlobalStateSizes {
  /**
   * Width percentage of the script list sidebar panel within the scripts page horizontal split.
   * Range: 0–100.
   */
  scriptListSidebarWidth?: number;
  /**
   * Width percentage of the TypeScript editor within the side-by-side source panels.
   * Range: 0–100.
   */
  scriptCodeEditorHorizontalSplit?: number;
  /**
   * Height percentage of the main TypeScript editor within the stacked TypeScript panel
   * (main script editor vs. declaration editor).
   * Range: 0–100.
   */
  scriptTypeDefinitionsVerticalSplit?: number;
  /**
   * Height percentage of the source editors panel within the outer vertical split
   * (source editors vs. compiled output drawer).
   * Range: 0–100.
   */
  scriptCompiledOutputDrawerSplit?: number;
}

export interface GlobalState {
  /**
   * The currently active sidebar navigation tab.
   */
  activeSidebarTab?: AppSidebarTab;
  /**
   * The ID of the most recently selected userscript, used to restore selection on reload.
   */
  selectedScriptId?: string;
  /**
   * Whether the compiled output drawer is collapsed.
   */
  outputDrawerCollapsed?: boolean;
  /**
   * The active tab displayed inside the compiled output drawer.
   */
  outputDrawerActiveTab?: ScriptEditorDrawerTab;
  /**
   * Persisted pixel-percentage sizes for all resizable panel groups.
   */
  panelSizes?: GlobalStateSizes;
}

export const DEFAULT_GLOBAL_STATE: GlobalState = {
  activeSidebarTab: "scripts",
  selectedScriptId: null,
  outputDrawerCollapsed: false,
  outputDrawerActiveTab: "javascript",
  panelSizes: {
    scriptListSidebarWidth: 30,
    scriptCodeEditorHorizontalSplit: 50,
    scriptTypeDefinitionsVerticalSplit: 68,
    scriptCompiledOutputDrawerSplit: 70,
  },
};

/**
 * Merge a sparse/partial persisted UI state with defaults. Nested `panelSizes`
 * are deep-merged so a partial panelSizes write cannot wipe other panel sizes.
 */
export function mergeGlobalState(stored?: GlobalState | null): GlobalState {
  return {
    ...DEFAULT_GLOBAL_STATE,
    ...(stored ?? {}),
    panelSizes: {
      ...DEFAULT_GLOBAL_STATE.panelSizes,
      ...(stored?.panelSizes ?? {}),
    } satisfies GlobalStateSizes,
  };
}

export class GlobalStateManager {
  private static readonly storageKey = "globalState";

  /**
   * The default UI state used when no persisted state is found. Must be kept in sync with the
   * default value in {@link GlobalStateProvider}.
   */
  static get defaultState(): GlobalState {
    return {
      ...DEFAULT_GLOBAL_STATE,
      panelSizes: { ...DEFAULT_GLOBAL_STATE.panelSizes },
    };
  }

  /**
   * Retrieves the persisted UI state from `chrome.storage.sync`.
   */
  static async get(): Promise<GlobalState> {
    const result = await chrome.storage.sync.get<{ globalState: GlobalState }>([
      this.storageKey,
    ]);
    const stored = result[this.storageKey];

    return mergeGlobalState(stored);
  }

  /**
   * Overwrites the entire UI state in chrome.storage.sync.
   */
  static async save(state: GlobalState): Promise<void> {
    await chrome.storage.sync.set({ [this.storageKey]: state });
  }
}
