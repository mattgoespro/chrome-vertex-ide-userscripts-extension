import { Command } from "@/shared/command-palette/command.types";
import { useRegisterCommands } from "@/shared/hooks/useRegisterCommand";
import { useAppDispatch, useAppSelector } from "@/shared/store/hooks";
import {
  setCurrentUserscript,
  selectAllUserscripts,
} from "@/shared/store/slices/userscripts";
import { createUserscript } from "@/shared/store/slices/userscripts/thunks.userscripts";
import { setActiveSidebarTab } from "@/shared/store/slices/ui";
import { FileCode2, PackageIcon, PlusIcon, Settings2Icon } from "lucide-react";
import { useMemo } from "react";

interface UseRegisterCoreCommandsProps {
  onOpenCommandPalette: () => void;
}

export function useRegisterCoreCommands({
  onOpenCommandPalette,
}: UseRegisterCoreCommandsProps) {
  const dispatch = useAppDispatch();
  const scripts = useAppSelector(selectAllUserscripts);

  const commands = useMemo<Command[]>(() => {
    const coreCommands: Command[] = [
      {
        id: "nav.scripts",
        label: "Go to Scripts",
        category: "navigation",
        icon: FileCode2,
        keywords: ["scripts", "userscripts", "code"],
        action: () => {
          dispatch(setActiveSidebarTab("scripts"));
        },
      },
      {
        id: "nav.modules",
        label: "Go to Modules",
        category: "navigation",
        icon: PackageIcon,
        keywords: ["modules", "cdn", "libraries"],
        action: () => {
          dispatch(setActiveSidebarTab("modules"));
        },
      },
      {
        id: "nav.settings",
        label: "Go to Settings",
        category: "navigation",
        icon: Settings2Icon,
        keywords: ["settings", "preferences", "config"],
        action: () => {
          dispatch(setActiveSidebarTab("settings"));
        },
      },
      {
        id: "script.create",
        label: "Create New Script",
        category: "script",
        icon: PlusIcon,
        keywords: ["new", "create", "add"],
        action: async () => {
          await dispatch(createUserscript());
        },
      },
      {
        id: "palette.open",
        label: "Open Command Palette",
        category: "navigation",
        keywords: ["commands", "search", "palette"],
        shortcut: "Cmd+K",
        action: onOpenCommandPalette,
      },
    ];

    const scriptCommands: Command[] = Object.values(scripts).map((script) => ({
      id: `script.open.${script.id}`,
      label: `${script.name}`,
      category: "search" as const,
      keywords: ["script", "open", script.name],
      description: `Open ${script.name}`,
      action: () => {
        dispatch(setCurrentUserscript(script.id));
        dispatch(setActiveSidebarTab("scripts"));
      },
    }));

    return [...coreCommands, ...scriptCommands];
  }, [dispatch, scripts, onOpenCommandPalette]);

  useRegisterCommands(commands);
}
