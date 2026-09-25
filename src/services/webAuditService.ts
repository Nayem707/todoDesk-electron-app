import type { WebAuditProgressEvent } from "../types/webAudit";
import { unwrap } from "../utils/errors";

function api() {
  if (!window.webAuditAPI) {
    throw new Error("Web Audit is unavailable. Restart the application.");
  }
  return window.webAuditAPI;
}

export const webAuditService = {
  start: (url: string, requestId: string) => unwrap(api().start(url, requestId)),
  cancel: (requestId: string) => unwrap(api().cancel(requestId)),
  getHistory: () => unwrap(api().getHistory()),
  getAudit: (id: string) => unwrap(api().getAudit(id)),
  deleteAudit: (id: string) => unwrap(api().deleteAudit(id)),
  onProgress: (callback: (event: WebAuditProgressEvent) => void) => api().onProgress(callback),
};
