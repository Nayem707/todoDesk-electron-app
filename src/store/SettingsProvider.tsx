import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { settingsService } from "../services/settingsService";
import type { AppSettings, ThemePreference } from "../types/todo";
import { getErrorMessage } from "../utils/errors";

interface SettingsContextValue {
  settings: AppSettings;
  resolvedTheme: "light" | "dark";
  loading: boolean;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

const defaultSettings: AppSettings = {
  theme: "system",
  confirmBeforeDelete: true,
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: ThemePreference): "light" | "dark" {
  return theme === "system" ? getSystemTheme() : theme;
}

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(getSystemTheme);
  const [loading, setLoading] = useState(true);

  const syncTheme = useCallback((theme: ThemePreference) => {
    const next = resolveTheme(theme);
    setResolvedTheme(next);
    applyTheme(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await settingsService.get();
        if (cancelled) {
          return;
        }
        setSettings(loaded);
        syncTheme(loaded.theme);
      } catch (error) {
        console.error("[settings] load failed", error);
        toast.error(getErrorMessage(error, "Could not load settings."));
        syncTheme("system");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncTheme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (settings.theme === "system") {
        syncTheme("system");
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [settings.theme, syncTheme]);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    try {
      const next = await settingsService.update(patch);
      setSettings(next);
      if (patch.theme) {
        syncTheme(next.theme);
      }
    } catch (error) {
      console.error("[settings] update failed", error);
      toast.error(getErrorMessage(error, "Could not save settings."));
    }
  }, [syncTheme]);

  const value = useMemo(
    () => ({ settings, resolvedTheme, loading, updateSettings }),
    [settings, resolvedTheme, loading, updateSettings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return context;
}
