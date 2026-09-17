export interface ClipboardItem {
  id: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  copyCount: number;
  lastCopiedAt: string;
}

export type ClipboardFilter = "all" | "pinned";

export type ClipboardSort =
  | "copyCountDesc"
  | "copyCountAsc"
  | "lastCopiedDesc"
  | "lastCopiedAsc";
