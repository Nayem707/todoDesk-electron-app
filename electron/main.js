import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { initDatabase, closeDatabase } from "./database/connection.js";
import { registerIpcHandlers } from "./ipc/register.js";
import { startClipboardWatcher, stopClipboardWatcher } from "./clipboardWatcher.js";
import { loadWindowState, saveWindowState } from "./windowState.js";
import { shutdown as shutdownFormAssistant } from "./formAssistant/formAssistantService.js";
import { shutdown as shutdownWebAudit } from "./webAudit/webAuditService.js";
import { shutdown as shutdownTraceroute } from "./traceroute/tracerouteService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.ELECTRON_DEV === "1";

/** @type {BrowserWindow | null} */
let mainWindow = null;

function getMainWindow() {
  return mainWindow;
}

async function createWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 1024,
    minHeight: 680,
    title: "TodoDesk",
    icon: path.join(__dirname, "icon.png"),
    show: false,
    frame: false,
    backgroundColor: "#141210",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (state.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const persistBounds = () => {
    if (mainWindow) {
      saveWindowState(mainWindow);
    }
  };

  mainWindow.on("resize", persistBounds);
  mainWindow.on("move", persistBounds);
  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window:maximized", true);
    persistBounds();
  });
  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window:maximized", false);
    persistBounds();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev) {
    await mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.setName("TodoDesk");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      await initDatabase();
      registerIpcHandlers(getMainWindow);
      startClipboardWatcher(() => {
        getMainWindow()?.webContents.send("clipboard:changed");
      });
      await createWindow();
    } catch (error) {
      console.error("[startup]", error);
      app.quit();
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});

app.on("before-quit", () => {
  stopClipboardWatcher();
  void shutdownFormAssistant();
  shutdownWebAudit();
  shutdownTraceroute();
  if (mainWindow) {
    saveWindowState(mainWindow);
  }
  closeDatabase();
});

ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on("window:close", () => mainWindow?.close());
ipcMain.handle("window:isMaximized", () => Boolean(mainWindow?.isMaximized()));
