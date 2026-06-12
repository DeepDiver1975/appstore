import { readdir } from "node:fs/promises";
import { join } from "node:path";

/** Image extensions ingestion writes (and the website/API serve). */
const SCREENSHOT_EXT_RE = /\.(png|jpg|webp)$/i;

/** The directory holding a release's ingested screenshot files. */
export function screenshotsDir(releaseDir: string): string {
  return join(releaseDir, "screenshots");
}

/**
 * List a release's ingested screenshot file names (e.g. ["01.png", "02.jpg"]),
 * sorted for deterministic output. Returns [] when the release has no
 * screenshots dir yet (readdir order is unspecified, so we always sort).
 */
export async function listScreenshots(releaseDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(screenshotsDir(releaseDir));
  } catch {
    return [];
  }
  return entries.filter((name) => SCREENSHOT_EXT_RE.test(name)).sort();
}
