import { Search } from "lucide-react";
import { type RefObject } from "react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChange,
  inputRef,
  placeholder = "Search title, notes, or tags",
}: SearchBarProps) {
  return (
    <label className="relative block min-w-[220px] flex-1">
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]"
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-2 pl-9 pr-3 text-sm outline-none ring-[rgb(var(--accent))] placeholder:text-[rgb(var(--muted))] focus:ring-2"
      />
    </label>
  );
}
