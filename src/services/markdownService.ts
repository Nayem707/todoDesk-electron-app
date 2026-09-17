import { unwrap } from "../utils/errors";

function api() {
  if (!window.markdownAPI) {
    throw new Error("Markdown API is unavailable. Restart the application.");
  }
  return window.markdownAPI;
}

export const markdownService = {
  getAll: () => unwrap(api().getDocuments()),
  save: (input: { id?: string | null; content: string }) => unwrap(api().saveDocument(input)),
  remove: (id: string) => unwrap(api().deleteDocument(id)),
};

export function previewMarkdownContent(content: string, max = 120) {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max)}…`;
}
