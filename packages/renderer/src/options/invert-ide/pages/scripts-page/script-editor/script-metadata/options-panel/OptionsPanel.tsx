import { Button } from "@/shared/components/button/Button";
import { Checkbox } from "@/shared/components/checkbox/Checkbox";
import { IconButton } from "@/shared/components/icon-button/IconButton";
import { Input } from "@/shared/components/input/Input";
import {
  Panel,
  PanelDivider,
  PanelHeader,
  PanelSection,
} from "@/shared/components/panel/Panel";
import { Select } from "@/shared/components/select/Select";
import { useAppSelector } from "@/shared/store/hooks";
import { selectEnabledModules } from "@/shared/store/slices/modules";
import { selectSharedUserscripts } from "@/shared/store/slices/userscripts";
import { sanitizeModuleName, Userscript } from "@shared/model";
import {
  EllipsisVerticalIcon,
  GitForkIcon,
  PackageIcon,
  Share2Icon,
  TimerIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cva } from "class-variance-authority";

const optionsTriggerVariants = cva(
  "flex items-center justify-center w-(--input-height) h-(--input-height) rounded-default cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:border-accent-border",
  {
    variants: {
      open: {
        true: "bg-accent-subtle border border-accent-border text-accent",
        false:
          "bg-surface-input border border-border text-text-muted hover:border-text-muted hover:text-text-muted-strong hover:bg-hover-overlay",
      },
    },
    defaultVariants: {
      open: false,
    },
  }
);

const RUN_AT_OPTIONS = [
  { value: "beforePageLoad", label: "Before page load" },
  { value: "afterPageLoad", label: "After page load" },
] as const;

type OptionsPanelProps = {
  script: Userscript;
  scriptName: string;
  moduleName: string;
  selectedModuleIds: string[];
  onModuleNameChange: (value: string) => void;
  onToggleModule: (moduleId: string, selected: boolean) => void;
  onRunAtChange: (runAt: Userscript["runAt"]) => void;
  onDelete: () => void;
};

export function OptionsPanel({
  script,
  scriptName,
  moduleName,
  selectedModuleIds,
  onModuleNameChange,
  onToggleModule,
  onRunAtChange,
  onDelete,
}: OptionsPanelProps) {
  const [open, setOpen] = useState(false);
  const globalModules = useAppSelector(selectEnabledModules);
  const sharedScripts = useAppSelector(selectSharedUserscripts);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const moduleInputRef = useRef<HTMLInputElement>(null);

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    },
    [wrapperRef]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, handleClickOutside]);

  const handleDelete = () => {
    setOpen(false);
    onDelete();
  };

  const handleAutoFillModuleName = () => {
    const sanitized = sanitizeModuleName(scriptName);
    if (sanitized && moduleInputRef.current) {
      moduleInputRef.current.value = sanitized;
      onModuleNameChange(sanitized);
    }
  };

  const currentSharedDependencies = sharedScripts.filter((sharedScript) =>
    (script.sharedScripts ?? []).includes(sharedScript.id)
  );

  return (
    <div className="relative shrink-0" ref={wrapperRef}>
      <button
        type="button"
        className={optionsTriggerVariants({ open })}
        onClick={() => setOpen(!open)}
        title="Script options"
      >
        <EllipsisVerticalIcon size={16} />
      </button>
      {open && (
        <Panel minWidth="18rem">
          <PanelHeader icon={<Share2Icon size={12} />}>
            script options
          </PanelHeader>
          <PanelSection>
            <span className="font-body text-xs leading-[1.4] text-text-muted">
              Set a module name to share this script with other scripts.
            </span>
            <div className="relative w-full">
              <Input
                ref={moduleInputRef}
                className="w-full"
                defaultValue={moduleName}
                placeholder="module-name"
                onChange={(event) => onModuleNameChange(event.target.value)}
              />
              <IconButton
                icon={WandSparklesIcon}
                variant="ghost"
                size="sm"
                className="absolute top-1/2 right-1.5 -translate-y-1/2 text-text-muted-faint hover:border-accent-border hover:bg-accent-subtle hover:text-accent active:scale-[0.92]"
                onClick={handleAutoFillModuleName}
                title="Auto-fill from script name"
              />
            </div>
          </PanelSection>
          <PanelDivider />
          <PanelHeader icon={<TimerIcon size={12} />}>Run at</PanelHeader>
          <PanelSection>
            <span className="font-body text-xs leading-[1.4] text-text-muted">
              When to inject this script on matching pages.
            </span>
            <div data-testid="run-at-select">
              <Select
                value={script.runAt ?? "beforePageLoad"}
                options={[...RUN_AT_OPTIONS]}
                onChange={onRunAtChange}
              />
            </div>
          </PanelSection>
          <PanelDivider />
          <PanelHeader icon={<GitForkIcon size={12} />}>
            Shared Scripts
          </PanelHeader>
          <PanelSection>
            <span className="font-body text-xs leading-[1.4] text-text-muted">
              Shared imports are derived from <code>import</code> statements
              that reference <code>scripts/&lt;module-name&gt;/main</code> in
              the TypeScript source.
            </span>
            {currentSharedDependencies.length > 0 ? (
              <div className="flex flex-col gap-sm">
                {currentSharedDependencies.map((shared) => (
                  <div
                    key={shared.id}
                    className="flex items-center justify-between gap-sm rounded-default border border-border bg-surface-input px-sm py-xs font-mono text-xs text-text-muted-strong"
                  >
                    <span className="truncate">{shared.name}</span>
                    <span className="shrink-0 text-text-muted-faint">
                      scripts/{shared.moduleName}/main
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="font-body text-xs leading-[1.4] text-text-muted italic">
                No runtime shared imports detected in this script.
              </span>
            )}
          </PanelSection>
          <PanelDivider />
          <PanelHeader icon={<PackageIcon size={12} />}>
            CDN Modules
          </PanelHeader>
          <PanelSection>
            {globalModules.length > 0 ? (
              <div className="flex flex-col gap-sm">
                {globalModules.map((module) => (
                  <Checkbox
                    key={module.id}
                    label={module.name}
                    checked={selectedModuleIds.includes(module.id)}
                    onChange={(checked) => onToggleModule(module.id, checked)}
                  />
                ))}
              </div>
            ) : (
              <span className="font-body text-xs leading-[1.4] text-text-muted italic">
                No modules available. Add modules from the Modules page.
              </span>
            )}
          </PanelSection>
          <PanelDivider />
          <PanelSection>
            <Button
              variant="danger"
              className="w-full justify-center gap-2 px-3 py-2 text-xs"
              onClick={handleDelete}
            >
              <Trash2Icon size={13} />
              Delete script
            </Button>
          </PanelSection>
        </Panel>
      )}
    </div>
  );
}
