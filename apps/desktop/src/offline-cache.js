"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

/** Entries not used for this long are dropped on startup (old JS chunks from past deploys). */
const MAX_UNUSED_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Response headers worth replaying. The body is stored already decoded, so content-encoding and
 * content-length must not come back, and set-cookie must never be replayed from disk.
 */
const KEPT_HEADERS = [
  "content-type",
  "cache-control",
  "vary",
  "rsc",
  "x-matched-path",
  "x-nextjs-cache",
  "location",
  // Clerk's script and API are cross-origin; without these the browser rejects the cached copy.
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-expose-headers",
];

/**
 * Clerk calls that end the session; after one succeeds the cached pages (which carry the signed-in
 * user's server-rendered auth state) must not be served again.
 */
const SIGN_OUT_PATH = /^\/v1\/client(\/sessions\/[^/]+\/(end|remove))?$/;

function createOfflineCache({ dir, hosts }) {
  const cacheableHosts = new Set(hosts);

  const fileFor = (url) => path.join(dir, crypto.createHash("sha256").update(url).digest("hex"));

  /** Only GETs from the app and its Clerk instance; API data is cached by the web app itself. */
  function isCacheable(method, url) {
    if (method !== "GET") return false;
    const { hostname, protocol } = new URL(url);
    return protocol === "https:" && cacheableHosts.has(hostname);
  }

  /**
   * Clerk serves its script from a version-range address (…/clerk-js@6/…) that redirects to the
   * exact version, so that redirect must be replayable offline too. Other redirects (sign-in,
   * session handshake) depend on live session state and are never stored.
   */
  function isCacheableRedirect(url) {
    const { hostname, pathname } = new URL(url);
    return hostname.startsWith("clerk.") && pathname.startsWith("/npm/");
  }

  function isSignOut(method, url) {
    const { hostname, pathname } = new URL(url);
    return (method === "POST" || method === "DELETE") && cacheableHosts.has(hostname) && hostname.startsWith("clerk.") && SIGN_OUT_PATH.test(pathname);
  }

  async function put(url, status, headers, body) {
    const kept = {};
    for (const name of KEPT_HEADERS) {
      const value = headers.get(name);
      if (value) kept[name] = value;
    }
    const file = fileFor(url);
    await fs.mkdir(dir, { recursive: true });
    // Body first: a meta file only ever points at a complete body.
    await fs.writeFile(`${file}.body`, body);
    await fs.writeFile(`${file}.json`, JSON.stringify({ url, status, headers: kept, storedAt: Date.now() }));
  }

  /** @returns {Promise<{ status: number, headers: Record<string, string>, body: Buffer } | null>} */
  async function get(url) {
    const file = fileFor(url);
    try {
      const meta = JSON.parse(await fs.readFile(`${file}.json`, "utf8"));
      const body = await fs.readFile(`${file}.body`);
      const now = new Date();
      fs.utimes(`${file}.json`, now, now).catch(() => {});
      return { status: meta.status, headers: meta.headers, body };
    } catch {
      return null;
    }
  }

  async function clear() {
    await fs.rm(dir, { recursive: true, force: true });
  }

  async function prune(now = Date.now()) {
    let names;
    try {
      names = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of names.filter((n) => n.endsWith(".json"))) {
      const meta = path.join(dir, name);
      const { mtimeMs } = await fs.stat(meta).catch(() => ({ mtimeMs: now }));
      if (now - mtimeMs > MAX_UNUSED_AGE_MS) {
        await fs.rm(meta, { force: true });
        await fs.rm(meta.replace(/\.json$/, ".body"), { force: true });
      }
    }
  }

  return { isCacheable, isCacheableRedirect, isSignOut, put, get, clear, prune };
}

module.exports = { createOfflineCache, MAX_UNUSED_AGE_MS };
