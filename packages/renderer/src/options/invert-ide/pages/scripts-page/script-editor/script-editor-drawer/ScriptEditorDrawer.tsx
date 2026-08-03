import { CodeEditor } from "@/options/invert-ide/shared/CodeEditor";
import { IconButton } from "@/shared/components/icon-button/IconButton";
import { Tab } from "@/shared/components/tab-list/Tab";
import { TabContent } from "@/shared/components/tab-list/TabContent";
import { TabList } from "@/shared/components/tab-list/TabList";
import { TabListTitle } from "@/shared/components/tab-list/TabListTitle";
import { ScriptEditorDrawerTab } from "@shared/storage";
import { ChevronsDown, ChevronsUp, AlertCircle } from "lucide-react";
import { Userscript } from "@shared/model";
import { ErrorPanel } from "./ErrorPanel";
import { useAppDispatch, useAppSelector } from "@/shared/store/hooks";
import {
  selectOutputDrawerActiveTab,
  setOutputDrawerActiveTab,
} from "@/shared/store/slices/ui";
import { selectErrorCount } from "@/shared/store/slices/workspace";
import { CompilationError } from "@shared/errors";
import type * as monaco from "monaco-editor";

type ScriptEditorDrawerProps = {
  script: Userscript;
  javascript: string;
  css: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  editorInstances?: Partial<
    Record<CompilationError["language"], monaco.editor.IStandaloneCodeEditor>
  >;
};

export function ScriptEditorDrawer({
  script,
  javascript,
  css,
  isCollapsed,
  onToggleCollapse,
  editorInstances,
}: ScriptEditorDrawerProps) {
  const dispatch = useAppDispatch();
  const activeTab = useAppSelector(selectOutputDrawerActiveTab);
  const errorCount = useAppSelector((state) =>
    selectErrorCount(state, script.id)
  );

  const onTabChange = (tab: ScriptEditorDrawerTab) => {
    dispatch(setOutputDrawerActiveTab(tab));
  };

  return (
    <TabList
      className="flex h-full flex-col overflow-hidden"
      barClassName="shrink-0 h-9 pl-md pr-xs bg-surface-raised border-b border-border"
    >
      <TabListTitle>{"// problems"}</TabListTitle>
      <Tab
        active={activeTab === "errors"}
        onClick={() => onTabChange("errors")}
      >
        <AlertCircle className="h-3.5 w-3.5" />
        problems
        {errorCount > 0 && (
          <span className="ml-xs inline-flex items-center rounded-[3px] bg-error-surface px-1.25 py-px text-[9px] font-bold tracking-[0.05em] text-error-accent">
            {errorCount}
          </span>
        )}
        {!isCollapsed && (
          <TabContent>
            <ErrorPanel
              scriptId={script.id}
              onErrorClick={(error) => {
                const editorInstance = editorInstances?.[error.language];

                if (editorInstance) {
                  editorInstance.revealLineInCenter(error.line);
                  editorInstance.setPosition({
                    lineNumber: error.line,
                    column: error.column,
                  });
                  editorInstance.focus();
                }
              }}
            />
          </TabContent>
        )}
      </Tab>
      <Tab
        active={activeTab === "javascript"}
        onClick={() => onTabChange("javascript")}
      >
        <span className="inline-flex items-center rounded-[3px] bg-[rgba(240,219,79,0.12)] px-1.25 py-px text-[9px] font-bold tracking-[0.05em] text-[#f0db4f] uppercase">
          js
        </span>
        javascript
        {!isCollapsed && (
          <TabContent>
            <CodeEditor
              modelId={`javascript-compiled-${script}`}
              language="typescript"
              contents={javascript}
              editable={false}
              settingsOverride={{ fontSize: 12 }}
            />
          </TabContent>
        )}
      </Tab>
      <Tab active={activeTab === "css"} onClick={() => onTabChange("css")}>
        <span className="inline-flex items-center rounded-[3px] bg-[rgba(111,168,255,0.12)] px-1.25 py-px text-[9px] font-bold tracking-[0.05em] text-[#6fa8ff] uppercase">
          css
        </span>
        css
        {!isCollapsed && (
          <TabContent>
            <CodeEditor
              modelId={`css-compiled-${script}`}
              language="scss"
              contents={css}
              editable={false}
              settingsOverride={{ fontSize: 12 }}
            />
          </TabContent>
        )}
      </Tab>
      <IconButton
        className="ml-auto"
        icon={isCollapsed ? ChevronsUp : ChevronsDown}
        variant="secondary"
        size="sm"
        onClick={onToggleCollapse}
        title={isCollapsed ? "Expand drawer" : "Collapse drawer"}
      />
    </TabList>
  );
}
