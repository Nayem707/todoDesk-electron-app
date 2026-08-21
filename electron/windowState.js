import fs from "fs";
import path from "path";
import { app, screen } from "electron";

const DEFAULT_STATE = {
  width: 1280,
  height: 800,
  x: undefined,
  y: undefined,
  isMaximized: false,
};

function getStatePath() {
  return path.join(app.getPath("userData"), "window-state.json");
}

export function loadWindowState() {
  try {
    const raw = fs.readFileSync(getStatePath(), "utf8");
    const parsed = { ...DEFAULT_STATE, ...JSON.parse(raw) };
    return sanitizeState(parsed);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("[window-state] failed to load", error);
    }
    return { ...DEFAULT_STATE };
  }
}

/**
 * @param {import('electron').BrowserWindow} win
 */
export function saveWindowState(win) {
  try {
    const isMaximized = win.isMaximized();
    const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
    const state = {
      ...bounds,
      isMaximized,
    };
    fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    console.error("[window-state] failed to save", error);
  }
}

function sanitizeState(state) {
  const displays = screen.getAllDisplays();
  const visible = displays.some((display) => {
    const { x, y, width, height } = display.workArea;
    const cx = (state.x ?? x) + (state.width ?? DEFAULT_STATE.width) / 2;
    const cy = (state.y ?? y) + (state.height ?? DEFAULT_STATE.height) / 2;
    return cx >= x && cx <= x + width && cy >= y && cy <= y + height;
  });

  if (!visible) {
    return { ...DEFAULT_STATE };
  }

  return {
    width: Math.max(1024, state.width || DEFAULT_STATE.width),
    height: Math.max(680, state.height || DEFAULT_STATE.height),
    x: state.x,
    y: state.y,
    isMaximized: Boolean(state.isMaximized),
  };
}
