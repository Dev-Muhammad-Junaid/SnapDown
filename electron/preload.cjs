// Bridge between the renderer and the main process.
//
// Deliberately tiny and fully enumerated: the renderer can ASK for an update
// and listen for progress, but cannot say what to download or where to install
// it. Everything about which release gets fetched is decided in the main
// process against a hardcoded repo, so a compromised page can't turn this into
// an arbitrary code-execution path.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("snapdown", {
    /** Present only in the desktop app — the web build leaves this undefined. */
    isDesktop: true,

    update: {
        /** What the updater is doing right now. A reload loses the renderer's
         *  memory but not the download, which runs in the main process. */
        state: () => ipcRenderer.invoke("update:state"),

        /** Download and verify the latest release. Resolves once it's staged —
         *  nothing is installed and the app keeps running. */
        download: () => ipcRenderer.invoke("update:download"),

        /** Install the already-verified update and relaunch. The app quits
         *  immediately after this resolves. */
        restart: () => ipcRenderer.invoke("update:restart"),

        /** Subscribe to progress. Returns an unsubscribe function. */
        onProgress: (callback) => {
            const handler = (_event, payload) => callback(payload);
            ipcRenderer.on("update:progress", handler);
            return () => ipcRenderer.removeListener("update:progress", handler);
        },

        /** Subscribe to phase changes (locating / downloading / verifying /
         *  installing). Returns an unsubscribe function. */
        onStatus: (callback) => {
            const handler = (_event, payload) => callback(payload);
            ipcRenderer.on("update:status", handler);
            return () => ipcRenderer.removeListener("update:status", handler);
        },
    },

    system: {
        /** Opens System Settings on the Full Disk Access list.
         *
         *  Takes no argument on purpose. The obvious implementation is to
         *  expose `openExternal(url)` and let the page pass the settings URL,
         *  but that hands any script in the renderer the ability to launch
         *  arbitrary URL handlers. The destination is fixed in the main
         *  process instead, so this call can only ever do the one thing. */
        openFullDiskAccess: () => ipcRenderer.invoke("system:open-full-disk-access"),

        /** Reveals SnapDown.app in Finder.
         *
         *  Needed because granting access means dragging the app into the
         *  list, and the app is not always in /Applications. */
        revealApp: () => ipcRenderer.invoke("system:reveal-app"),
    },
});
