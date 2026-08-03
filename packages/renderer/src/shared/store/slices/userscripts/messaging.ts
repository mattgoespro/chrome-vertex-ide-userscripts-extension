import type {
  ApplyScriptsResponse,
  RuntimePortMessageEvent,
} from "@shared/messages";

const EMPTY_APPLY_RESPONSE: ApplyScriptsResponse = {
  success: false,
  appliedTabCount: 0,
  removedTabCount: 0,
};

export async function sendApplyScriptsMessage(
  scriptIds: string[]
): Promise<ApplyScriptsResponse> {
  const message: RuntimePortMessageEvent<"applyScripts"> = {
    source: "options",
    type: "applyScripts",
    data: { scriptIds },
  };

  try {
    const response = (await chrome.runtime.sendMessage(
      message
    )) as ApplyScriptsResponse | undefined;

    return response ?? EMPTY_APPLY_RESPONSE;
  } catch (error) {
    console.warn("Failed to send applyScripts message:", error);
    return EMPTY_APPLY_RESPONSE;
  }
}

export async function sendSetEnabledMessage(
  scriptId: string,
  enabled: boolean
): Promise<ApplyScriptsResponse> {
  const message: RuntimePortMessageEvent<"setEnabled"> = {
    source: "options",
    type: "setEnabled",
    data: { scriptId, enabled },
  };

  try {
    const response = (await chrome.runtime.sendMessage(
      message
    )) as ApplyScriptsResponse | undefined;

    return response ?? EMPTY_APPLY_RESPONSE;
  } catch (error) {
    console.warn("Failed to send setEnabled message:", error);
    return EMPTY_APPLY_RESPONSE;
  }
}

export function formatMatchingTabsToast(
  count: number,
  verb: "Applied to" | "Removed from"
): string {
  const noun = count === 1 ? "tab" : "tabs";
  return `${verb} ${count} matching ${noun}`;
}
