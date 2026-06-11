import { type AppInfo, ValidationError } from "./types.js";
import { isValidCategory } from "./categories.js";
import { parseInfoXml } from "./info-xml.js";
import { readInfoXmlFromTarball } from "./package-reader.js";
import type { ReleaseRef } from "./scan.js";

/**
 * Validate one release: the tarball parses, its info.xml is schema-valid, the
 * folder appId/version match info.xml, and every category is supported.
 * Returns the parsed AppInfo on success; throws ValidationError otherwise.
 */
export async function validateRelease(ref: ReleaseRef): Promise<AppInfo> {
  const xml = await readInfoXmlFromTarball(ref.tarballPath);
  const info = parseInfoXml(xml);

  if (info.id !== ref.appId) {
    throw new ValidationError(
      `app id mismatch: folder is "apps/${ref.appId}/" but info.xml <id> is "${info.id}"`,
    );
  }
  if (info.version !== ref.version) {
    throw new ValidationError(
      `version mismatch: folder is ".../releases/${ref.version}/" but info.xml <version> is "${info.version}"`,
    );
  }
  if (info.categories.length === 0) {
    throw new ValidationError(`app "${info.id}" declares no <category> in info.xml`);
  }
  for (const cat of info.categories) {
    if (!isValidCategory(cat)) {
      throw new ValidationError(
        `app "${info.id}" uses unknown category "${cat}" (not a supported marketplace category)`,
      );
    }
  }
  return info;
}
