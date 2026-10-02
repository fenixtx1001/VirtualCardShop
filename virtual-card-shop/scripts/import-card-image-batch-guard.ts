import { readFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const positional = args.filter(arg => !arg.startsWith("--"));

  if (apply) {
    if (positional.length !== 1) {
      throw new Error("Usage: npm run import:card-images -- <manifest.json> [--validate-only | --apply]");
    }

    const manifestPath = path.resolve(positional[0]);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const reconstructions: string[] = [];

    for (const card of manifest.cards ?? []) {
      for (const side of ["front", "back"] as const) {
        if (card?.[side]?.sourceType === "ai_reconstruction") {
          reconstructions.push(`${card.cardId} ${side}`);
        }
      }
    }

    if (reconstructions.length) {
      throw new Error(
        `BLOCKED: exact-only Image Factory policy prohibits automated import of ai_reconstruction assets. ` +
        `Review these manually instead: ${reconstructions.join(", ")}`
      );
    }
  }

  await import("./import-card-image-batch");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
