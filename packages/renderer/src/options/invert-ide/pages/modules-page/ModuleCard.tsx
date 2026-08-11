import { Checkbox } from "@/shared/components/checkbox/Checkbox";
import { IconButton } from "@/shared/components/icon-button/IconButton";
import { Typography } from "@/shared/components/typography/Typography";
import { GlobalModule } from "@shared/model";
import {
  CheckCircle2,
  DeleteIcon,
  LoaderCircleIcon,
  XCircle,
} from "lucide-react";

export type TypesValidationStatus = {
  status: "idle" | "checking" | "ok" | "error";
  error?: string;
};

type ModuleCardProps = {
  module: GlobalModule;
  typesValidation?: TypesValidationStatus;
  onToggle: () => void;
  onDelete: () => void;
};

export function ModuleCard({
  module,
  typesValidation,
  onToggle,
  onDelete,
}: ModuleCardProps) {
  return (
    <div className="flex items-center gap-sm rounded-default border border-border bg-surface-raised px-md py-sm transition-colors duration-150 hover:border-accent-muted">
      <Checkbox checked={module.enabled} onChange={onToggle} />
      <Typography variant="code" className="shrink-0 text-sm text-syntax-type">
        {module.name}
      </Typography>
      {module.packageName && (
        <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-text-muted-faint">
          <span>@types/{module.packageName}</span>
          {typesValidation?.status === "checking" && (
            <LoaderCircleIcon
              size={12}
              className="animate-spin text-text-muted"
              aria-label="Checking types"
            />
          )}
          {typesValidation?.status === "ok" && (
            <span title="Types OK" className="inline-flex">
              <CheckCircle2
                size={12}
                className="text-accent"
                aria-label="Types reachable"
              />
            </span>
          )}
          {typesValidation?.status === "error" && (
            <span
              className="flex max-w-48 items-center gap-1 truncate text-error-accent"
              title={typesValidation.error}
            >
              <XCircle size={12} className="shrink-0" aria-hidden />
              <span className="truncate">
                {typesValidation.error ?? "Types unreachable"}
              </span>
            </span>
          )}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-muted">
        {module.url}
      </span>
      <IconButton icon={DeleteIcon} variant="danger" onClick={onDelete} />
    </div>
  );
}
