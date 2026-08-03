import type {
  ApplyScriptsResponse,
  RuntimePortMessageEvent,
} from "@shared/messages";
import { updateBadgeForTab } from "../../ide/badge";
import {
  applyScriptsToMatchingTabs,
  loadRuntimeInjectionState,
  removeScriptFromMatchingTabs,
} from "../../ide/scripts";

export const onInstalled = (_details: chrome.runtime.InstalledDetails) => {
  console.log("Invert IDE Userscripts extension installed.");
};

async function refreshBadgesForOpenTabs(): Promise<void> {
  const [tabs, injectionState] = await Promise.all([
    chrome.tabs.query({}),
    loadRuntimeInjectionState(),
  ]);

  for (const tab of tabs) {
    if (tab.id && tab.url) {
      await updateBadgeForTab(tab.id, tab.url, injectionState.scriptsMap);
    }
  }
}

export const onMessage = (
  message: RuntimePortMessageEvent,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => {
  void (async () => {
    switch (message.type) {
      case "applyScripts": {
        const result = await applyScriptsToMatchingTabs(
          message.data.scriptIds
        );
        await refreshBadgesForOpenTabs();
        const response: ApplyScriptsResponse = {
          success: true,
          appliedTabCount: result.appliedTabCount,
        };
        sendResponse(response);
        break;
      }
      case "setEnabled": {
        const { scriptId, enabled } = message.data;

        if (enabled) {
          const result = await applyScriptsToMatchingTabs([scriptId]);
          await refreshBadgesForOpenTabs();
          const response: ApplyScriptsResponse = {
            success: true,
            appliedTabCount: result.appliedTabCount,
          };
          sendResponse(response);
        } else {
          const result = await removeScriptFromMatchingTabs(scriptId);
          await refreshBadgesForOpenTabs();
          const response: ApplyScriptsResponse = {
            success: true,
            appliedTabCount: 0,
            removedTabCount: result.removedTabCount,
          };
          sendResponse(response);
        }
        break;
      }
      case "refreshTabs": {
        // Deprecated: apply all scripts to matching tabs only (no unrelated inject).
        const result = await applyScriptsToMatchingTabs([]);
        await refreshBadgesForOpenTabs();
        const response: ApplyScriptsResponse = {
          success: true,
          appliedTabCount: result.appliedTabCount,
        };
        sendResponse(response);
        break;
      }
      default: {
        sendResponse({ success: false });
        break;
      }
    }
  })();

  return true;
};
