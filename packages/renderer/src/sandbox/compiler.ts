import {
  Userscript,
  UserscriptCompileResult,
  getScriptModulePath,
} from "@shared/model";
import {
  CompiledOutputBuildOptions,
  createCompiledCodeBuildMetadata,
} from "./compiled-build-metadata";

export {
  createCompiledCodeBuildMetadata,
  getCompiledOutputBuildOptions,
  isCompiledCodeBuildCurrent,
  type CompiledOutputBuildOptions,
} from "./compiled-build-metadata";

interface BuildWorkerRequest {
  type: "compile";
  id: string;
  sourceCode: string;
  shared?: boolean;
  moduleName?: string;
  minify?: boolean;
}

interface BuildWorkerResponse {
  type: "compile-result" | "worker-ready";
  id?: string;
  success?: boolean;
  code?: string;
  error?: string;
}

/**
 * Off-thread JavaScript build pipeline (transpile → shared-module transform →
 * optional minify). TypeScript and terser live in the dedicated build-worker
 * entry, not in the main options bundle.
 */
class BuildWorkerClient {
  private static worker: Worker | null = null;
  private static isReady = false;
  private static readyPromise: Promise<void> | null = null;
  private static pendingRequests = new Map<
    string,
    { resolve: (result: UserscriptCompileResult) => void }
  >();

  private static handleWorkerFailure(error: Error): void {
    this.isReady = false;
    this.readyPromise = null;

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    for (const pending of this.pendingRequests.values()) {
      pending.resolve({ success: false, error });
    }

    this.pendingRequests.clear();
  }

  static initialize(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise((resolve, reject) => {
      try {
        const workerUrl =
          typeof chrome !== "undefined" && chrome.runtime?.getURL
            ? chrome.runtime.getURL("build-worker.js")
            : new URL("/build-worker.js", window.location.origin).href;

        this.worker = new Worker(workerUrl);

        const initTimeout = setTimeout(() => {
          this.handleWorkerFailure(
            new Error("Build worker failed to initialize within 15 seconds.")
          );
          reject(
            new Error("Build worker failed to initialize within 15 seconds.")
          );
        }, 15000);

        this.worker.addEventListener(
          "message",
          (event: MessageEvent<BuildWorkerResponse>) => {
            if (event.data?.type === "worker-ready") {
              clearTimeout(initTimeout);
              this.isReady = true;
              resolve();
              return;
            }

            if (event.data?.type === "compile-result" && event.data.id) {
              const pending = this.pendingRequests.get(event.data.id);

              if (!pending) {
                return;
              }

              this.pendingRequests.delete(event.data.id);

              if (event.data.success) {
                pending.resolve({
                  success: true,
                  code: event.data.code,
                });
              } else {
                pending.resolve({
                  success: false,
                  error: new Error(
                    event.data.error ?? "Unknown compilation error"
                  ),
                });
              }
            }
          }
        );

        this.worker.addEventListener("error", (event) => {
          clearTimeout(initTimeout);
          const error = new Error(event.message || "Build worker failed.");
          const wasReady = this.isReady;

          this.handleWorkerFailure(error);

          if (!wasReady) {
            reject(error);
          }
        });
      } catch (error) {
        this.readyPromise = null;
        reject(
          error instanceof Error
            ? error
            : new Error("Build worker initialization failed.")
        );
      }
    });

    return this.readyPromise;
  }

  static async compile(
    script: Pick<Userscript, "shared" | "moduleName" | "id">,
    sourceCode: string,
    options: CompiledOutputBuildOptions
  ): Promise<UserscriptCompileResult> {
    if (!this.isReady || !this.worker) {
      try {
        await this.initialize();
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error
              : new Error("Build worker initialization failed."),
        };
      }
    }

    const worker = this.worker;

    if (!worker) {
      return {
        success: false,
        error: new Error("Build worker is not available."),
      };
    }

    return new Promise((resolve) => {
      const id = crypto.randomUUID();

      this.pendingRequests.set(id, { resolve });

      const request: BuildWorkerRequest = {
        type: "compile",
        id,
        sourceCode,
        shared: script.shared,
        moduleName: getScriptModulePath(script),
        minify: options.minifyCompiledOutput,
      };

      worker.postMessage(request);

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          resolve({
            success: false,
            error: new Error("JavaScript compilation timed out."),
          });
        }
      }, 30000);
    });
  }
}

export async function buildUserscriptJavascript(
  script: Pick<Userscript, "shared" | "moduleName" | "id">,
  sourceCode: string,
  options: CompiledOutputBuildOptions
): Promise<UserscriptCompileResult> {
  return BuildWorkerClient.compile(script, sourceCode, options);
}

export async function buildUserscriptStylesheet(
  sourceCode: string,
  options: CompiledOutputBuildOptions
): Promise<UserscriptCompileResult> {
  return SassCompiler.compile(sourceCode, {
    minify: options.minifyCompiledOutput,
  });
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

interface SassCompileRequest {
  type: "compile";
  id: string;
  scss: string;
  minify?: boolean;
}

interface SassCompileResponse {
  type: "compile-result" | "sandbox-ready";
  id?: string;
  success?: boolean;
  css?: string;
  error?: string;
}

/**
 * SASS Compiler that uses a sandboxed iframe to run dart-sass.
 *
 * Chrome Extensions have strict CSP that blocks 'unsafe-eval', which dart-sass requires.
 * By running the compiler in a sandboxed iframe with relaxed CSP, we can use dart-sass.
 */
export class SassCompiler {
  private static iframe: HTMLIFrameElement = null;
  private static isReady = false;
  private static readyPromise: Promise<void> = null;
  private static pendingRequests = new Map<
    string,
    { resolve: (result: UserscriptCompileResult) => void }
  >();

  /**
   * Initialize the sandboxed iframe for SASS compilation.
   * Call this once when the application starts.
   */
  static initialize(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise((resolve, reject) => {
      this.iframe = document.createElement("iframe");
      this.iframe.src = "/sass-sandbox.html";
      this.iframe.style.display = "none";

      const initTimeout = setTimeout(() => {
        this.readyPromise = null;
        reject(
          new Error("SCSS sandbox failed to initialize within 15 seconds.")
        );
      }, 15000);

      const handleMessage = (event: MessageEvent<SassCompileResponse>) => {
        if (event.source !== this.iframe.contentWindow) {
          return;
        }

        if (event.data?.type === "sandbox-ready") {
          clearTimeout(initTimeout);
          this.isReady = true;
          resolve();
          return;
        }

        if (event.data?.type === "compile-result" && event.data.id) {
          const pending = this.pendingRequests.get(event.data.id);

          if (pending) {
            this.pendingRequests.delete(event.data.id);

            if (event.data.success) {
              pending.resolve({
                success: true,
                code: event.data.css,
              });
            } else {
              pending.resolve({
                success: false,
                error: new Error(
                  event.data.error ?? "Unknown SCSS compilation error"
                ),
              });
            }
          }
        }
      };

      window.addEventListener("message", handleMessage);
      document.body.appendChild(this.iframe);
    });

    return this.readyPromise;
  }

  /**
   * Compile SCSS to CSS using the sandboxed dart-sass compiler.
   */
  static async compile(
    scss: string,
    options: { minify?: boolean } = {}
  ): Promise<UserscriptCompileResult> {
    if (!this.isReady || !this.iframe?.contentWindow) {
      try {
        await this.initialize();
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error
              : new Error("SCSS sandbox initialization failed."),
        };
      }
    }

    return new Promise((resolve) => {
      const id = crypto.randomUUID();

      this.pendingRequests.set(id, { resolve });

      const request: SassCompileRequest = {
        type: "compile",
        id,
        scss,
        minify: options.minify ?? false,
      };

      this.iframe!.contentWindow!.postMessage(request, "*");

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          resolve({
            success: false,
            error: new Error("SCSS compilation timed out."),
          });
        }
      }, 10000);
    });
  }
}

/** Eagerly spin up the build worker alongside other sandbox runtimes. */
export function initializeBuildWorker(): Promise<void> {
  return BuildWorkerClient.initialize();
}
