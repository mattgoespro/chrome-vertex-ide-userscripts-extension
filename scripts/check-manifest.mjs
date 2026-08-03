import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const packageJson = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8")
);

const requiredFiles = [
  "manifest.json",
  "background.js",
  "popup.js",
  "popup.html",
  "options.js",
  "options.html",
  "build-worker.js",
  "sass-sandbox.js",
  "sass-sandbox.html",
];

/** Soft budgets for lean surfaces (options/Monaco intentionally larger). */
const sizeBudgets = {
  "background.js": 50 * 1024,
  "popup.js": 400 * 1024,
};

function fail(message) {
  console.error(`check-manifest: ${message}`);
  process.exitCode = 1;
}

if (!existsSync(dist)) {
  fail(`dist/ missing — run pnpm build first`);
  process.exit(1);
}

for (const file of requiredFiles) {
  const filePath = path.join(dist, file);
  if (!existsSync(filePath)) {
    fail(`missing build output: ${file}`);
  }
}

const manifestPath = path.join(dist, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

assert.equal(
  manifest.version,
  packageJson.version,
  `manifest.version (${manifest.version}) must match package.json (${packageJson.version})`
);

assert.equal(manifest.background?.service_worker, "background.js");
assert.equal(manifest.action?.default_popup, "popup.html");
assert.equal(manifest.options_ui?.page, "options.html");

for (const [file, budget] of Object.entries(sizeBudgets)) {
  const size = statSync(path.join(dist, file)).size;
  if (size > budget) {
    fail(
      `${file} is ${size} bytes (budget ${budget}). Investigate popup/background regressions.`
    );
  } else {
    console.log(
      `ok  ${file}: ${size} bytes (budget ${budget})`
    );
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(
  `ok  manifest version ${manifest.version} matches package.json; required assets present`
);
