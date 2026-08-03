import { IconButton } from "@/shared/components/icon-button/IconButton";
import { ScriptList } from "@/shared/components/script-list/ScriptList";
import { Typography } from "@/shared/components/typography/Typography";
import { selectAllUserscripts } from "@/shared/store/slices/userscripts/selectors";
import { loadUserscripts } from "@/shared/store/slices/userscripts/thunks.load";
import { matchesUrlPattern } from "@shared/url-matching";
import { ExternalLinkIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { PopupDispatch, PopupRootState } from "./popup-store";

export function Popup() {
  const dispatch = useDispatch<PopupDispatch>();
  const scripts = useSelector((state: PopupRootState) =>
    selectAllUserscripts(state)
  );
  const [activeTabUrl, setActiveTabUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      await dispatch(loadUserscripts());

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tab?.url) {
        setActiveTabUrl(tab.url);
      }

      setIsLoading(false);
    };

    initialize();
  }, [dispatch]);

  const matchingScripts = useMemo(() => {
    if (!activeTabUrl) {
      return [];
    }

    return Object.values(scripts).filter((script) =>
      matchesUrlPattern(activeTabUrl, script.urlPatterns)
    );
  }, [scripts, activeTabUrl]);

  const onOpenIde = () => {
    chrome.runtime.openOptionsPage();
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-base">
        <Typography variant="caption" className="text-text-muted-faint">
          Loading...
        </Typography>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-base">
      <div className="flex items-center justify-between border-b border-border p-md">
        <Typography variant="subtitle">
          <span className="mr-2 font-mono text-sm text-text-muted-faint">
            //
          </span>
          Invert IDE
        </Typography>
        <IconButton
          icon={ExternalLinkIcon}
          size="sm"
          onClick={onOpenIde}
          title="Open IDE"
        />
      </div>

      {matchingScripts.length > 0 ? (
        <>
          <ScriptList scripts={matchingScripts} />
          <div className="border-t border-border px-md py-sm">
            <Typography variant="caption" className="text-text-muted-faint">
              {matchingScripts.length} script
              {matchingScripts.length !== 1 ? "s" : ""} matching
            </Typography>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center p-lg">
          <Typography variant="caption" className="text-text-muted-faint">
            No scripts match this page
          </Typography>
        </div>
      )}
    </div>
  );
}
