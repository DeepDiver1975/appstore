import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import {
  DEFAULT_IMAGE_LIMITS,
  enforceImageLimits,
  extForFormat,
  fetchAndValidateImage,
  sniffAndMeasure,
  type ImageMeta,
} from "../src/image-validate.js";
import { ValidationError } from "../src/types.js";

// Tiny valid 1x1 fixtures, one per supported format.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==",
  "base64",
);
const WEBP = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");
// A GIF — a real image that image-size recognizes, but not one we support.
const GIF = Buffer.from("R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==", "base64");

describe("sniffAndMeasure", () => {
  it("measures a PNG", () => {
    expect(sniffAndMeasure(PNG)).toEqual({
      format: "png",
      width: 1,
      height: 1,
      byteLength: PNG.byteLength,
    });
  });
  it("measures a JPEG (reported as jpeg, not jpg)", () => {
    expect(sniffAndMeasure(JPEG).format).toBe("jpeg");
  });
  it("measures a WebP", () => {
    expect(sniffAndMeasure(WEBP).format).toBe("webp");
  });
  it("rejects a recognized-but-unsupported format (GIF)", () => {
    expect(() => sniffAndMeasure(GIF)).toThrow(/unsupported image format "gif"/i);
  });
  it("rejects non-image bytes", () => {
    expect(() => sniffAndMeasure(Buffer.from("not an image at all"))).toThrow(ValidationError);
  });
  it("rejects a truncated header", () => {
    expect(() => sniffAndMeasure(PNG.subarray(0, 8))).toThrow(ValidationError);
  });
});

describe("extForFormat", () => {
  it("maps jpeg to jpg and passes others through", () => {
    expect(extForFormat("jpeg")).toBe("jpg");
    expect(extForFormat("png")).toBe("png");
    expect(extForFormat("webp")).toBe("webp");
  });
});

describe("enforceImageLimits", () => {
  const base: ImageMeta = { format: "png", width: 100, height: 100, byteLength: 1000 };

  it("accepts an image within limits", () => {
    expect(() => enforceImageLimits(base, DEFAULT_IMAGE_LIMITS)).not.toThrow();
  });
  it("rejects an over-sized byte length", () => {
    expect(() =>
      enforceImageLimits({ ...base, byteLength: 99 }, { ...DEFAULT_IMAGE_LIMITS, maxBytes: 50 }),
    ).toThrow(/bytes/i);
  });
  it("rejects an over-long edge", () => {
    expect(() => enforceImageLimits({ ...base, width: 5000 }, DEFAULT_IMAGE_LIMITS)).toThrow(
      /per-side/i,
    );
  });
  it("rejects a pixel bomb when the edge cap is raised", () => {
    // With a large maxEdge the per-side check passes; only the pixel cap bites.
    expect(() =>
      enforceImageLimits(
        { ...base, width: 6000, height: 6000 },
        { ...DEFAULT_IMAGE_LIMITS, maxEdge: 20_000 },
      ),
    ).toThrow(/pixel/i);
  });
});

describe("fetchAndValidateImage", () => {
  let server: Server;
  let port: number;
  // Server behavior is keyed off the request path.
  const handler = (path: string): { status?: number; body?: Buffer; delayMs?: number } => {
    switch (path) {
      case "/ok.png":
        return { body: PNG };
      case "/huge":
        return { body: Buffer.alloc(64 * 1024, 1) }; // 64 KB of non-image bytes
      case "/notimage":
        return { body: Buffer.from("hello world") };
      case "/404":
        return { status: 404, body: Buffer.from("nope") };
      case "/slow":
        return { body: PNG, delayMs: 200 };
      default:
        return { status: 404 };
    }
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      const r = handler((req.url ?? "/").split("?")[0]);
      const send = () => {
        res.statusCode = r.status ?? 200;
        res.end(r.body ?? Buffer.alloc(0));
      };
      if (r.delayMs) setTimeout(send, r.delayMs);
      else send();
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as { port: number }).port;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const url = (p: string) => `http://127.0.0.1:${port}${p}`;

  it("fetches and validates a good image", async () => {
    const { meta, bytes } = await fetchAndValidateImage(url("/ok.png"));
    expect(meta.format).toBe("png");
    expect(bytes.equals(PNG)).toBe(true);
  });
  it("rejects a response that exceeds the byte cap (and stops reading)", async () => {
    await expect(fetchAndValidateImage(url("/huge"), { maxBytes: 1024 })).rejects.toThrow(
      /size limit/i,
    );
  });
  it("rejects non-image content", async () => {
    await expect(fetchAndValidateImage(url("/notimage"))).rejects.toThrow(ValidationError);
  });
  it("rejects an HTTP error", async () => {
    await expect(fetchAndValidateImage(url("/404"))).rejects.toThrow(/HTTP 404/);
  });
  it("times out a slow response", async () => {
    await expect(fetchAndValidateImage(url("/slow"), { timeoutMs: 20 })).rejects.toThrow(
      /timed out/i,
    );
  });
  it("reports an unreachable host", async () => {
    // Port 1 is reserved and refuses connections.
    await expect(fetchAndValidateImage("http://127.0.0.1:1/x.png")).rejects.toThrow(/unreachable/i);
  });
});
