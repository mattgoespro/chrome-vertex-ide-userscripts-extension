import CopyWebpackPlugin from "copy-webpack-plugin";
import FaviconsWebpackPlugin from "favicons-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import MonacoEditorWebpackPlugin from "monaco-editor-webpack-plugin";
import path from "path";
import TerserPlugin from "terser-webpack-plugin";
import webpack from "webpack";
import packageJson from "./package.json" with { type: "json" };
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import { ChromeExtensionReloaderWebpackPlugin } from "./plugins/index.ts";

const __dirname = import.meta.dirname;

export default (
  _args: unknown,
  { mode }: { mode: "development" | "production" }
) =>
  ({
    mode,
    devtool: mode === "production" ? false : "source-map",
    entry: {
      background: {
        import: "./packages/runtime/src/background.ts",
        filename: "background.js",
      },
      popup: {
        import: "./packages/renderer/src/popup/index.tsx",
        filename: "popup.js",
      },
      options: {
        import: "./packages/renderer/src/options/index.tsx",
        filename: "options.js",
      },
      "sass-sandbox": {
        import: "./packages/renderer/src/sandbox/sass-sandbox.ts",
        filename: "sass-sandbox.js",
      },
      "build-worker": {
        import: "./packages/renderer/src/sandbox/build-worker.ts",
        filename: "build-worker.js",
      },
    },
    stats: "errors-warnings",
    output: {
      path: path.join(__dirname, "dist"),
      filename: "[name].js",
      chunkFilename: "chunks/[chunkhash].js",
      publicPath: "/",
      pathinfo: false, // reduce garbage collector pressure from storing module info for each chunk
      clean: true,
    },
    module: {
      rules: [
        {
          oneOf: [
            {
              test: /\.ts$/,
              use: {
                loader: "esbuild-loader",
                options: {
                  target: "esnext",
                  tsconfig: path.join(
                    __dirname,
                    "packages",
                    "shared",
                    "tsconfig.json"
                  ),
                },
              },
              include: /packages[\\/]shared[\\/]src/,
              exclude: /node_modules/,
            },
            {
              test: /\.ts$/,
              use: {
                loader: "esbuild-loader",
                options: {
                  target: "esnext",
                  tsconfig: path.join(
                    __dirname,
                    "packages",
                    "monaco",
                    "tsconfig.json"
                  ),
                },
              },
              include: /packages[\\/]monaco[\\/]src/,
              exclude: /node_modules/,
            },
            {
              test: /\.ts$/,
              use: {
                loader: "esbuild-loader",
                options: {
                  target: "esnext",
                  tsconfig: path.join(
                    __dirname,
                    "packages",
                    "runtime",
                    "tsconfig.json"
                  ),
                },
              },
              include: /packages[\\/]runtime[\\/]src/,
              exclude: /node_modules/,
            },
            {
              test: /\.tsx?$/,
              use: {
                loader: "esbuild-loader",
                options: {
                  target: "esnext",
                  loader: "tsx",
                  tsconfig: path.join(
                    __dirname,
                    "packages",
                    "renderer",
                    "tsconfig.json"
                  ),
                  jsx: "automatic",
                },
              },
              include: /packages[\\/]renderer[\\/]src/,
              exclude: /node_modules/,
            },
          ],
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader", "postcss-loader"],
        },
        {
          // Fonts bundled with monaco-editor
          test: /\.ttf$/,
          type: "asset/resource",
          generator: {
            filename: "assets/fonts/[name][ext]",
          },
        },
      ],
      noParse: [
        /node_modules[\\/]typescript[\\/]lib[\\/]typescript\.js/,
        /node_modules[\\/]sass[\\/]sass\.dart\.js/,
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js", ".css"],
      alias: {
        "@": path.resolve(__dirname, "packages/renderer/src/"),
        "@shared": path.resolve(__dirname, "packages/shared/src/"),
        "@packages/monaco": path.resolve(__dirname, "packages/monaco/src/"),
        "monaco-editor$": "monaco-editor/esm/vs/editor/editor.api.js",
      },
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./packages/renderer/src/popup/index.html",
        filename: "popup.html",
        chunks: ["popup"],
      }),
      new HtmlWebpackPlugin({
        template: "./packages/renderer/src/options/index.html",
        filename: "options.html",
        chunks: ["options"],
      }),
      new MonacoEditorWebpackPlugin({
        languages: ["typescript", "scss", "javascript", "css"],
        filename: "monaco-editor/workers/[name].worker.js",
        globalAPI: true,
        monacoEditorPath: path.resolve(
          __dirname,
          "node_modules",
          "monaco-editor"
        ),
      }),
      new ForkTsCheckerWebpackPlugin({
        typescript: {
          configFile: path.join(__dirname, "tsconfig.json"),
          memoryLimit: 4096,
        },
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.join(__dirname, "public", "manifest.json"),
            to: path.join(__dirname, "dist"),
            transform: (content) => {
              const manifest: chrome.runtime.ManifestV3 = JSON.parse(
                content.toString()
              );

              delete manifest.$schema;
              manifest.description = packageJson.description;
              manifest.version = packageJson.version;

              return JSON.stringify(manifest);
            },
          },
          {
            from: path.join(
              __dirname,
              "packages",
              "renderer",
              "src",
              "sandbox",
              "sass-sandbox.html"
            ),
            to: path.join(__dirname, "dist"),
          },
        ],
      }),
      new FaviconsWebpackPlugin({
        logo: path.resolve(__dirname, "public", "assets", "icon.png"),
        mode: "webapp",
        cache: true,
        outputPath: "assets/favicons",
        prefix: "assets/favicons/",
        favicons: {
          icons: {
            android: false,
            appleIcon: false,
            appleStartup: false,
            windows: false,
            yandex: false,
            favicons: true,
          },
        },
      }),
      mode === "development"
        ? new ChromeExtensionReloaderWebpackPlugin({
            consoleOptions: {
              captureLevels: ["warn", "error"],
            },
            excludeAssets: ["sass-sandbox.html", "popup.html"],
            verbose: true,
          })
        : undefined,
    ],
    optimization: {
      minimize: mode === "production",
      minimizer:
        mode === "production"
          ? [
              new TerserPlugin({
                extractComments: false,
              }),
            ]
          : undefined,
      splitChunks:
        mode === "production"
          ? {
              cacheGroups: {
                monacoEditor: {
                  test: /[\\/]node_modules[\\/]monaco-editor[\\/]/,
                  name: "monaco-editor",
                  filename: "monaco-editor/[chunkhash].js",
                  chunks: "all",
                },
              },
            }
          : undefined,
    },
    cache: {
      type: "filesystem",
    },
  }) satisfies webpack.Configuration;
