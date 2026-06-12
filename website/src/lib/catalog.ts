import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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
  const path = fileURLToPath(new URL("../../../_site/api/v1/apps.json", import.meta.url));
  return JSON.parse(await readFile(path, "utf8")) as CatalogApp[];
}

/** Read the generated categories.json, flattening the English translation to a name. */
export async function loadCategories(): Promise<CatalogCategory[]> {
  const path = fileURLToPath(new URL("../../../_site/api/v1/categories.json", import.meta.url));
  const raw = JSON.parse(await readFile(path, "utf8")) as {
    id: string;
    translations: { en?: { name: string } };
  }[];
  return raw.map((c) => ({ id: c.id, name: c.translations.en?.name ?? c.id }));
}
