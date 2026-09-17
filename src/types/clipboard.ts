export interface ClipboardItem {
  id: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  copyCount: number;
  lastCopiedAt: string;
}
