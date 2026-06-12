import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { scanApps, type ReleaseRef } from "../scan.js";
import { readInfoXmlFromTarball } from "../package-reader.js";
import { parseInfoXml } from "../info-xml.js";
import { fetchAndValidateImage, extForFormat } from "../image-validate.js";
import { listScreenshots, screenshotsDir } from "../screenshots.js";

/** Outcome of ingesting one release's screenshots. */
export interface IngestResult {
  appId: string;
  version: string;
  /** File names written into the release's screenshots/ dir. */
  written: string[];
  /** URLs that failed validation/download and were skipped (best-effort). */
  skipped: { url: string; reason: string }[];
  /** True when the release already had ingested screenshots and was left as-is. */
  alreadyPresent: boolean;
}

/**
 * Download, re-validate, and write the screenshots for a single release into
 * `<releaseDir>/screenshots/NN.ext`. Re-validation here means the bytes written
 * are exactly the bytes that passed validation (no time-of-check/time-of-use
 * gap). Idempotent: a release that already has screenshots is left untouched
 * (its files are immutable, like the package tarball). Best-effort per image: a
 * dead/invalid URL is skipped with a reason while the rest still ingest.
 */
export async function ingestRelease(ref: ReleaseRef): Promise<IngestResult> {
  const result: IngestResult = {
    appId: ref.appId,
    version: ref.version,
    written: [],
    skipped: [],
    alreadyPresent: false,
  };

  if ((await listScreenshots(ref.dir)).length > 0) {
    result.alreadyPresent = true;
    return result;
  }

  const info = parseInfoXml(await readInfoXmlFromTarball(ref.tarballPath));
  if (info.screenshots.length === 0) return result;

  const destDir = screenshotsDir(ref.dir);
  await mkdir(destDir, { recursive: true });

  for (let i = 0; i < info.screenshots.length; i++) {
    const url = info.screenshots[i];
    try {
      const { meta, bytes } = await fetchAndValidateImage(url);
      // 1-based, zero-padded index keeps files stably ordered (01, 02, ...).
      const name = `${String(i + 1).padStart(2, "0")}.${extForFormat(meta.format)}`;
      await writeFile(join(destDir, name), bytes);
      result.written.push(name);
    } catch (err) {
      result.skipped.push({ url, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

/**
 * Usage: tsx src/cli/ingest-screenshots.ts [--apps apps]
 * Ingests screenshots for every release that does not yet have them. Prints a
 * summary; exits 0 even when individual images are skipped (best-effort), so a
 * single rotted URL never blocks the rest of the catalog.
 */
async function main(): Promise<void> {
  const idx = process.argv.indexOf("--apps");
  const appsDir = idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : "apps";

  const refs = await scanApps(appsDir);
  let releasesIngested = 0;
  let imagesWritten = 0;
  let imagesSkipped = 0;

  for (const ref of refs) {
    const r = await ingestRelease(ref);
    if (r.written.length > 0) releasesIngested++;
    imagesWritten += r.written.length;
    imagesSkipped += r.skipped.length;
    for (const s of r.skipped) {
      console.warn(`WARN ${ref.appId}@${ref.version}: skipped screenshot ${s.url} — ${s.reason}`);
    }
  }

  console.log(
    `Ingested ${imagesWritten} screenshot(s) across ${releasesIngested} release(s); ` +
      `${imagesSkipped} skipped.`,
  );
}

// Only run when executed directly as a CLI, not when imported (e.g. by tests).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
