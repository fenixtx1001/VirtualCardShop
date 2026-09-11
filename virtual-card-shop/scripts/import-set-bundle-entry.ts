import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

type BundleFile = {
  cardsFile?: unknown;
  [key: string]: unknown;
};

function main() {
  const args = process.argv.slice(2);
  const bundleArg = args.find((arg) => !arg.startsWith("--"));

  if (!bundleArg) {
    throw new Error(
      "Usage: npm run import:set-bundle -- <bundle.json> [--apply]"
    );
  }

  const bundlePath = path.resolve(process.cwd(), bundleArg);
  const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as BundleFile;
  const cardsFile =
    typeof bundle.cardsFile === "string" ? bundle.cardsFile.trim() : "";

  if (!cardsFile) {
    throw new Error("Bundle is missing cardsFile.");
  }

  const cardsPath = path.resolve(path.dirname(bundlePath), cardsFile);
  const compressed = cardsPath.toLowerCase().endsWith(".gz");
  let tempDir: string | null = null;
  let effectiveBundlePath = bundlePath;

  try {
    if (compressed) {
      tempDir = mkdtempSync(path.join(tmpdir(), "vcs-set-bundle-"));
      const csvPath = path.join(tempDir, "cards.csv");
      const tempBundlePath = path.join(tempDir, "bundle.json");

      writeFileSync(csvPath, gunzipSync(readFileSync(cardsPath)));
      writeFileSync(
        tempBundlePath,
        JSON.stringify({ ...bundle, cardsFile: csvPath }, null, 2),
        "utf8"
      );

      effectiveBundlePath = tempBundlePath;
      console.log(
        `[set-bundle] expanded compressed cards file: ${path.relative(
          process.cwd(),
          cardsPath
        )}`
      );
    }

    const passthroughFlags = args.filter(
      (arg) => arg !== bundleArg && arg.startsWith("--")
    );
    const tsxCli = path.resolve(
      process.cwd(),
      "node_modules/tsx/dist/cli.mjs"
    );
    const importer = path.resolve(
      process.cwd(),
      "scripts/import-set-bundle.ts"
    );

    const result = spawnSync(
      process.execPath,
      [tsxCli, importer, effectiveBundlePath, ...passthroughFlags],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
      }
    );

    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error("[set-bundle-entry] fatal", error);
  process.exitCode = 1;
}
