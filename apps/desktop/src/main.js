"use strict";

const path = require("node:path");
const fs = require("node:fs/promises");
const { app, BrowserWindow, Menu, dialog, net, session, shell } = require("electron");
const { createOfflineCache } = require("./offline-cache");
const { isNewer } = require("./version");

/** Overridable for local development, e.g. PISCATIO_URL=http://localhost:3000. */
const APP_URL = new URL(process.env.PISCATIO_URL ?? "https://piscatiotechnologies.com");
const START_PATH = "/dashboard";
const CLERK_HOST = "clerk.piscatiotechnologies.com";
const RELEASES_API = "https://api.github.com/repos/adilyavuzoter6-debug/Ayo-the-UNKNOWN/releases/latest";
const RELEASES_PAGE = "https://github.com/adilyavuzoter6-debug/Ayo-the-UNKNOWN/releases/latest";
const OFFLINE_PAGE = path.join(__dirname, "offline.html");
/** Test hook: behave as if the network were down, without touching the machine's connection. */
const FORCE_OFFLINE = process.env.PISCATIO_FORCE_OFFLINE === "1";

const APP_HOSTS = [APP_URL.hostname, `www.${APP_URL.hostname}`, CLERK_HOST, "img.clerk.com"];

let mainWindow = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(start);
}

function isAppUrl(url) {
  try {
    return APP_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Every https request from the app window goes through here: network first, and when that fails,
 * the copy saved the last time it succeeded. That is what lets the app start and move between
 * already-visited pages with no connection; the data on those pages comes from the web app's own
 * IndexedDB cache.
 *
 * GETs go through fetchWithoutFollowing so a redirect reaches the window as a redirect: Clerk's
 * session handshake depends on it, and so does Next's router knowing which page it is on.
 */
/**
 * Electron's fetch either follows redirects silently (leaving `response.url` empty, so the window
 * never learns its address changed) or, with redirect: "manual", rejects. net.request reports the
 * redirect instead, by which point the session has already stored any cookies the redirect set.
 */
function fetchWithoutFollowing(ses, request) {
  return new Promise((resolve, reject) => {
    const outgoing = net.request({
      method: request.method,
      url: request.url,
      session: ses,
      useSessionCookies: true,
      redirect: "manual",
      // Without this the request would come straight back into installOfflineLayer's handler.
      bypassCustomProtocolHandlers: true,
    });
    request.headers.forEach((value, name) => {
      try {
        outgoing.setHeader(name, value);
      } catch {
        // Headers the network stack owns (host, connection, …) can't be set by hand.
      }
    });
    outgoing.on("redirect", (status, _method, redirectUrl) => {
      outgoing.abort();
      resolve(Response.redirect(redirectUrl, status));
    });
    outgoing.on("response", (incoming) => {
      const chunks = [];
      incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("error", reject);
      incoming.on("end", () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          // The body arrives decoded, and cookies are already in the session's jar.
          if (["set-cookie", "content-encoding", "content-length"].includes(name)) continue;
          for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v);
        }
        const body = [204, 304].includes(incoming.statusCode) ? null : Buffer.concat(chunks);
        resolve(new Response(body, { status: incoming.statusCode, statusText: incoming.statusMessage, headers }));
      });
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

function installOfflineLayer(ses, cache) {
  ses.protocol.handle("https", async (request) => {
    const { method, url } = request;
    const cacheable = cache.isCacheable(method, url);

    try {
      if (FORCE_OFFLINE) throw new Error("PISCATIO_FORCE_OFFLINE");
      const response =
        method === "GET" || method === "HEAD"
          ? await fetchWithoutFollowing(ses, request)
          : await ses.fetch(request, { bypassCustomProtocolHandlers: true });

      if (cache.isSignOut(method, url) && response.ok) {
        await cache.clear();
      }
      if (cacheable && response.status >= 300 && response.status < 400 && cache.isCacheableRedirect(url)) {
        cache.put(url, response.status, response.headers, Buffer.alloc(0)).catch(() => {});
        return response;
      }
      if (!cacheable || response.status !== 200) {
        return response;
      }
      const body = Buffer.from(await response.arrayBuffer());
      cache.put(url, response.status, response.headers, body).catch(() => {});
      const headers = new Headers(response.headers);
      headers.delete("content-encoding");
      headers.delete("content-length");
      return new Response(body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      if (cacheable) {
        const hit = await cache.get(url);
        if (hit) {
          const redirect = hit.status >= 300 && hit.status < 400;
          return new Response(redirect ? null : hit.body, { status: hit.status, headers: hit.headers });
        }
      }
      console.warn(`[offline-layer] ${method} ${url}: ${error?.message ?? error}`);
      if (method === "GET" && (request.headers.get("accept") ?? "").includes("text/html")) {
        return new Response(await fs.readFile(OFFLINE_PAGE), {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      throw error;
    }
  });
}

function createWindow(ses) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "Piscatio",
    backgroundColor: "#ffffff",
    show: false,
    webPreferences: {
      session: ses,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Links leaving the app (help pages, mail links, other sites) open in the real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(new URL(START_PATH, APP_URL).toString());
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: "Piscatio",
            submenu: [
              { role: "about", label: "Piscatio Hakkında" },
              { label: "Güncellemeleri Denetle…", click: () => checkForUpdates({ manual: true }) },
              { type: "separator" },
              { role: "hide", label: "Piscatio'yu Gizle" },
              { role: "hideOthers", label: "Diğerlerini Gizle" },
              { role: "unhide", label: "Tümünü Göster" },
              { type: "separator" },
              { role: "quit", label: "Piscatio'dan Çık" },
            ],
          },
        ]
      : []),
    {
      label: "Düzen",
      submenu: [
        { role: "undo", label: "Geri Al" },
        { role: "redo", label: "Yinele" },
        { type: "separator" },
        { role: "cut", label: "Kes" },
        { role: "copy", label: "Kopyala" },
        { role: "paste", label: "Yapıştır" },
        { role: "selectAll", label: "Tümünü Seç" },
      ],
    },
    {
      label: "Görünüm",
      submenu: [
        { role: "reload", label: "Yenile" },
        { type: "separator" },
        { role: "resetZoom", label: "Gerçek Boyut" },
        { role: "zoomIn", label: "Yakınlaştır" },
        { role: "zoomOut", label: "Uzaklaştır" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Tam Ekran" },
      ],
    },
    {
      label: "Pencere",
      submenu: [
        { role: "minimize", label: "Küçült" },
        ...(isMac ? [{ role: "zoom", label: "Büyüt" }] : [{ role: "close", label: "Kapat" }]),
      ],
    },
    ...(isMac
      ? []
      : [
          {
            label: "Yardım",
            submenu: [
              { label: "Güncellemeleri Denetle…", click: () => checkForUpdates({ manual: true }) },
              { role: "about", label: "Piscatio Hakkında" },
            ],
          },
        ]),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * The screens themselves come from the website and update on every deploy, so only the shell
 * needs a release now and then. Installers are unsigned, which rules out silent self-updates on
 * macOS; instead the user is pointed at the download page.
 */
async function checkForUpdates({ manual = false } = {}) {
  try {
    const response = await net.fetch(RELEASES_API, { headers: { accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    const release = await response.json();
    const latest = String(release.tag_name ?? "").replace(/^desktop-v/, "");
    if (latest && isNewer(latest, app.getVersion())) {
      const { response: choice } = await dialog.showMessageBox(mainWindow, {
        type: "info",
        buttons: ["İndir", "Daha Sonra"],
        defaultId: 0,
        message: `Piscatio ${latest} hazır`,
        detail: `Şu an ${app.getVersion()} sürümünü kullanıyorsunuz. Yeni sürümü indirip kurabilirsiniz.`,
      });
      if (choice === 0) void shell.openExternal(release.html_url ?? RELEASES_PAGE);
    } else if (manual) {
      await dialog.showMessageBox(mainWindow, { type: "info", message: "Piscatio güncel", detail: `Sürüm ${app.getVersion()}` });
    }
  } catch {
    if (manual) {
      await dialog.showMessageBox(mainWindow, {
        type: "warning",
        message: "Güncellemeler denetlenemedi",
        detail: "İnternet bağlantınızı kontrol edip tekrar deneyin.",
      });
    }
  }
}

async function start() {
  const ses = session.fromPartition("persist:piscatio");
  // Some sign-in providers (Google) refuse embedded browsers they recognise by user agent.
  ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|piscatio|@aquai\/desktop)\/\S+/gi, ""));

  const cache = createOfflineCache({ dir: path.join(app.getPath("userData"), "offline-cache"), hosts: APP_HOSTS });
  void cache.prune();
  installOfflineLayer(ses, cache);

  app.setAboutPanelOptions({ applicationName: "Piscatio", applicationVersion: app.getVersion(), copyright: "Piscatio Technologies" });
  buildMenu();
  createWindow(ses);

  app.on("activate", () => {
    if (!mainWindow) createWindow(ses);
  });

  setTimeout(() => void checkForUpdates(), 10_000);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
