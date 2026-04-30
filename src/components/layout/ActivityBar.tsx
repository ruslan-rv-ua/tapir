import { forwardRef, useImperativeHandle, useRef } from "react";
import { Button } from "react-aria-components";
import { Radio, Globe, Heart, Calendar, Music, Settings } from "lucide-react";
import { useStore } from "@nanostores/react";
import { $activeSection } from "../../stores/navigation";
import { $settingsDialogOpen } from "../../stores/settings";
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
  const navRef = useRef<HTMLElement | null>(null);

  const ref0 = useRef<HTMLButtonElement | null>(null);
  const ref1 = useRef<HTMLButtonElement | null>(null);
  const ref2 = useRef<HTMLButtonElement | null>(null);
  const ref3 = useRef<HTMLButtonElement | null>(null);
  const ref4 = useRef<HTMLButtonElement | null>(null);
  const settingsRef = useRef<HTMLButtonElement | null>(null);
  const sectionRefs = [ref0, ref1, ref2, ref3, ref4];
  const allRefs = [...sectionRefs, settingsRef];

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
  }));

  return (
    <nav
      ref={navRef}
      role="navigation"
      aria-label={m.main_navigation()}
      data-zone-id="activity-bar"
      className="flex w-12 flex-col items-center gap-1 border-r border-slate-700 bg-slate-900 py-2"
      onKeyDown={onKeyDown}
    >
      {SECTIONS.map((sec, i) => (
        <Button
          key={sec.id}
          ref={sectionRefs[i]}
          aria-label={sec.label()}
          aria-pressed={activeSection === sec.id}
          aria-disabled={sec.disabled ? "true" : undefined}
          aria-description={
            sec.disabled ? m.phase_not_available({ phase: sec.phase ?? "" }) : undefined
          }
          {...{ tabIndex: getTabIndex(i) }}
          onPress={() => {
            if (sec.disabled) return;
            $activeSection.set(sec.id);
          }}
          className={`flex h-10 w-10 items-center justify-center rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
            activeSection === sec.id
              ? "bg-slate-700 text-blue-400 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
              : sec.disabled
              ? "cursor-not-allowed text-slate-600 forced-colors:text-[GrayText]"
              : "text-slate-400 hover:bg-slate-700 hover:text-slate-200 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
          }`}
        >
          <sec.Icon size={20} aria-hidden={true} />
        </Button>
      ))}
      <div className="mt-auto">
        <Button
          ref={settingsRef}
          aria-label={m.settings_title()}
          {...{ tabIndex: getTabIndex(SECTIONS.length) }}
          onPress={() => $settingsDialogOpen.set(true)}
          className="flex h-10 w-10 items-center justify-center rounded text-slate-400 hover:bg-slate-700 hover:text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
        >
          <Settings size={20} aria-hidden={true} />
        </Button>
      </div>
    </nav>
  );
});
ActivityBar.displayName = "ActivityBar";
