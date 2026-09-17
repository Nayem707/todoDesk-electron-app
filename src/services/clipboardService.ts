import type { ClipboardFilter, ClipboardItem, ClipboardSort } from "../types/clipboard";
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

export function queryClipboardItems(
  items: ClipboardItem[],
  options: {
    search?: string;
    filter?: ClipboardFilter;
    sort?: ClipboardSort;
  } = {}
) {
  const query = (options.search ?? "").trim().toLowerCase();
  const filter = options.filter ?? "all";
  const sort = options.sort ?? "lastCopiedDesc";

  const filtered = items.filter((item) => {
    if (filter === "pinned" && !item.isPinned) {
      return false;
    }
    if (!query) {
      return true;
    }
    return item.content.toLowerCase().includes(query);
  });

  return [...filtered].sort((a, b) => {
    switch (sort) {
      case "copyCountAsc":
        if (a.copyCount !== b.copyCount) {
          return a.copyCount - b.copyCount;
        }
        return b.lastCopiedAt.localeCompare(a.lastCopiedAt);
      case "copyCountDesc":
        if (a.copyCount !== b.copyCount) {
          return b.copyCount - a.copyCount;
        }
        return b.lastCopiedAt.localeCompare(a.lastCopiedAt);
      case "lastCopiedAsc":
        if (a.lastCopiedAt !== b.lastCopiedAt) {
          return a.lastCopiedAt.localeCompare(b.lastCopiedAt);
        }
        return b.copyCount - a.copyCount;
      case "lastCopiedDesc":
      default:
        if (a.lastCopiedAt !== b.lastCopiedAt) {
          return b.lastCopiedAt.localeCompare(a.lastCopiedAt);
        }
        return b.copyCount - a.copyCount;
    }
  });
}
