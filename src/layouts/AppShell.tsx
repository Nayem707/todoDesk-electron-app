import type { ReactNode } from "react";
import type { AppView } from "../types/todo";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";

interface AppShellProps {
  view: AppView;
  onViewChange: (view: AppView) => void;
  onCreate: () => void;
  children: ReactNode;
}

export function AppShell({ view, onViewChange, onCreate, children }: AppShellProps) {
  return (
    <div className="flex h-full flex-col bg-[rgb(var(--bg))] text-[rgb(var(--text))]">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar view={view} onViewChange={onViewChange} onCreate={onCreate} />
        <main className="todo-scroll min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
