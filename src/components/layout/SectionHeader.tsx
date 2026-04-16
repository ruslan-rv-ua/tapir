import { Button } from "react-aria-components";
import { Search } from "lucide-react";

interface Props {
  title: string;
}

export function SectionHeader({ title }: Props) {
  return (
    <header className="flex items-center justify-between border-b border-slate-700 px-4 py-2 forced-colors:border-[ButtonText]">
      <h1 className="text-lg font-semibold">{title}</h1>
      <Button
        onPress={() => {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
        }}
        aria-label="Command Palette (Ctrl+K)"
        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText] forced-colors:focus-visible:outline-[Highlight]"
      >
        <Search aria-hidden={true} size={14} />
        <span className="hidden sm:inline">Ctrl+K</span>
      </Button>
    </header>
  );
}
