import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))]/60 px-6 py-16 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-[rgb(var(--muted))]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
