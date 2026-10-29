"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/** Read by the web app (apps/web/src/lib/desktop.ts) to tell it is running inside the desktop app. */
contextBridge.exposeInMainWorld("piscatioDesktop", {
  signInInBrowser: () => ipcRenderer.send("sign-in-in-browser"),
});
