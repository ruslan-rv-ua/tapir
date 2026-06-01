import { RadioGroup, Radio } from "react-aria-components";
import type { ProfileMeta } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  profiles: ProfileMeta[];
  selected: string;
  onSelect: (name: string) => void;
}

export function ProfileList({ profiles, selected, onSelect }: Props) {
  return (
    <RadioGroup
      aria-label={m.profile_list_label()}
      value={selected}
      onChange={onSelect}
      className="flex flex-col gap-1"
    >
      {profiles.map((p) => (
        <Radio
          key={p.name}
          value={p.name}
          className="flex items-center gap-2 cursor-pointer rounded px-3 py-2 text-slate-200 hover:bg-white/[.06] data-[selected]:bg-sky-600/20 outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <span className="font-medium">{p.name}</span>
          {p.isActive && (
            <span className="text-xs text-sky-400 ml-1">({m.profile_active_badge()})</span>
          )}
          <span className="text-xs text-slate-500 ml-auto">
            {m.profile_stream_count_hint({ count: p.streamCount })}
          </span>
        </Radio>
      ))}
    </RadioGroup>
  );
}
