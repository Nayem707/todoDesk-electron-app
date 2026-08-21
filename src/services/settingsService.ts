import type { AppSettings } from "../types/todo";
import { unwrap } from "../utils/errors";

function api() {
  if (!window.settingsAPI) {
    throw new Error("Settings API is unavailable. Restart the application.");
  }
  return window.settingsAPI;
}

export const settingsService = {
  get: () => unwrap(api().getSettings()),
  update: (patch: Partial<AppSettings>) => unwrap(api().updateSettings(patch)),
};
