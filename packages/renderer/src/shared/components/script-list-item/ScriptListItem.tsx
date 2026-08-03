import { Switch } from "@/shared/components/switch/Switch";
import { useToast } from "@/shared/components/toast/ToastProvider";
import { selectIsDraftDirty } from "@/shared/store/slices/editor-drafts/selectors";
import { formatMatchingTabsToast } from "@/shared/store/slices/userscripts/messaging";
import { toggleUserscript } from "@/shared/store/slices/userscripts/thunks.crud";
import { Userscript } from "@shared/model";
import { PackageIcon } from "lucide-react";
import clsx from "clsx";
import { useDispatch, useSelector } from "react-redux";

type ScriptListItemProps = {
  script: Userscript;
  active?: boolean;
  onScriptSelected?: (scriptId: string) => void;
};

type ToggleResult = {
  script: Userscript;
  appliedTabCount: number;
  removedTabCount: number;
};

type ThunkDispatch = {
  (action: unknown): {
    unwrap: () => Promise<ToggleResult>;
  };
};

export function ScriptListItem({
  script,
  active = false,
  onScriptSelected,
}: ScriptListItemProps) {
  // Shared by IDE store and compile-free popup store (both have thunk middleware).
  const dispatch = useDispatch() as unknown as ThunkDispatch;
  const isModified = useSelector(selectIsDraftDirty(script.id));
  const { toast } = useToast();

  const onSelectScript = () => {
    if (!onScriptSelected || active) {
      return;
    }

    onScriptSelected(script.id);
  };

  const onToggleScript = async () => {
    try {
      const payload = await dispatch(toggleUserscript(script.id)).unwrap();
      const enabled = payload.script.enabled;
      const count = enabled
        ? payload.appliedTabCount
        : payload.removedTabCount;

      toast({
        variant: "info",
        message: formatMatchingTabsToast(
          count,
          enabled ? "Applied to" : "Removed from"
        ),
      });
    } catch (error) {
      console.error("Failed to toggle userscript:", error);
      toast({
        variant: "error",
        message: "Failed to update script enabled state.",
      });
    }
  };

  return (
    <div
      className={clsx(
        "group mb-1.5 flex items-center rounded-default p-2 transition-colors duration-150",
        onScriptSelected && "cursor-pointer",
        active
          ? "border border-l-[3px] border-accent-muted border-l-accent bg-accent-subtle"
          : "border border-transparent bg-surface-overlay hover:border-border hover:bg-hover-overlay",
        "focus:border-accent-border focus:outline-none"
      )}
      onClick={() => onSelectScript()}
    >
      {isModified && (
        <div className="mr-3 h-2 w-2 shrink-0 animate-pulse-indicator rounded-full bg-accent" />
      )}
      {script.shared && (
        <PackageIcon
          size={12}
          className="mr-2 shrink-0 text-syntax-keyword opacity-70"
        />
      )}
      <span
        className={clsx(
          "flex-1 overflow-hidden font-mono text-base font-medium text-ellipsis whitespace-nowrap",
          script.shared ? "text-syntax-keyword" : "text-syntax-function"
        )}
      >
        {script.name}
      </span>
      <div className="flex items-center gap-2 opacity-70 transition-opacity duration-150 group-hover:opacity-100">
        <Switch checked={script.enabled} onChange={() => onToggleScript()} />
      </div>
    </div>
  );
}
