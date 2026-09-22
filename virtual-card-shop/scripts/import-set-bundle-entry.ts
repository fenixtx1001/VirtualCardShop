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
import { parse } from "csv-parse/sync";

type BundleProductSetFile = {
  key?: unknown;
  deriveCardsFrom?: unknown;
  derivedVariant?: unknown;
  derivedCardNumberPrefix?: unknown;
  [key: string]: unknown;
};

type BundleFile = {
  cardsFile?: unknown;
  productSets?: unknown;
  [key: string]: unknown;
};

type CsvRow = Record<string, string>;

const CSV_COLUMNS = [
  "setKey",
  "cardNumber",
  "player",
  "team",
  "subset",
  "variant",
] as const;

function csvCell(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function serializeCsv(rows: CsvRow[]) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((column) => csvCell(row[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function getPrefixedDerivedSets(bundle: BundleFile) {
  if (!Array.isArray(bundle.productSets)) return [];

  return (bundle.productSets as BundleProductSetFile[]).filter((productSet) => {
    return (
      typeof productSet.derivedCardNumberPrefix === "string" &&
      productSet.derivedCardNumberPrefix.trim().length > 0
    );
  });
}

function expandPrefixedDerivedSets(
  rawCsv: string,
  bundle: BundleFile,
  prefixedSets: BundleProductSetFile[]
) {
  const rows = parse(rawCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as CsvRow[];

  for (const productSet of prefixedSets) {
    const key =
      typeof productSet.key === "string" ? productSet.key.trim() : "";
    const sourceKey =
      typeof productSet.deriveCardsFrom === "string"
        ? productSet.deriveCardsFrom.trim()
        : "";
    const prefix =
      typeof productSet.derivedCardNumberPrefix === "string"
        ? productSet.derivedCardNumberPrefix.trim()
        : "";
    const derivedVariant =
      typeof productSet.derivedVariant === "string"
        ? productSet.derivedVariant.trim()
        : "";

    if (!key || !sourceKey || !prefix) {
      throw new Error(
        "derivedCardNumberPrefix requires key, deriveCardsFrom, and a non-empty prefix."
      );
    }

    if (rows.some((row) => row.setKey?.trim() === key)) {
      throw new Error(
        `Product Set ${key} has explicit CSV rows and derivedCardNumberPrefix; choose one representation.`
      );
    }

    const sourceRows = rows.filter(
      (row) => row.setKey?.trim() === sourceKey
    );
    if (sourceRows.length === 0) {
      throw new Error(
        `Product Set ${key} derives from ${sourceKey}, but no source CSV rows were found.`
      );
    }

    for (const row of sourceRows) {
      const sourceNumber = row.cardNumber?.trim();
      if (!sourceNumber) {
        throw new Error(
          `Product Set ${key} source row is missing cardNumber.`
        );
      }

      rows.push({
        ...row,
        setKey: key,
        cardNumber: `${prefix}${sourceNumber}`,
        variant: derivedVariant || row.variant || "",
      });
    }
  }

  const transformedProductSets = Array.isArray(bundle.productSets)
    ? (bundle.productSets as BundleProductSetFile[]).map((productSet) => {
        const hasPrefix =
          typeof productSet.derivedCardNumberPrefix === "string" &&
          productSet.derivedCardNumberPrefix.trim().length > 0;

        if (!hasPrefix) return productSet;

        const {
          deriveCardsFrom: _deriveCardsFrom,
          derivedVariant: _derivedVariant,
          derivedCardNumberPrefix: _derivedCardNumberPrefix,
          ...explicitProductSet
        } = productSet;
        return explicitProductSet;
      })
    : bundle.productSets;

  return {
    csv: serializeCsv(rows),
    bundle: {
      ...bundle,
      productSets: transformedProductSets,
    },
  };
}

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
  const prefixedSets = getPrefixedDerivedSets(bundle);
  const needsTempFiles = compressed || prefixedSets.length > 0;
  let tempDir: string | null = null;
  let effectiveBundlePath = bundlePath;

  try {
    if (needsTempFiles) {
      tempDir = mkdtempSync(path.join(tmpdir(), "vcs-set-bundle-"));
      const csvPath = path.join(tempDir, "cards.csv");
      const tempBundlePath = path.join(tempDir, "bundle.json");

      const rawCsv = compressed
        ? gunzipSync(readFileSync(cardsPath)).toString("utf8")
        : readFileSync(cardsPath, "utf8");

      if (prefixedSets.length > 0) {
        const expanded = expandPrefixedDerivedSets(
          rawCsv,
          bundle,
          prefixedSets
        );
        writeFileSync(csvPath, expanded.csv, "utf8");
        writeFileSync(
          tempBundlePath,
          JSON.stringify({ ...expanded.bundle, cardsFile: csvPath }, null, 2),
          "utf8"
        );

        console.log(
          `[set-bundle] expanded derived card-number prefixes: ${prefixedSets
            .map((productSet) => {
              const key = String(productSet.key ?? "unknown");
              const prefix = String(productSet.derivedCardNumberPrefix ?? "");
              return `${key}=${prefix}`;
            })
            .join(", ")}`
        );
      } else {
        writeFileSync(csvPath, rawCsv, "utf8");
        writeFileSync(
          tempBundlePath,
          JSON.stringify({ ...bundle, cardsFile: csvPath }, null, 2),
          "utf8"
        );
      }

      effectiveBundlePath = tempBundlePath;

      if (compressed) {
        console.log(
          `[set-bundle] expanded compressed cards file: ${path.relative(
            process.cwd(),
            cardsPath
          )}`
        );
      }
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
