import { ConflictDialog } from "@/options/invert-ide/components/conflict-dialog/ConflictDialog";
import { useStorageSync } from "@/options/invert-ide/hooks/useStorageSync";
import { SassCompiler, initializeBuildWorker } from "@/sandbox/compiler";
import { CommandPalette } from "@/shared/components/command-palette/CommandPalette";
import { useAppDispatch, useAppSelector } from "@/shared/store/hooks";
import {
  initializeMonaco,
  setIdeReady,
} from "@/shared/store/slices/code-editor/thunks.code-editor";
import { selectEditorSettings } from "@/shared/store/slices/settings";
import { loadSettings } from "@/shared/store/slices/settings/thunks.settings";
import { loadModules } from "@/shared/store/slices/modules";
import {
  loadUserscripts,
  rebuildCompiledUserscripts,
} from "@/shared/store/slices/userscripts/thunks.userscripts";
import { setCurrentUserscript } from "@/shared/store/slices/userscripts";
import {
  selectActiveSidebarTab,
  setActiveSidebarTab,
} from "@/shared/store/slices/ui";
import { startWorkspaceService } from "@/shared/services/workspace-service";
import { store } from "@/shared/store/store";
import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "./components/sidebar/Sidebar";
import type { AppSidebarTab } from "@shared/storage";
import { ModulesPage } from "./pages/modules-page/ModulesPage";
import { ScriptsPage } from "./pages/scripts-page/ScriptsPage";
import { Settings } from "./pages/settings-page/SettingsPage";
import { useRegisterCoreCommands } from "./hooks/useRegisterCoreCommands";

function restoreInitialUserscriptSelection(dispatch: ReturnType<typeof useAppDispatch>) {
  const state = store.getState();

  if (state.userscripts.currentUserscript) {
    return;
  }

  const scripts = state.userscripts.scripts ?? {};
  const scriptIds = Object.keys(scripts);

  if (scriptIds.length === 0) {
    return;
  }

  const restoredId = state.ui.selectedScriptId;
  const targetId =
    restoredId && scripts[restoredId] ? restoredId : scriptIds[0];

  dispatch(setCurrentUserscript(targetId));
}

export function InvertIde() {
  const dispatch = useAppDispatch();
  const activeSidebarTab = useAppSelector(selectActiveSidebarTab);
  const settings = useAppSelector(selectEditorSettings);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const handleOpenCommandPalette = useCallback(
    () => setCommandPaletteOpen(true),
    []
  );

  useRegisterCoreCommands({
    onOpenCommandPalette: handleOpenCommandPalette,
  });

  useStorageSync();

  useEffect(() => {
    SassCompiler.initialize();
    void initializeBuildWorker();

    let stopWorkspaceService: (() => void) | undefined;

    void (async () => {
      try {
        // Monaco/Shiki must finish before ideReady — otherwise editors mount
        // against Monarch and miss shikiToMonaco's theme/tokenizer patches.
        await Promise.all([
          dispatch(initializeMonaco()).unwrap(),
          dispatch(loadUserscripts()).unwrap(),
          dispatch(loadSettings()).unwrap(),
          dispatch(loadModules()).unwrap(),
        ]);

        restoreInitialUserscriptSelection(dispatch);

        // Single owner of store → Monaco sync: active script + shared-dep
        // closure models, module package.json entries, ambient/CDN libs.
        stopWorkspaceService = startWorkspaceService(store);

        await dispatch(rebuildCompiledUserscripts({ scope: "stale" })).unwrap();
        dispatch(setIdeReady(true));
      } catch (error) {
        console.error("Failed to initialize IDE state:", error);
        dispatch(setIdeReady(true));
      }
    })();

    return () => stopWorkspaceService?.();
  }, [dispatch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, []);

  useEffect(() => {
    if (settings.appTheme) {
      applyAppTheme(settings.appTheme);
    }
  }, [settings.appTheme]);

  function applyAppTheme(themeId: string) {
    const root = document.documentElement;

    if (themeId === "graphite") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", themeId);
    }
  }

  function onNavigate(button: AppSidebarTab) {
    dispatch(setActiveSidebarTab(button));
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-surface-base">
      <div className="relative flex min-w-0 flex-1">
        <Sidebar active={activeSidebarTab} onNavigate={onNavigate} />
        <div className="relative flex min-w-0 flex-1 *:animate-page-reveal">
          {activeSidebarTab === "scripts" && <ScriptsPage />}
          {activeSidebarTab === "modules" && <ModulesPage />}
          {activeSidebarTab === "settings" && <Settings />}
        </div>
      </div>
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
      <ConflictDialog />
    </div>
  );
}
