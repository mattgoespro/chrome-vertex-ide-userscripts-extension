import { CodeComment } from "@/shared/components/code-comment/CodeComment";
import { IconButton } from "@/shared/components/icon-button/IconButton";
import { ResizeHandle } from "@/shared/components/resize-handle/ResizeHandle";
import { useToast } from "@/shared/components/toast/ToastProvider";
import { Typography } from "@/shared/components/typography/Typography";
import { useAppDispatch, useAppSelector } from "@/shared/store/hooks";
import {
  selectAllUserscripts,
  selectCurrentUserscript,
} from "@/shared/store/slices/userscripts";
import { selectUserscript } from "@/shared/store/select-userscript";
import {
  buildUserscriptsTransferFile,
  stringifyUserscriptsTransferFile,
  UserscriptsTransferFile,
} from "@/shared/store/slices/userscripts/transfer.userscripts";
import { LoaderCircleIcon, PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { Group, Panel } from "react-resizable-panels";
import { ScriptEditor } from "./script-editor/ScriptEditor";
import { ScriptList } from "@/shared/components/script-list/ScriptList";
import {
  createUserscript,
  importUserscripts,
} from "@/shared/store/slices/userscripts/thunks.userscripts";
import {
  selectPanelSizes,
  updatePanelSizes,
} from "@/shared/store/slices/ui";
import { ImportUserscriptsDialog } from "./import-userscripts-dialog/ImportUserscriptsDialog";
import { ScriptsActionsMenu } from "./scripts-actions-menu/ScriptsActionsMenu";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export function ScriptsPage() {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const scripts = useAppSelector(selectAllUserscripts);
  const selectedScript = useAppSelector(selectCurrentUserscript);
  const panelSizes = useAppSelector(selectPanelSizes);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const onCreateScript = async () => {
    dispatch(createUserscript());
  };

  const onExportScripts = useCallback(() => {
    try {
      const transferFile = buildUserscriptsTransferFile(scripts);
      const contents = stringifyUserscriptsTransferFile(transferFile);
      const blob = new Blob([contents], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = `invert-userscripts-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);

      toast({
        variant: "info",
        message: `Exported ${transferFile.userscripts.length} userscript${transferFile.userscripts.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      toast({
        variant: "error",
        message: `Failed to export userscripts: ${getErrorMessage(error)}`,
      });
    }
  }, [scripts, toast]);

  const onImportScripts = useCallback(
    async (file: UserscriptsTransferFile) => {
      setIsImporting(true);

      try {
        const importedScripts = await dispatch(
          importUserscripts(file)
        ).unwrap();

        toast({
          variant: "info",
          message:
            importedScripts.length === 0
              ? "The selected file did not contain any userscripts to import."
              : `Imported ${importedScripts.length} userscript${importedScripts.length === 1 ? "" : "s"}.`,
        });
      } catch (error) {
        const message = `Failed to import userscripts: ${getErrorMessage(error)}`;

        toast({
          variant: "error",
          message,
        });

        throw error;
      } finally {
        setIsImporting(false);
      }
    },
    [dispatch, toast]
  );

  const onScriptSelected = (scriptId: string) => {
    dispatch(selectUserscript(scriptId));
  };

  return (
    <Group
      orientation="horizontal"
      id="scripts-page-panels"
      className="h-full min-w-0 flex-1 overflow-hidden"
      defaultLayout={{
        "scripts-sidebar": panelSizes.scriptListSidebarWidth,
        "scripts-editor": 100 - panelSizes.scriptListSidebarWidth,
      }}
      onLayoutChanged={(layout) => {
        const sidebarWidth = layout["scripts-sidebar"];
        if (sidebarWidth != null) {
          dispatch(updatePanelSizes({ scriptListSidebarWidth: sidebarWidth }));
        }
      }}
    >
      <Panel id="scripts-sidebar" minSize="15%" maxSize="30%">
        <div className="flex h-full flex-col border-r border-border bg-surface-raised">
          <div className="flex items-center justify-between border-b border-border p-md">
            <Typography variant="subtitle">
              <span className="mr-2 font-mono text-sm text-text-muted-faint">
                //
              </span>
              Scripts
            </Typography>
            <div className="flex items-center gap-2xs">
              <ScriptsActionsMenu
                onImportClick={() => setImportDialogOpen(true)}
                onExportClick={onExportScripts}
              />
              <IconButton
                icon={PlusIcon}
                variant="ghost"
                size="sm"
                onClick={onCreateScript}
                title="Create new script"
              />
            </div>
          </div>
          <div className="relative min-h-0 flex-1">
            <div className="flex h-full flex-col">
              <ScriptList onScriptSelected={onScriptSelected} />
            </div>
            {isImporting && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-sm bg-[rgba(12,14,18,0.88)]">
                <LoaderCircleIcon
                  size={20}
                  className="animate-spin text-accent"
                />
                <span className="font-mono text-xs text-text-muted-strong uppercase">
                  Importing scripts...
                </span>
              </div>
            )}
          </div>
        </div>
      </Panel>
      <ResizeHandle direction="horizontal" />
      <Panel id="scripts-editor" minSize="70%" maxSize="85%">
        {selectedScript ? (
          <ScriptEditor />
        ) : (
          <CodeComment className="m-auto">
            Select a script to start editing.
          </CodeComment>
        )}
      </Panel>
      <ImportUserscriptsDialog
        open={importDialogOpen}
        importing={isImporting}
        onClose={() => setImportDialogOpen(false)}
        onImport={onImportScripts}
      />
    </Group>
  );
}
