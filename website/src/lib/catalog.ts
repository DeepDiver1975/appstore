import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// The API generator writes to ../_site/api/v1 relative to the website root
// (matching astro.config.mjs `outDir`). Anchor on cwd rather than import.meta.url:
// `astro dev`/`astro build` both run from the website dir, whereas the build's
// emitted module location is an internal Astro detail that changed across majors.
const apiDir = resolve(process.cwd(), "..", "_site", "api", "v1");

export interface CatalogRelease {
  version: string;
  download: string;
  license: string;
  created: string;
  platformMin: string;
  platformMax: string;
}
export interface CatalogApp {
  id: string;
  name: string;
  description: string;
  categories: string[];
  screenshots: { url: string }[];
  publisher: { name: string; url: string };
  releases: CatalogRelease[];
}

/** Join the site base path with a relative path, collapsing duplicate slashes. */
export function withBase(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export interface CatalogCategory {
  id: string;
  name: string;
}

/** Read the generated apps.json from the shared _site output. */
export async function loadApps(): Promise<CatalogApp[]> {
  return JSON.parse(
    await readFile(resolve(apiDir, "apps.json"), "utf8"),
  ) as CatalogApp[];
}

/** Read the generated categories.json, flattening the English translation to a name. */
export async function loadCategories(): Promise<CatalogCategory[]> {
  const raw = JSON.parse(
    await readFile(resolve(apiDir, "categories.json"), "utf8"),
  ) as {
    id: string;
    translations: { en?: { name: string } };
  }[];
  return raw.map((c) => ({ id: c.id, name: c.translations.en?.name ?? c.id }));
}
