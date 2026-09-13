import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { describe, expect, it, afterEach, vi } from "vitest";
import {
  createGuardedSourceArchiver,
  isBlockedAddress,
  nodeHttpPerformHop,
  type GuardedSourceArchiverDeps,
  type ResolvedAddress,
} from "../src/storage/sourceArchiver";
import { ValidationError } from "../src/errors";

describe("isBlockedAddress", () => {
  const blocked = [
    "10.0.0.1", // RFC 1918
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "127.0.0.1", // loopback
    "169.254.169.254", // cloud metadata
    "100.64.0.1", // CGNAT
    "224.0.0.1", // multicast
    "255.255.255.255",
    "0.0.0.0",
    "198.18.0.5", // benchmarking
    "192.0.0.1", // IETF protocol assignments
    "::1", // loopback
    "fe80::1", // link-local
    "fd00::1", // unique local
    "ff02::1", // multicast
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "not-an-ip", // fail closed on garbage
  ];
  const allowed = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "203.0.113.5", "2001:4860:4860::8888", "::ffff:8.8.8.8"];

  it.each(blocked)("blocks %s", (addr) => {
    expect(isBlockedAddress(addr)).toBe(true);
  });

  it.each(allowed)("allows %s", (addr) => {
    expect(isBlockedAddress(addr)).toBe(false);
  });
});

describe("createGuardedSourceArchiver (orchestration, injected deps)", () => {
  function archiverWith(opts: {
    resolveAddresses?: (hostname: string) => Promise<ResolvedAddress[]>;
    performHop?: GuardedSourceArchiverDeps["performHop"];
  }) {
    return createGuardedSourceArchiver({
      resolveAddresses: opts.resolveAddresses ?? (async () => [{ address: "8.8.8.8", family: 4 }]),
      performHop: opts.performHop,
      maxRedirects: 3,
    });
  }

  it("returns the bytes and content type on a plain 200", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const archiver = archiverWith({
      performHop: async () => ({ statusCode: 200, contentType: "text/html", bytes }),
    });
    const result = await archiver.archive("https://example.org/article");
    expect(result).toEqual({ bytes, contentType: "text/html" });
  });

  it("rejects an unsupported scheme before resolving or fetching", async () => {
    const resolveAddresses = vi.fn();
    const archiver = archiverWith({ resolveAddresses });
    await expect(archiver.archive("ftp://example.org/file")).rejects.toThrow(ValidationError);
    expect(resolveAddresses).not.toHaveBeenCalled();
  });

  it("rejects a URL that resolves to a blocked address", async () => {
    const performHop = vi.fn();
    const archiver = archiverWith({
      resolveAddresses: async () => [{ address: "127.0.0.1", family: 4 }],
      performHop,
    });
    await expect(archiver.archive("https://internal.example/secret")).rejects.toThrow(ValidationError);
    expect(performHop).not.toHaveBeenCalled();
  });

  it("rejects when any resolved address (of several) is blocked", async () => {
    const archiver = archiverWith({
      resolveAddresses: async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "169.254.169.254", family: 4 },
      ],
    });
    await expect(archiver.archive("https://round-robin.example/x")).rejects.toThrow(ValidationError);
  });

  it("rejects when DNS resolution fails", async () => {
    const archiver = archiverWith({
      resolveAddresses: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    await expect(archiver.archive("https://nonexistent.example/x")).rejects.toThrow(ValidationError);
  });

  it("follows a redirect, re-validating and re-resolving the new URL", async () => {
    const resolveAddresses = vi.fn(async () => [{ address: "8.8.8.8", family: 4 } as ResolvedAddress]);
    const performHop = vi
      .fn()
      .mockResolvedValueOnce({ statusCode: 302, location: "https://example.org/final", contentType: "", bytes: new Uint8Array() })
      .mockResolvedValueOnce({ statusCode: 200, contentType: "application/pdf", bytes: new Uint8Array([9]) });
    const archiver = archiverWith({ resolveAddresses, performHop });

    const result = await archiver.archive("https://example.org/redirect-me");

    expect(result).toEqual({ bytes: new Uint8Array([9]), contentType: "application/pdf" });
    expect(resolveAddresses).toHaveBeenCalledTimes(2);
    expect(resolveAddresses).toHaveBeenNthCalledWith(2, "example.org");
    expect(performHop).toHaveBeenCalledTimes(2);
  });

  it("rejects a redirect with no Location header", async () => {
    const archiver = archiverWith({
      performHop: async () => ({ statusCode: 302, contentType: "", bytes: new Uint8Array() }),
    });
    await expect(archiver.archive("https://example.org/broken-redirect")).rejects.toThrow(ValidationError);
  });

  it("rejects once redirects exceed the configured maximum", async () => {
    const performHop = vi.fn(async () => ({
      statusCode: 302,
      location: "https://example.org/next",
      contentType: "",
      bytes: new Uint8Array(),
    }));
    const archiver = archiverWith({ performHop });
    await expect(archiver.archive("https://example.org/loop")).rejects.toThrow(ValidationError);
    // maxRedirects: 3 → hops 0,1,2,3 fetch, hop 4 is rejected before fetching again.
    expect(performHop).toHaveBeenCalledTimes(4);
  });

  it("rejects a non-2xx final response", async () => {
    const archiver = archiverWith({
      performHop: async () => ({ statusCode: 404, contentType: "text/html", bytes: new Uint8Array() }),
    });
    await expect(archiver.archive("https://example.org/missing")).rejects.toThrow(ValidationError);
  });

  it("rejects an unparseable URL", async () => {
    const archiver = archiverWith({});
    await expect(archiver.archive("not a url")).rejects.toThrow(ValidationError);
  });
});

describe("nodeHttpPerformHop (real transport, against a local server)", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  async function listen(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<number> {
    server = createServer(handler);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    return (server!.address() as { port: number }).port;
  }

  it("fetches a real response's bytes, status, and content type", async () => {
    const port = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "application/pdf" });
      res.end("hello world");
    });
    const result = await nodeHttpPerformHop("127.0.0.1", 4, new URL(`http://placeholder.invalid:${port}/doc`), 1024, 2000);
    expect(result.statusCode).toBe(200);
    expect(result.contentType).toBe("application/pdf");
    expect(Buffer.from(result.bytes).toString()).toBe("hello world");
  });

  it("surfaces a redirect's status and Location without following it", async () => {
    const port = await listen((_req, res) => {
      res.writeHead(302, { location: "https://example.org/elsewhere" });
      res.end();
    });
    const result = await nodeHttpPerformHop("127.0.0.1", 4, new URL(`http://placeholder.invalid:${port}/x`), 1024, 2000);
    expect(result.statusCode).toBe(302);
    expect(result.location).toBe("https://example.org/elsewhere");
  });

  it("aborts once the response exceeds the byte cap", async () => {
    const port = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("x".repeat(1000));
    });
    await expect(
      nodeHttpPerformHop("127.0.0.1", 4, new URL(`http://placeholder.invalid:${port}/big`), 10, 2000),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a declared Content-Length over the cap without reading the body", async () => {
    const port = await listen((_req, res) => {
      res.writeHead(200, { "content-length": "999999" });
      res.end();
    });
    await expect(
      nodeHttpPerformHop("127.0.0.1", 4, new URL(`http://placeholder.invalid:${port}/huge`), 10, 2000),
    ).rejects.toThrow(ValidationError);
  });

  it("times out a response that never arrives", async () => {
    const port = await listen((_req, _res) => {
      // never respond
    });
    await expect(
      nodeHttpPerformHop("127.0.0.1", 4, new URL(`http://placeholder.invalid:${port}/slow`), 1024, 50),
    ).rejects.toThrow(ValidationError);
  });
});
