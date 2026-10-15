import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export class OutboundFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundFetchError";
  }
}

function privateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

export function isPrivateNetworkAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (isIP(normalized) === 4) return privateIpv4(normalized);
  if (isIP(normalized) !== 6) return true;
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true;
  }
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? privateIpv4(mapped) : false;
}

export function validateOutboundUrlSyntax(
  input: string | URL,
  options: { allowedHosts?: readonly string[]; allowHttp?: boolean } = {}
) {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input) : new URL(input);
  } catch {
    throw new OutboundFetchError("Invalid outbound URL");
  }
  if (url.username || url.password) throw new OutboundFetchError("Outbound URL credentials are forbidden");
  if (url.protocol !== "https:" && !(options.allowHttp && url.protocol === "http:")) {
    throw new OutboundFetchError("Outbound URL must use HTTPS");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || (isIP(hostname) && isPrivateNetworkAddress(hostname))) {
    throw new OutboundFetchError("Private network destinations are forbidden");
  }
  if (options.allowedHosts?.length) {
    const allowed = new Set(options.allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean));
    if (!allowed.has(hostname)) throw new OutboundFetchError("Outbound destination is not allowlisted");
  }
  return url;
}

export async function assertPublicOutboundUrl(
  input: string | URL,
  options: { allowedHosts?: readonly string[]; allowHttp?: boolean } = {}
) {
  const url = validateOutboundUrlSyntax(input, options);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateNetworkAddress(entry.address))) {
    throw new OutboundFetchError("Outbound destination resolves to a private network");
  }
  return url;
}

/** Validate DNS and every redirect target before issuing a server-side GET. */
export async function safeOutboundFetch(
  input: string | URL,
  init: RequestInit = {},
  options: { allowedHosts?: readonly string[]; allowHttp?: boolean; maxRedirects?: number } = {}
) {
  let url = await assertPublicOutboundUrl(input, options);
  let headers = new Headers(init.headers);
  let method = (init.method ?? "GET").toUpperCase();
  let body = init.body;
  const maxRedirects = options.maxRedirects ?? 3;

  for (let redirects = 0; ; redirects++) {
    const response = await fetch(url, { ...init, method, body, headers, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (redirects >= maxRedirects) throw new OutboundFetchError("Too many outbound redirects");
    const location = response.headers.get("location");
    if (!location) throw new OutboundFetchError("Outbound redirect has no location");
    const next = await assertPublicOutboundUrl(new URL(location, url), options);
    if (next.origin !== url.origin) {
      headers = new Headers(headers);
      headers.delete("authorization");
      headers.delete("cookie");
      headers.delete("proxy-authorization");
    }
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
      headers.delete("content-length");
      headers.delete("content-type");
    }
    url = next;
  }
}

export async function readResponseBufferLimited(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new OutboundFetchError("Outbound response is too large");
  if (!response.body) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new OutboundFetchError("Outbound response is too large");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, total);
}
