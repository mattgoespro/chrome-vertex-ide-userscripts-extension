import type {
  CompiledCodeBuildMetadata,
  CompiledCodeEntry,
  EditorSettings,
} from "./model";

export interface CompiledOutputBuildOptions {
  minifyCompiledOutput: boolean;
}

export function getCompiledOutputBuildOptions(
  settings: Partial<EditorSettings>
): CompiledOutputBuildOptions {
  return {
    minifyCompiledOutput: settings.minifyCompiledOutput ?? false,
  };
}

export function createCompiledCodeBuildMetadata(
  options: CompiledOutputBuildOptions
): CompiledCodeBuildMetadata {
  return {
    version: 1,
    minifyCompiledOutput: options.minifyCompiledOutput,
  };
}

export function isCompiledCodeBuildCurrent(
  entry: CompiledCodeEntry | null | undefined,
  options: CompiledOutputBuildOptions
): boolean {
  return (
    entry?.build?.version === 1 &&
    entry.build.minifyCompiledOutput === options.minifyCompiledOutput
  );
}

export function buildCompiledCodeEntry(
  javascript: string,
  css: string,
  options: CompiledOutputBuildOptions
): CompiledCodeEntry {
  return {
    javascript,
    css,
    build: createCompiledCodeBuildMetadata(options),
  };
}
