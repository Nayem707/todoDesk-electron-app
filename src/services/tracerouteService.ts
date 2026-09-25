import type { TraceProgressEvent } from "../types/traceroute";
import { unwrap } from "../utils/errors";

function api() {
  if (!window.tracerouteAPI) {
    throw new Error("Traceroute is unavailable. Restart the application.");
  }
  return window.tracerouteAPI;
}

export const tracerouteService = {
  start: (target: string, requestId: string) => unwrap(api().start(target, requestId)),
  cancel: (requestId: string) => unwrap(api().cancel(requestId)),
  onProgress: (callback: (event: TraceProgressEvent) => void) => api().onProgress(callback),
};
