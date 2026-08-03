import {
  selectAllUserscripts,
  selectCurrentUserscript,
} from "@/shared/store/slices/userscripts/selectors";
import { ScriptListItem } from "@/shared/components/script-list-item/ScriptListItem";
import { Userscript } from "@shared/model";
import { useSelector } from "react-redux";

type ScriptListProps = {
  scripts?: Userscript[];
  onScriptSelected?: (scriptId: string) => void;
};

export function ScriptList({ scripts, onScriptSelected }: ScriptListProps) {
  // useSelector (untyped) so this list also works under the popup store.
  const currentScript = useSelector(selectCurrentUserscript);
  const reduxScripts = useSelector(selectAllUserscripts);

  const displayScripts = scripts ?? Object.values(reduxScripts ?? {});

  return (
    <div className="flex scrollbar-thin-6 flex-1 flex-col gap-xs overflow-y-auto p-sm">
      {displayScripts.map((script) => (
        <ScriptListItem
          key={script.id}
          script={script}
          active={onScriptSelected ? currentScript?.id === script.id : false}
          onScriptSelected={onScriptSelected}
        />
      ))}
    </div>
  );
}
