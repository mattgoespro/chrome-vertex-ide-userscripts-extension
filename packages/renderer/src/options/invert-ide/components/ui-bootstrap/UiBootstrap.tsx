import { useAppDispatch, useAppSelector } from "@/shared/store/hooks";
import { flushPersistedUiState } from "@/shared/store/store";
import { hydrateUi, selectUiHydrated } from "@/shared/store/slices/ui";
import { useEffect, type ReactNode } from "react";

/**
 * Hydrates persisted layout/nav UI state before rendering the IDE shell, and
 * flushes pending saves on page hide.
 */
export function UiBootstrap({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const hydrated = useAppSelector(selectUiHydrated);

  useEffect(() => {
    void dispatch(hydrateUi());
  }, [dispatch]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const handlePageHide = () => {
      flushPersistedUiState();
    };

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      flushPersistedUiState();
    };
  }, [hydrated]);

  if (!hydrated) {
    return null;
  }

  return children;
}
