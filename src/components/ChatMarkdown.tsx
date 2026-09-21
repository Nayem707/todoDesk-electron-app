import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../utils/cn";
import { getErrorMessage } from "../utils/errors";

interface ChatMarkdownProps {
  content: string;
  className?: string;
}

function useIsDarkMode() {
  const [dark, setDark] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false
  );

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}

export function ChatMarkdown({ content, className }: ChatMarkdownProps) {
  const dark = useIsDarkMode();

  if (!content.trim()) {
    return null;
  }

  return (
    <div className={cn("chat-markdown markdown-preview select-text", className)}>
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        // No rehype-raw: raw HTML/scripts from the model are not executed.
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
          img() {
            return null;
          },
          code({ className: codeClassName, children, ...props }) {
            const match = /language-(\w+)/.exec(codeClassName || "");
            const codeText = String(children).replace(/\n$/, "");
            const inline = !match && !codeText.includes("\n");

            if (inline) {
              return (
                <code className={codeClassName} {...props}>
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock
                language={match?.[1] || "text"}
                code={codeText}
                dark={dark}
              />
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
          table({ children }) {
            return (
              <div className="chat-markdown-table-wrap">
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

function CodeBlock({
  language,
  code,
  dark,
}: {
  language: string;
  code: string;
  dark: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Code copied");
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not copy code."));
    }
  };

  return (
    <div className="chat-code-block">
      <div className="chat-code-header">
        <span className="chat-code-lang">{language}</span>
        <button
          type="button"
          onClick={() => void copyCode()}
          className="chat-code-copy"
          aria-label="Copy code"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={dark ? oneDark : oneLight}
        customStyle={{
          margin: 0,
          padding: "0.85rem 1rem",
          background: "transparent",
          fontSize: "0.8rem",
          lineHeight: 1.55,
        }}
        codeTagProps={{
          style: {
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          },
        }}
        PreTag="div"
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
