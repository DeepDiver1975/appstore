import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { addedPackagePaths } from "./check-changeset.js";
import { readInfoXmlFromTarball } from "../package-reader.js";
import { parseInfoXml } from "../info-xml.js";
import { fetchAndValidateImage } from "../image-validate.js";
import { ValidationError } from "../types.js";

const exec = promisify(execFile);

/**
 * Validate every screenshot of each release **newly added** by the PR: each
 * <screenshot> URL must resolve to a reachable image within the supported
 * formats and size/dimension limits (see image-validate). Strict — the first
 * bad screenshot throws. Already-published releases are not re-checked, so a
 * screenshot URL that has rotted on an existing entry never fails an unrelated
 * PR. Network access is required (this fetches the images).
 */
export async function validateAddedScreenshots(baseRef: string, repoRoot: string): Promise<number> {
  const added = await addedPackagePaths(baseRef, repoRoot);
  let count = 0;
  for (const path of added) {
    const xml = await readInfoXmlFromTarball(join(repoRoot, path));
    const info = parseInfoXml(xml);
    for (const url of info.screenshots) {
      await fetchAndValidateImage(url);
      count++;
    }
  }
  return count;
}

/**
 * Usage: tsx src/cli/validate-screenshots.ts <baseRef>
 * Validates screenshots for releases added in <baseRef>...HEAD.
 */
async function main(): Promise<void> {
  const baseRef = process.argv[2];
  if (!baseRef) throw new Error("usage: validate-screenshots <baseRef>");
  const repoRoot = (await exec("git", ["rev-parse", "--show-toplevel"])).stdout.trim();
  const count = await validateAddedScreenshots(baseRef, repoRoot);
  console.log(`Screenshots OK: validated ${count} screenshot(s) across new releases.`);
}

// Only run when executed directly as a CLI, not when imported (e.g. by tests).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    if (err instanceof ValidationError) {
      console.error(`Validation failed: ${err.message}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}
