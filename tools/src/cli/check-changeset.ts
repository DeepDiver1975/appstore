import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { validateChangeset, type ChangedPath } from "../validate.js";
import { ValidationError } from "../types.js";

const exec = promisify(execFile);

/**
 * Usage: tsx src/cli/check-changeset.ts <baseRef>
 * Diffs HEAD against <baseRef>, then enforces release immutability/collision.
 * "exists on master" is determined by probing the base ref for the release's
 * package via `git cat-file -e <baseRef>:<releaseDir>/package.tar.gz`.
 */
async function main(): Promise<void> {
  const baseRef = process.argv[2];
  if (!baseRef) throw new Error("usage: check-changeset <baseRef>");

  const { stdout } = await exec("git", ["diff", "--name-status", `${baseRef}...HEAD`]);
  const changed: ChangedPath[] = stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const status = parts[0][0] as ChangedPath["status"];
      const path = parts[parts.length - 1];
      return { status, path };
    });

  // A release exists on the base ref iff its package blob is present there.
  const existsCache = new Map<string, boolean>();
  async function existsOnBase(releaseDir: string): Promise<boolean> {
    const cached = existsCache.get(releaseDir);
    if (cached !== undefined) return cached;
    let exists = false;
    try {
      await exec("git", ["cat-file", "-e", `${baseRef}:${releaseDir}/package.tar.gz`]);
      exists = true;
    } catch {
      exists = false;
    }
    existsCache.set(releaseDir, exists);
    return exists;
  }

  // Pre-resolve existence for every release dir touched by the changeset, so the
  // synchronous validateChangeset predicate can read from the cache.
  const RELEASE_RE = /^apps\/([^/]+)\/releases\/([^/]+)\/.+/;
  const dirs = new Set<string>();
  for (const c of changed) {
    const m = RELEASE_RE.exec(c.path);
    if (m) dirs.add(`apps/${m[1]}/releases/${m[2]}`);
  }
  for (const dir of dirs) await existsOnBase(dir);

  validateChangeset(changed, (releaseDir) => existsCache.get(releaseDir) ?? false);
  console.log("Changeset OK: no immutability or collision violations.");
}

main().catch((err: unknown) => {
  if (err instanceof ValidationError) {
    console.error(`Validation failed: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
