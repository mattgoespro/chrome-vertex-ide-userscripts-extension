import { useAppDispatch } from "@/shared/store/hooks";
import { getAffectedScriptIdsFromStorageChanges } from "@/shared/store/slices/editor-drafts/helpers";
import { refreshScriptsFromStorage } from "@/shared/store/slices/editor-drafts/thunks.storage-sync";
import { useEffect, useRef } from "react";

/**
 * Keep IDE drafts/entities reconciled with chrome.storage.sync.
 *
 * - `onChanged` is the primary signal for same- and cross-context writes.
 * - `visibilitychange` catches missed events when returning to a backgrounded
 *   IDE tab (e.g. another IDE window wrote while this one was hidden).
 * - Full refreshes on every `pageshow` were dropped; bfcache restores still
 *   fire visibility when shown.
 */
export function useStorageSync() {
  const dispatch = useAppDispatch();
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    const refresh = async (scriptIds?: string[]) => {
      if (refreshInFlightRef.current) {
        return;
      }

      refreshInFlightRef.current = true;

      try {
        await dispatch(refreshScriptsFromStorage({ scriptIds })).unwrap();
      } catch (error) {
        console.error("Failed to refresh scripts from storage:", error);
      } finally {
        refreshInFlightRef.current = false;
      }
    };

    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area !== "sync") {
        return;
      }

      const scriptIds = getAffectedScriptIdsFromStorageChanges(changes);

      if (scriptIds.length === 0) {
        return;
      }

      void refresh(scriptIds);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    chrome.storage.onChanged.addListener(onStorageChanged);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      chrome.storage.onChanged.removeListener(onStorageChanged);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [dispatch]);
}
