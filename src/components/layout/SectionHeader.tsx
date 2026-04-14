import { Search } from "lucide-react";

interface Props {
  title: string;
}

export function SectionHeader({ title }: Props) {
  return (
    <header className="flex items-center justify-between border-b border-slate-700 px-4 py-2">
      <h1 className="text-lg font-semibold">{title}</h1>
      <button
        aria-label="Command Palette (Ctrl+K)"
        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200"
      >
        <Search aria-hidden={true} size={14} />
        <span className="hidden sm:inline">Ctrl+K</span>
      </button>
    </header>
  );
}
