import type { ClipboardItem } from "../types/clipboard";
import { unwrap } from "../utils/errors";

function api() {
  if (!window.clipboardAPI) {
    throw new Error("Clipboard API is unavailable. Restart the application.");
  }
  return window.clipboardAPI;
}

export const clipboardService = {
  getAll: () => unwrap(api().getItems()),
  copyAgain: (id: string) => unwrap(api().copyAgain(id)),
  remove: (id: string) => unwrap(api().deleteItem(id)),
  togglePin: (id: string) => unwrap(api().togglePin(id)),
  onChanged: (callback: () => void) => api().onChanged(callback),
};

export function previewClipboardContent(content: string, max = 280) {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max)}…`;
}

export function filterClipboardItems(items: ClipboardItem[], search: string) {
  const query = search.trim().toLowerCase();
  if (!query) {
    return items;
  }
  return items.filter((item) => item.content.toLowerCase().includes(query));
}
