import * as m from "../../i18n/paraglide/messages";
import type { Section } from "../../stores/navigation";

interface Props {
  section: Section;
}

// Section type includes schedule and songs — SECTION_LABELS must be exhaustive
const SECTION_LABELS: Record<Section, () => string> = {
  streams: m.streams_section,
  browser: m.browser_section,
  wishlist: m.wishlist_section,
  schedule: m.schedule_section,
  songs: m.songs_section,
};

export function SectionHeader({ section }: Props) {
  return (
    <header className="flex items-center border-b border-slate-700 px-4 py-2 forced-colors:border-[ButtonText]">
      <h1 className="text-sm font-semibold text-slate-200">
        {SECTION_LABELS[section]()}
      </h1>
    </header>
  );
}
