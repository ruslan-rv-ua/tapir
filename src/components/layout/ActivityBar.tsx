import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Button } from "react-aria-components";
import { Radio, Globe, Heart, Calendar, Music, Settings, User } from "lucide-react";
import { useStore } from "@nanostores/react";
import { $activeSection } from "../../stores/navigation";
import { $settingsDialogOpen, $settings } from "../../stores/settings";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { Section } from "../../stores/navigation";
import * as m from "../../i18n/paraglide/messages";

interface SectionConfig {
  id: Section;
  label: () => string;
  Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  disabled?: boolean;
  phase?: string;
}

const SECTIONS: SectionConfig[] = [
  { id: "streams", label: m.streams_section, Icon: Radio },
  { id: "browser", label: m.browser_section, Icon: Globe },
  { id: "wishlist", label: m.wishlist_section, Icon: Heart },
  { id: "schedule", label: m.schedule_section, Icon: Calendar, disabled: true, phase: "3" },
  { id: "songs", label: m.songs_section, Icon: Music, disabled: true, phase: "3" },
];

interface Props {
  exitZone: (forward: boolean) => void;
}

export const ActivityBar = forwardRef<ZoneEntry, Props>(({ exitZone }, ref) => {
  const activeSection = useStore($activeSection);
  const settings = useStore($settings);
  const navRef = useRef<HTMLElement | null>(null);

  const ref0 = useRef<HTMLButtonElement | null>(null);
  const ref1 = useRef<HTMLButtonElement | null>(null);
  const ref2 = useRef<HTMLButtonElement | null>(null);
  const ref3 = useRef<HTMLButtonElement | null>(null);
  const ref4 = useRef<HTMLButtonElement | null>(null);
  const settingsRef = useRef<HTMLButtonElement | null>(null);

  const allRefs = useMemo(
    () => [ref0, ref1, ref2, ref3, ref4, settingsRef],
    [],
  );

  const { onKeyDown, getTabIndex, restoreFocus } = useRovingFocus(
    allRefs,
    "vertical",
    { mode: "composite-exit", onTabOut: exitZone },
  );

  useImperativeHandle(ref, () => ({
    id: "activity-bar",
    get el() {
      return navRef.current!;
    },
    focus: restoreFocus,
  }), [restoreFocus]);

  return (
    <nav
      ref={navRef}
      aria-label={m.main_navigation()}
      data-zone-id="activity-bar"
      className="flex w-56 flex-col gap-1 border-r border-slate-700 bg-slate-900 py-2 px-2"
      onKeyDown={onKeyDown}
    >
      {SECTIONS.map((sec, i) => (
        <Button
          key={sec.id}
          ref={allRefs[i]}
          aria-label={sec.label()}
          aria-pressed={activeSection === sec.id}
          aria-disabled={sec.disabled ? "true" : undefined}
          aria-describedby={sec.disabled ? `nav-${sec.id}-desc` : undefined}
          {...{ tabIndex: getTabIndex(i) }}
          onPress={() => {
            if (sec.disabled) return;
            $activeSection.set(sec.id);
          }}
          className={`flex w-full items-center gap-3 px-3 py-3 rounded-xl border-l-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
            activeSection === sec.id
              ? "border-blue-400 bg-slate-700/60 text-blue-400 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:border-[Highlight]"
              : sec.disabled
              ? "border-transparent cursor-not-allowed text-slate-600 forced-colors:text-[GrayText]"
              : "border-transparent text-slate-400 hover:bg-slate-700/40 hover:text-slate-200 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
          }`}
        >
          <sec.Icon size={20} aria-hidden={true} />
          <span className="text-sm">{sec.label()}</span>
          {sec.disabled && (
            <span id={`nav-${sec.id}-desc`} className="sr-only">
              {m.phase_not_available({ phase: sec.phase ?? "" })}
            </span>
          )}
        </Button>
      ))}
      <div className="mt-auto flex flex-col gap-2 px-2">
        <Button
          ref={settingsRef}
          aria-label={m.settings_title()}
          {...{ tabIndex: getTabIndex(SECTIONS.length) }}
          onPress={() => $settingsDialogOpen.set(true)}
          className="flex w-full items-center gap-3 px-3 py-3 rounded-xl border-l-2 border-transparent text-slate-400 hover:bg-slate-700/40 hover:text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText] transition-colors"
        >
          <Settings size={20} aria-hidden={true} />
        </Button>

        {/* Profile card — not focusable; NVDA reads as passive text */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/50 text-slate-400">
          <User size={16} aria-hidden={true} className="shrink-0" />
          <div className="min-w-0">
            <strong className="block text-xs text-slate-300 truncate">{m.profile_name()}</strong>
            <span className="block text-xs truncate">
              {settings?.activeProfile ?? "Default"}
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
});
ActivityBar.displayName = "ActivityBar";
