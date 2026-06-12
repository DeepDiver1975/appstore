import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:https";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestRelease } from "../src/cli/ingest-screenshots.js";
import type { ReleaseRef } from "../src/scan.js";
import { makeTarball } from "./helpers/make-tarball.js";
import { TEST_TLS_CERT, TEST_TLS_KEY } from "./helpers/tls-cert.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

let server: Server;
let port: number;
let prevTlsReject: string | undefined;
beforeAll(async () => {
  prevTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  server = createServer({ key: TEST_TLS_KEY, cert: TEST_TLS_CERT }, (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/good.png" || path === "/good2.png") {
      res.end(PNG);
    } else if (path === "/bad.png") {
      res.end(Buffer.from("not an image"));
    } else {
      res.statusCode = 404;
      res.end("nope");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as { port: number }).port;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (prevTlsReject === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTlsReject;
});

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const url = (p: string) => `https://127.0.0.1:${port}${p}`;

function infoXml(screenshots: string[]): string {
  const tags = screenshots.map((s) => `<screenshot>${s}</screenshot>`).join("");
  return `<?xml version="1.0"?><info><id>foo</id><name>Foo</name>
    <description>d</description><licence>AGPL</licence><author>me</author>
    <version>1.0.0</version><category>tools</category>${tags}
    <dependencies><owncloud min-version="11.0.0" max-version="11.99.99"/></dependencies></info>`;
}

/** Create a release dir with a package.tar.gz declaring the given screenshots. */
async function makeRelease(screenshots: string[]): Promise<ReleaseRef> {
  const root = await mkdtemp(join(tmpdir(), "ingest-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, "apps", "foo", "releases", "1.0.0");
  await mkdir(dir, { recursive: true });
  const tarballPath = join(dir, "package.tar.gz");
  cleanups.push(await makeTarball(tarballPath, { rootDir: "foo", infoXml: infoXml(screenshots) }));
  return { appId: "foo", version: "1.0.0", dir, tarballPath };
}

describe("ingestRelease", () => {
  it("downloads and writes valid screenshots as NN.ext", async () => {
    const ref = await makeRelease([url("/good.png"), url("/good2.png")]);
    const result = await ingestRelease(ref);

    expect(result.written).toEqual(["01.png", "02.png"]);
    expect(result.skipped).toEqual([]);
    const files = (await readdir(join(ref.dir, "screenshots"))).sort();
    expect(files).toEqual(["01.png", "02.png"]);
    const bytes = await readFile(join(ref.dir, "screenshots", "01.png"));
    expect(bytes.equals(PNG)).toBe(true);
  });

  it("is idempotent: a second run leaves existing files untouched", async () => {
    const ref = await makeRelease([url("/good.png")]);
    await ingestRelease(ref);
    const before = await readFile(join(ref.dir, "screenshots", "01.png"));

    const second = await ingestRelease(ref);
    expect(second.alreadyPresent).toBe(true);
    expect(second.written).toEqual([]);
    const after = await readFile(join(ref.dir, "screenshots", "01.png"));
    expect(after.equals(before)).toBe(true);
  });

  it("is best-effort: skips a bad image but still ingests the valid sibling", async () => {
    // The bad URL is first, so the valid one keeps its natural index (02).
    const ref = await makeRelease([url("/bad.png"), url("/good.png")]);
    const result = await ingestRelease(ref);

    expect(result.written).toEqual(["02.png"]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].url).toBe(url("/bad.png"));
    const files = await readdir(join(ref.dir, "screenshots"));
    expect(files).toEqual(["02.png"]);
  });
});
