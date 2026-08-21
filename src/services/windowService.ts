function api() {
  if (!window.windowAPI) {
    throw new Error("Window API is unavailable.");
  }
  return window.windowAPI;
}

export const windowService = {
  minimize: () => api().minimize(),
  maximize: () => api().maximize(),
  close: () => api().close(),
  isMaximized: () => api().isMaximized(),
  onMaximizedChange: (callback: (value: boolean) => void) =>
    api().onMaximizedChange(callback),
};
