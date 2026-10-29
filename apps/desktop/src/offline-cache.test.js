"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { createOfflineCache, MAX_UNUSED_AGE_MS } = require("./offline-cache");
const { isNewer } = require("./version");

const HOSTS = ["piscatiotechnologies.com", "clerk.piscatiotechnologies.com"];

async function makeCache() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "piscatio-cache-"));
  return { dir, cache: createOfflineCache({ dir, hosts: HOSTS }) };
}

test("caches only GETs to the app and Clerk hosts", async () => {
  const { cache } = await makeCache();
  assert.equal(cache.isCacheable("GET", "https://piscatiotechnologies.com/dashboard"), true);
  assert.equal(cache.isCacheable("GET", "https://clerk.piscatiotechnologies.com/v1/client"), true);
  assert.equal(cache.isCacheable("POST", "https://piscatiotechnologies.com/dashboard"), false);
  assert.equal(cache.isCacheable("GET", "https://aquai-api.onrender.com/api/v1/farms"), false);
  assert.equal(cache.isCacheable("GET", "http://piscatiotechnologies.com/"), false);
});

test("recognises Clerk sign-out calls, and only on the Clerk host", async () => {
  const { cache } = await makeCache();
  assert.equal(cache.isSignOut("POST", "https://clerk.piscatiotechnologies.com/v1/client/sessions/sess_1/end"), true);
  assert.equal(cache.isSignOut("DELETE", "https://clerk.piscatiotechnologies.com/v1/client"), true);
  assert.equal(cache.isSignOut("POST", "https://clerk.piscatiotechnologies.com/v1/client/sessions/sess_1/tokens"), false);
  assert.equal(cache.isSignOut("GET", "https://clerk.piscatiotechnologies.com/v1/client"), false);
  assert.equal(cache.isSignOut("DELETE", "https://piscatiotechnologies.com/v1/client"), false);
});

test("round-trips a response, keeping only safe headers", async () => {
  const { cache } = await makeCache();
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    "content-encoding": "br",
    "content-length": "999",
    "set-cookie": "__session=secret",
  });
  await cache.put("https://piscatiotechnologies.com/dashboard", 200, headers, Buffer.from("<html>ok</html>"));

  const hit = await cache.get("https://piscatiotechnologies.com/dashboard");
  assert.equal(hit.status, 200);
  assert.equal(hit.body.toString(), "<html>ok</html>");
  assert.deepEqual(hit.headers, { "content-type": "text/html; charset=utf-8" });
  assert.equal(await cache.get("https://piscatiotechnologies.com/farms"), null);
});

test("clear() removes everything", async () => {
  const { cache } = await makeCache();
  await cache.put("https://piscatiotechnologies.com/a", 200, new Headers(), Buffer.from("a"));
  await cache.clear();
  assert.equal(await cache.get("https://piscatiotechnologies.com/a"), null);
});

test("prune() drops entries unused for longer than the limit", async () => {
  const { dir, cache } = await makeCache();
  await cache.put("https://piscatiotechnologies.com/old", 200, new Headers(), Buffer.from("old"));
  await cache.put("https://piscatiotechnologies.com/new", 200, new Headers(), Buffer.from("new"));
  const old = new Date(Date.now() - MAX_UNUSED_AGE_MS - 60_000);
  const oldMeta = (await fs.readdir(dir)).filter((n) => n.endsWith(".json"));
  for (const name of oldMeta) {
    const meta = JSON.parse(await fs.readFile(path.join(dir, name), "utf8"));
    if (meta.url.endsWith("/old")) await fs.utimes(path.join(dir, name), old, old);
  }

  await cache.prune();
  assert.equal(await cache.get("https://piscatiotechnologies.com/old"), null);
  assert.equal((await cache.get("https://piscatiotechnologies.com/new")).body.toString(), "new");
});

test("isNewer compares numeric version segments", () => {
  assert.equal(isNewer("1.0.1", "1.0.0"), true);
  assert.equal(isNewer("1.2.10", "1.2.9"), true);
  assert.equal(isNewer("1.0.0", "1.0.0"), false);
  assert.equal(isNewer("0.9.9", "1.0.0"), false);
  assert.equal(isNewer("2", "1.9.9"), true);
});

test("stores only Clerk's versioned-script redirects", async () => {
  const { cache } = await makeCache();
  assert.equal(cache.isCacheableRedirect("https://clerk.piscatiotechnologies.com/npm/@clerk/clerk-js@6/dist/clerk.browser.js"), true);
  assert.equal(cache.isCacheableRedirect("https://clerk.piscatiotechnologies.com/v1/client/handshake"), false);
  assert.equal(cache.isCacheableRedirect("https://piscatiotechnologies.com/dashboard"), false);

  const headers = new Headers({ location: "https://clerk.piscatiotechnologies.com/npm/@clerk/clerk-js@6.41.0/dist/clerk.browser.js" });
  await cache.put("https://clerk.piscatiotechnologies.com/npm/@clerk/clerk-js@6/dist/clerk.browser.js", 307, headers, Buffer.alloc(0));
  const hit = await cache.get("https://clerk.piscatiotechnologies.com/npm/@clerk/clerk-js@6/dist/clerk.browser.js");
  assert.equal(hit.status, 307);
  assert.equal(hit.headers.location, headers.get("location"));
});
