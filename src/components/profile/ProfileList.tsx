import { forwardRef, useImperativeHandle, useRef } from "react";
import { ListBox, ListBoxItem, type Selection } from "react-aria-components";
import type { ProfileMeta } from "../../lib/tauri";
import { getLocale } from "../../i18n/paraglide/runtime";
import * as m from "../../i18n/paraglide/messages";

export interface ProfileListHandle {
  /** Move DOM focus to the currently selected profile option. */
  focusSelected: () => void;
}

interface Props {
  profiles: ProfileMeta[];
  selected: string;
  onSelect: (name: string) => void;
  autoFocus?: boolean;
}

function streamCountLabel(count: number): string {
  const category = new Intl.PluralRules(getLocale()).select(count);
  switch (category) {
    case "one": return m.profile_stream_count_one({ count });
    case "few": return m.profile_stream_count_few({ count });
    case "many": return m.profile_stream_count_many({ count });
    default: return m.profile_stream_count_other({ count });
  }
}

export const ProfileList = forwardRef<ProfileListHandle, Props>(
  function ProfileList({ profiles, selected, onSelect, autoFocus }, ref) {
    const listRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      focusSelected() {
        const el = listRef.current;
        if (!el) return;
        const option = el.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
        (option ?? el).focus();
      },
    }), []);

    return (
      <ListBox
        ref={listRef}
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
            className={`flex items-center gap-2 cursor-pointer rounded px-3 py-2 border-l-2 ${
              p.isActive
                ? "border-l-sky-500 text-slate-100 forced-colors:border-l-[Highlight]"
                : "border-l-transparent text-slate-200"
            } hover:bg-white/[.06] data-[selected]:bg-sky-600/20 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]`}
          >
            <span className="font-medium">{p.name}</span>
            {p.isActive && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 border border-sky-500/25 px-2 py-0.5 text-xs font-semibold text-sky-300 forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]">
                <span
                  aria-hidden="true"
                  className="w-1.5 h-1.5 rounded-full bg-sky-400 forced-colors:bg-[ButtonText]"
                />
                {m.profile_active_badge()}
              </span>
            )}
            <span className="text-xs text-slate-500 ml-auto">
              {streamCountLabel(p.streamCount)}
            </span>
          </ListBoxItem>
        ))}
      </ListBox>
    );
  }
);
