import { clipboard } from "electron";
import { recordExternalClipboardCopy } from "./database/clipboardRepository.js";

const POLL_MS = 400;

/** @type {ReturnType<typeof setInterval> | null} */
let timer = null;
/** @type {string | null} */
let lastText = null;
/** @type {((itemsChanged: boolean) => void) | null} */
let onChanged = null;

function readClipboardText() {
  try {
    return clipboard.readText() ?? "";
  } catch (error) {
    console.error("[clipboard] read failed", error);
    return lastText ?? "";
  }
}

function handleClipboardText(text) {
  if (text === lastText) {
    return false;
  }

  lastText = text;
  const item = recordExternalClipboardCopy(text);
  return Boolean(item);
}

export function startClipboardWatcher(listener) {
  if (timer) {
    stopClipboardWatcher();
  }

  onChanged = listener;
  lastText = readClipboardText();

  timer = setInterval(() => {
    try {
      const changed = handleClipboardText(readClipboardText());
      if (changed) {
        onChanged?.(true);
      }
    } catch (error) {
      console.error("[clipboard] watch failed", error);
    }
  }, POLL_MS);
}

export function stopClipboardWatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  onChanged = null;
  lastText = null;
}

export function writeClipboardInternal(text) {
  clipboard.writeText(text);
  lastText = clipboard.readText() ?? text;
}
