import { useEffect, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  ArrowLeft,
  Columns2,
  Copy,
  Eraser,
  Eye,
  List,
  Pencil,
  Save,
  Trash2,
} from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { Tabs } from "../components/Tabs";
import { markdownService, previewMarkdownContent } from "../services/markdownService";
import type { MarkdownDocument } from "../types/markdown";
import { cn } from "../utils/cn";
import { formatDateTime } from "../utils/dates";
import { getErrorMessage } from "../utils/errors";

type Pane = "edit" | "preview";
type Screen = "editor" | "list";

let draft = "";
let draftId: string | null = null;
let draftPreview = false;

const PANE_TABS: { id: Pane; label: string }[] = [
  { id: "edit", label: "Edit" },
  { id: "preview", label: "Preview" },
];

export function MarkdownPage() {
  const [screen, setScreen] = useState<Screen>("editor");
  const [source, setSource] = useState(draft);
  const [activeId, setActiveId] = useState<string | null>(draftId);
  const [splitMode, setSplitMode] = useState(draftPreview);
  const [pane, setPane] = useState<Pane>("edit");
  const [documents, setDocuments] = useState<MarkdownDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  const updateSource = (value: string) => {
    draft = value;
    setSource(value);
  };

  const setActiveDocument = (id: string | null) => {
    draftId = id;
    setActiveId(id);
  };

  const refreshDocuments = async () => {
    try {
      const next = await markdownService.getAll();
      setDocuments(next);
    } catch (error) {
      console.error("[markdown] load failed", error);
      toast.error(getErrorMessage(error, "Could not load saved Markdown."));
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    void refreshDocuments();
  }, []);

  const copySource = async () => {
    if (!source.trim()) {
      toast.error("Nothing to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(source);
      toast.success("Markdown copied");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not copy Markdown."));
    }
  };

  const clearSource = () => {
    updateSource("");
    setActiveDocument(null);
    toast.success("Markdown cleared");
  };

  const saveSource = async () => {
    if (!source.trim()) {
      toast.error("Nothing to save.");
      return;
    }
    try {
      const saved = await markdownService.save({
        id: activeId,
        content: source,
      });
      setActiveDocument(saved.id);
      await refreshDocuments();
      toast.success("Markdown saved");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save Markdown."));
    }
  };

  const openDocument = (doc: MarkdownDocument) => {
    updateSource(doc.content);
    setActiveDocument(doc.id);
    setScreen("editor");
  };

  const deleteDocument = async (doc: MarkdownDocument) => {
    try {
      await markdownService.remove(doc.id);
      if (activeId === doc.id) {
        setActiveDocument(null);
      }
      await refreshDocuments();
      toast.success("Markdown deleted");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not delete Markdown."));
    }
  };

  const toggleSplit = () => {
    const next = !splitMode;
    draftPreview = next;
    setSplitMode(next);
    setPane("edit");
  };

  if (screen === "list") {
    return (
      <div className="mx-auto flex h-[calc(100vh-40px)] min-h-0 max-w-4xl flex-col space-y-5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Saved list</h1>
            <p className="mt-1 text-sm text-[rgb(var(--muted))]">
              {loadingDocs
                ? "Loading saved Markdown…"
                : `${documents.length} ${documents.length === 1 ? "document" : "documents"}`}
            </p>
          </div>
          <ActionButton onClick={() => setScreen("editor")}>
            <ArrowLeft size={15} />
            Back to editor
          </ActionButton>
        </div>

        <div className="todo-scroll min-h-0 flex-1">
          {loadingDocs ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-2xl bg-black/10 dark:bg-white/10"
                />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <EmptyState
              title="No saved Markdown yet"
              description="Write in the editor and click Save to keep a document here."
              action={
                <button
                  type="button"
                  onClick={() => setScreen("editor")}
                  className="rounded-lg bg-[rgb(var(--accent))] px-3 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))]"
                >
                  Open editor
                </button>
              }
            />
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <SavedMarkdownCard
                  key={doc.id}
                  document={doc}
                  active={doc.id === activeId}
                  onEdit={openDocument}
                  onDelete={deleteDocument}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-40px)] min-h-0 flex-col p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Markdown</h1>
          <p className="mt-1 text-sm text-[rgb(var(--muted))]">
            {splitMode
              ? "Split view: edit on the left, live preview on the right."
              : "Write or paste Markdown, then save it or open preview."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void refreshDocuments();
              setScreen("list");
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            <List size={15} />
            Saved list
            {!loadingDocs && documents.length > 0 && (
              <span className="rounded-full bg-black/5 px-1.5 text-[11px] tabular-nums dark:bg-white/10">
                {documents.length}
              </span>
            )}
          </button>
          <ActionButton onClick={() => void copySource()}>
            <Copy size={15} />
            Copy
          </ActionButton>
          <ActionButton onClick={clearSource}>
            <Eraser size={15} />
            Clear
          </ActionButton>
          <ActionButton onClick={() => void saveSource()}>
            <Save size={15} />
            Save
          </ActionButton>
          <button
            type="button"
            onClick={toggleSplit}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
              splitMode
                ? "bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))]"
                : "border border-[rgb(var(--border))] hover:bg-black/5 dark:hover:bg-white/10"
            )}
          >
            {splitMode ? <Columns2 size={15} /> : <Eye size={15} />}
            {splitMode ? "Editor" : "Preview"}
          </button>
        </div>
      </div>

      {splitMode && (
        <div className="mb-3 xl:hidden">
          <Tabs
            items={PANE_TABS}
            value={pane}
            onChange={setPane}
            ariaLabel="Markdown editor or preview"
          />
        </div>
      )}

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-4",
          splitMode && "xl:grid-cols-2"
        )}
      >
        <EditorPane
          source={source}
          onChange={updateSource}
          hidden={splitMode && pane === "preview"}
        />
        {splitMode && (
          <PreviewPane source={source} hidden={pane === "edit"} />
        )}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function EditorPane({
  source,
  onChange,
  hidden,
}: {
  source: string;
  onChange: (value: string) => void;
  hidden: boolean;
}) {
  return (
    <section
      className={cn(
        "min-h-0 flex-col overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]",
        hidden ? "hidden xl:flex" : "flex"
      )}
    >
      <p className="shrink-0 border-b border-[rgb(var(--border))] px-4 py-2 text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">
        Editor
      </p>
      <textarea
        value={source}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        placeholder={"# Heading\n\nPaste or type **Markdown** here."}
        className="todo-scroll min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-6 text-[rgb(var(--text))] outline-none placeholder:text-[rgb(var(--muted))]"
        aria-label="Markdown editor"
      />
    </section>
  );
}

function PreviewPane({ source, hidden }: { source: string; hidden: boolean }) {
  return (
    <section
      className={cn(
        "min-h-0 flex-col overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]",
        hidden ? "hidden xl:flex" : "flex"
      )}
    >
      <p className="shrink-0 border-b border-[rgb(var(--border))] px-4 py-2 text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">
        Preview
      </p>
      <div className="todo-scroll min-h-0 flex-1 p-4">
        {source.trim() ? (
          <div className="markdown-preview select-text">
            <Markdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={{
                a({ href, children }) {
                  return (
                    <a
                      href={href}
                      onClick={(event) => {
                        event.preventDefault();
                        if (href) {
                          window.open(href, "_blank", "noopener,noreferrer");
                        }
                      }}
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {source}
            </Markdown>
          </div>
        ) : (
          <p className="text-sm text-[rgb(var(--muted))]">
            Preview appears here as you type.
          </p>
        )}
      </div>
    </section>
  );
}

function SavedMarkdownCard({
  document,
  active,
  onEdit,
  onDelete,
}: {
  document: MarkdownDocument;
  active: boolean;
  onEdit: (doc: MarkdownDocument) => void;
  onDelete: (doc: MarkdownDocument) => void;
}) {
  const preview = previewMarkdownContent(document.content, 220);

  return (
    <article
      className={cn(
        "rounded-2xl border bg-[rgb(var(--surface))] p-4 shadow-card transition hover:border-[rgb(var(--accent))]/40 dark:shadow-card-dark",
        active
          ? "border-[rgb(var(--accent))]/50"
          : "border-[rgb(var(--border))]"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold leading-5">{document.title}</h3>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-[rgb(var(--muted))]">
            {preview}
          </p>
          <p className="mt-3 text-xs text-[rgb(var(--muted))]">
            Updated {formatDateTime(document.updatedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(document)}
            className="rounded-md p-1.5 text-[rgb(var(--muted))] hover:bg-black/5 hover:text-[rgb(var(--text))] dark:hover:bg-white/10"
            aria-label={`Edit ${document.title}`}
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => void onDelete(document)}
            className="rounded-md p-1.5 text-[rgb(var(--muted))] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
            aria-label={`Delete ${document.title}`}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
