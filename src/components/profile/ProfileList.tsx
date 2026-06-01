import { ListBox, ListBoxItem, type Selection } from "react-aria-components";
import type { ProfileMeta } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import { getLocale } from "../../i18n/paraglide/runtime";

function streamCountLabel(count: number): string {
  const category = new Intl.PluralRules(getLocale()).select(count);
  switch (category) {
    case "one": return m.profile_stream_count_one({ count });
    case "few": return m.profile_stream_count_few({ count });
    case "many": return m.profile_stream_count_many({ count });
    default: return m.profile_stream_count_other({ count });
  }
}

interface Props {
  profiles: ProfileMeta[];
  selected: string;
  onSelect: (name: string) => void;
  autoFocus?: boolean;
}

export function ProfileList({ profiles, selected, onSelect, autoFocus }: Props) {
  return (
    <ListBox
      aria-label={m.profile_list_label()}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[selected]}
      onSelectionChange={(keys: Selection) => {
        if (keys === "all") return;
        const key = [...keys][0];
        if (key !== undefined) onSelect(String(key));
      }}
      autoFocus={autoFocus}
      className="flex flex-col gap-1 outline-none"
    >
      {profiles.map((p) => (
        <ListBoxItem
          key={p.name}
          id={p.name}
          textValue={p.name}
          className="flex items-center gap-2 cursor-pointer rounded px-3 py-2 text-slate-200 hover:bg-white/[.06] data-[selected]:bg-sky-600/20 outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <span className="font-medium">{p.name}</span>
          {p.isActive && (
            <span className="text-xs text-sky-400 ml-1">({m.profile_active_badge()})</span>
          )}
          <span className="text-xs text-slate-500 ml-auto">
            {streamCountLabel(p.streamCount)}
          </span>
        </ListBoxItem>
      ))}
    </ListBox>
  );
}
