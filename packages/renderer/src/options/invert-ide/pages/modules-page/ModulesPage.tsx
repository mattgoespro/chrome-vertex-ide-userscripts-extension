import { GlobalModule } from "@shared/model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/shared/store/hooks";
import {
  addModule,
  deleteModule,
  selectModules,
  updateModule,
} from "@/shared/store/slices/modules";
import { Button } from "@/shared/components/button/Button";
import { CodeComment } from "@/shared/components/code-comment/CodeComment";
import { CodeLine } from "@/shared/components/code-line/CodeLine";
import { ModuleCard, TypesValidationStatus } from "./ModuleCard";
import { AddModuleDialog } from "./add-module-dialog/AddModuleDialog";
import { validateTypesUrl } from "./validate-module";
import { LoaderCircleIcon } from "lucide-react";
import clsx from "clsx";

type TypesValidationMap = Record<string, TypesValidationStatus>;

export function ModulesPage() {
  const dispatch = useAppDispatch();
  const modules = useAppSelector(selectModules);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [typesValidation, setTypesValidation] = useState<TypesValidationMap>(
    {}
  );
  const [checkingTypes, setCheckingTypes] = useState(false);
  const validationGenerationRef = useRef(0);

  const moduleList = useMemo(() => Object.values(modules ?? {}), [modules]);

  const typedModules = useMemo(
    () => moduleList.filter((module) => module.packageName),
    [moduleList]
  );

  const typedModulesFingerprint = useMemo(
    () =>
      typedModules
        .map((module) => `${module.id}:${module.packageName}`)
        .sort()
        .join("|"),
    [typedModules]
  );

  const runTypesValidation = useCallback(async (targets: GlobalModule[]) => {
    const withTypes = targets.filter(
      (module): module is GlobalModule & { packageName: string } =>
        !!module.packageName
    );

    if (withTypes.length === 0) {
      setTypesValidation({});
      setCheckingTypes(false);
      return;
    }

    const generation = ++validationGenerationRef.current;
    setCheckingTypes(true);
    setTypesValidation(
      Object.fromEntries(
        withTypes.map((module) => [module.id, { status: "checking" as const }])
      )
    );

    const results = await Promise.all(
      withTypes.map(async (module) => {
        const error = await validateTypesUrl(module.packageName);
        return {
          id: module.id,
          status: (error
            ? { status: "error" as const, error }
            : { status: "ok" as const }) satisfies TypesValidationStatus,
        };
      })
    );

    if (generation !== validationGenerationRef.current) {
      return;
    }

    setTypesValidation(
      Object.fromEntries(results.map(({ id, status }) => [id, status]))
    );
    setCheckingTypes(false);
  }, []);

  useEffect(() => {
    runTypesValidation(moduleList);
    // Only re-check when typed packageNames change (not enable/disable).
  }, [runTypesValidation, typedModulesFingerprint]);

  const handleAddModule = useCallback(
    async (module: GlobalModule) => {
      await dispatch(addModule(module)).unwrap();
      setDialogOpen(false);
    },
    [dispatch]
  );

  const handleDeleteModule = useCallback(
    async (moduleId: string) => {
      if (confirm("Delete this module?")) {
        await dispatch(deleteModule(moduleId)).unwrap();
      }
    },
    [dispatch]
  );

  const handleToggleModule = useCallback(
    async (module: GlobalModule) => {
      await dispatch(
        updateModule({ ...module, enabled: !module.enabled })
      ).unwrap();
    },
    [dispatch]
  );

  return (
    <div className="flex-1 p-(--page-padding)">
      <div className="mb-lg flex items-center justify-between border-b border-border pb-sm">
        <CodeLine code="import { Modules } from 'cdn'" />
        <div className="flex items-center gap-2">
          {typedModules.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => void runTypesValidation(moduleList)}
              disabled={checkingTypes}
              className={clsx(checkingTypes && "gap-2")}
            >
              {checkingTypes && (
                <LoaderCircleIcon size={14} className="animate-spin" />
              )}
              {checkingTypes ? "Checking types..." : "Re-check types"}
            </Button>
          )}
          <Button onClick={() => setDialogOpen(true)}>+ Add Module</Button>
        </div>
      </div>
      <div className="flex h-[calc(100%-4rem)] flex-col gap-4">
        {moduleList.map((module) => (
          <ModuleCard
            key={module.id}
            module={module}
            typesValidation={
              module.packageName ? typesValidation[module.id] : undefined
            }
            onToggle={() => handleToggleModule(module)}
            onDelete={() => handleDeleteModule(module.id)}
          />
        ))}
        {moduleList.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center text-center">
            <CodeComment>No modules imported yet.</CodeComment>
          </div>
        )}
      </div>
      <AddModuleDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleAddModule}
      />
    </div>
  );
}
