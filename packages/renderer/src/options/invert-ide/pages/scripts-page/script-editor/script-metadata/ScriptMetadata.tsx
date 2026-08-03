import { Input } from "@/shared/components/input/Input";
import { sanitizeModuleName, Userscript } from "@shared/model";
import { useAppDispatch } from "@/shared/store/hooks";
import { AppDispatch } from "@/shared/store/store";
import {
  deleteUserscript,
  updateUserscript,
} from "@/shared/store/slices/userscripts/thunks.userscripts";
import { OptionsPanel } from "./options-panel/OptionsPanel";
import { UrlPatternInput } from "./url-pattern-input/UrlPatternInput";
import { IconButton } from "@/shared/components/icon-button/IconButton";
import { Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { UrlPatternTester } from "@/shared/components/url-pattern-tester/UrlPatternTester";

type ScriptMetadataProps = {
  script: Userscript;
};

const MODULE_NAME_DEBOUNCE_MS = 400;

export function ScriptMetadata({ script }: ScriptMetadataProps) {
  const dispatch: AppDispatch = useAppDispatch();
  const [showUrlTester, setShowUrlTester] = useState(false);
  const moduleNameDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (moduleNameDebounceRef.current) {
        clearTimeout(moduleNameDebounceRef.current);
      }
    };
  }, []);

  const onUpdateScriptMeta = async (updates: Partial<Userscript>) => {
    await dispatch(updateUserscript({ id: script.id, updates })).unwrap();
  };

  const onModuleNameChange = (value: string) => {
    if (moduleNameDebounceRef.current) {
      clearTimeout(moduleNameDebounceRef.current);
    }

    moduleNameDebounceRef.current = setTimeout(() => {
      const trimmed = value.trim();
      onUpdateScriptMeta({ moduleName: value, shared: trimmed.length > 0 });
    }, MODULE_NAME_DEBOUNCE_MS);
  };

  const onDeleteScript = () => {
    if (!confirm("Are you sure you want to delete this script?")) {
      return;
    }

    dispatch(deleteUserscript(script.id));
  };

  const onToggleModule = (moduleId: string, selected: boolean) => {
    const currentModules = script.globalModules ?? [];
    const updatedModules = selected
      ? [...currentModules, moduleId]
      : currentModules.filter((id) => id !== moduleId);
    onUpdateScriptMeta({ globalModules: updatedModules });
  };

  return (
    <>
      <div className="flex w-full min-w-0 items-center gap-sm">
        <span className="shrink-0 font-mono text-sm text-syntax-keyword">
          const
        </span>
        <Input
          className="basis-1/4"
          required
          defaultValue={script.name}
          placeholder="Script name..."
          onChange={(event) => {
            const newName = event.target.value;
            const updates: Partial<Userscript> = { name: newName };

            if (script.moduleName === sanitizeModuleName(script.name)) {
              const sanitized = sanitizeModuleName(newName);
              updates.moduleName = sanitized;
              updates.shared = sanitized.length > 0;
            }

            onUpdateScriptMeta(updates);
          }}
        />
        <UrlPatternInput
          className="min-w-0 flex-1"
          patterns={script.urlPatterns ?? []}
          onChange={(urlPatterns) => onUpdateScriptMeta({ urlPatterns })}
        />
        <IconButton
          icon={Globe}
          variant="secondary"
          size="sm"
          onClick={() => setShowUrlTester(true)}
          title="Test URL patterns"
        />
        <OptionsPanel
          script={script}
          scriptName={script.name}
          moduleName={script.moduleName ?? ""}
          selectedModuleIds={script.globalModules ?? []}
          onModuleNameChange={onModuleNameChange}
          onToggleModule={onToggleModule}
          onRunAtChange={(runAt) => onUpdateScriptMeta({ runAt })}
          onDelete={onDeleteScript}
        />
      </div>
      {showUrlTester && (
        <UrlPatternTester
          patterns={script.urlPatterns ?? []}
          onClose={() => setShowUrlTester(false)}
        />
      )}
    </>
  );
}
