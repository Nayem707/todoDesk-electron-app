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
import { clipboardService } from "../services/clipboardService";
import type { ClipboardItem } from "../types/clipboard";
import { getErrorMessage } from "../utils/errors";

interface ClipboardContextValue {
  items: ClipboardItem[];
  loading: boolean;
  refreshing: boolean;
  copyAgain: (id: string) => Promise<ClipboardItem | null>;
  deleteItem: (id: string) => Promise<boolean>;
  togglePin: (id: string) => Promise<ClipboardItem | null>;
  refresh: () => Promise<void>;
}

const ClipboardContext = createContext<ClipboardContextValue | null>(null);

export function ClipboardProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const nextItems = await clipboardService.getAll();
      setItems(nextItems);
    } catch (error) {
      console.error("[clipboard] refresh failed", error);
      toast.error(getErrorMessage(error, "Could not load clipboard history."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    try {
      return clipboardService.onChanged(() => {
        void refresh();
      });
    } catch (error) {
      console.error("[clipboard] subscribe failed", error);
      return undefined;
    }
  }, [refresh]);

  const copyAgain = useCallback(async (id: string) => {
    try {
      const updated = await clipboardService.copyAgain(id);
      setItems((current) => upsertItem(current, updated));
      toast.success("Copied to clipboard");
      return updated;
    } catch (error) {
      console.error("[clipboard] copy again failed", error);
      toast.error(getErrorMessage(error, "Could not copy clipboard item."));
      return null;
    }
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    try {
      await clipboardService.remove(id);
      setItems((current) => current.filter((item) => item.id !== id));
      toast.success("Clipboard item deleted");
      return true;
    } catch (error) {
      console.error("[clipboard] delete failed", error);
      toast.error(getErrorMessage(error, "Could not delete clipboard item."));
      return false;
    }
  }, []);

  const togglePin = useCallback(async (id: string) => {
    try {
      const updated = await clipboardService.togglePin(id);
      setItems((current) => upsertItem(current, updated));
      toast.success(updated.isPinned ? "Pinned" : "Unpinned");
      return updated;
    } catch (error) {
      console.error("[clipboard] pin failed", error);
      toast.error(getErrorMessage(error, "Could not update pin."));
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({
      items,
      loading,
      refreshing,
      copyAgain,
      deleteItem,
      togglePin,
      refresh,
    }),
    [items, loading, refreshing, copyAgain, deleteItem, togglePin, refresh]
  );

  return <ClipboardContext.Provider value={value}>{children}</ClipboardContext.Provider>;
}

export function useClipboard() {
  const context = useContext(ClipboardContext);
  if (!context) {
    throw new Error("useClipboard must be used within ClipboardProvider");
  }
  return context;
}

function upsertItem(items: ClipboardItem[], updated: ClipboardItem) {
  const exists = items.some((item) => item.id === updated.id);
  if (!exists) {
    return [updated, ...items];
  }
  return items.map((item) => (item.id === updated.id ? updated : item));
}
