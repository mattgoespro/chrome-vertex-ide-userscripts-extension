import {
  onTabActivated,
  onTabRemoved,
  onTabUpdated,
} from "./handlers/component-handlers/tab.handler";
import { onWebNavigationCompleted } from "./handlers/extension-handlers/navigation.handler";
import {
  onInstalled,
  onMessage,
} from "./handlers/extension-handlers/runtime.handler";

/**
 * Runtime listeners
 */
chrome.runtime.onInstalled.addListener(onInstalled);

/**
 * Web navigation listeners
 */
chrome.webNavigation.onCompleted.addListener(onWebNavigationCompleted);

/**
 * Runtime message listeners
 */
chrome.runtime.onMessage.addListener(onMessage);

/**
 * Tab activation listeners
 */
chrome.tabs.onUpdated.addListener(onTabUpdated);
chrome.tabs.onActivated.addListener(onTabActivated);
chrome.tabs.onRemoved.addListener(onTabRemoved);
