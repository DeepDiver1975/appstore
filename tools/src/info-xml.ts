import { XMLParser, XMLValidator } from "fast-xml-parser";
import { type AppInfo, ValidationError } from "./types.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function requireString(value: unknown, field: string): string {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`info.xml is missing required field <${field}>`);
  }
  return value.trim();
}

/** Parse and structurally validate an appinfo/info.xml string. */
export function parseInfoXml(xml: string): AppInfo {
  const wellFormed = XMLValidator.validate(xml);
  if (wellFormed !== true) {
    throw new ValidationError(`info.xml is not well-formed XML: ${wellFormed.err.msg}`);
  }

  const doc = parser.parse(xml);
  const info = doc?.info;
  if (!info || typeof info !== "object") {
    throw new ValidationError("info.xml has no root <info> element");
  }

  const deps = info.dependencies;
  const owncloud = deps?.owncloud;
  if (!owncloud || typeof owncloud !== "object") {
    throw new ValidationError(
      "info.xml is missing <dependencies><owncloud min-version max-version/>",
    );
  }
  const platformMin = owncloud["@_min-version"];
  const platformMax = owncloud["@_max-version"];
  if (typeof platformMin !== "string" && typeof platformMin !== "number") {
    throw new ValidationError("info.xml <owncloud> is missing min-version");
  }
  if (typeof platformMax !== "string" && typeof platformMax !== "number") {
    throw new ValidationError("info.xml <owncloud> is missing max-version");
  }

  return {
    id: requireString(info.id, "id"),
    name: requireString(info.name, "name"),
    summary: typeof info.summary === "string" ? info.summary.trim() : "",
    description: requireString(info.description, "description"),
    license: requireString(info.licence ?? info.license, "licence"),
    author: requireString(info.author, "author"),
    version: requireString(info.version, "version"),
    categories: toArray(info.category).map((c) => String(c).trim()),
    screenshots: toArray(info.screenshot).map((s) => String(s).trim()),
    platformMin: String(platformMin).trim(),
    platformMax: String(platformMax).trim(),
  };
}
