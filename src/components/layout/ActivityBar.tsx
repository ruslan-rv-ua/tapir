import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Button } from "react-aria-components";
import { Radio, Globe, Heart, Calendar, Music, Settings, Layers } from "lucide-react";
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
  { id: "songs", label: m.songs_section, Icon: Music },
];

interface Props {
  exitZone: (forward: boolean) => void;
}

export const ActivityBar = forwardRef<ZoneEntry, Props>(({ exitZone }, ref) => {
  const activeSection = useStore($activeSection);
  const settings = useStore($settings);
  const navRef = useRef<HTMLElement | null>(null);

  // Roving order: [profile, streams, browser, wishlist, schedule, songs, settings]
  const profileRef = useRef<HTMLButtonElement | null>(null);
  const ref0 = useRef<HTMLButtonElement | null>(null);
  const ref1 = useRef<HTMLButtonElement | null>(null);
  const ref2 = useRef<HTMLButtonElement | null>(null);
  const ref3 = useRef<HTMLButtonElement | null>(null);
  const ref4 = useRef<HTMLButtonElement | null>(null);
  const settingsRef = useRef<HTMLButtonElement | null>(null);
  const sectionRefs = useMemo(() => [ref0, ref1, ref2, ref3, ref4], []);
  const allRefs = useMemo(
    () => [profileRef, ...sectionRefs, settingsRef],
    [sectionRefs],
  );

  const { onKeyDown, getTabIndex, moveTo } = useRovingFocus(
    allRefs,
    "both",
    { mode: "composite-exit", onTabOut: exitZone },
  );

  // P3: entering the activity bar lands on the active section button (profile = 0,
  // sections offset by +1, Settings is footer-only and never the launch anchor).
  const activeNavIndex = useMemo(() => {
    if (activeSection === "profiles") return 0;
    const si = SECTIONS.findIndex((s) => s.id === activeSection && !s.disabled);
    return si >= 0 ? si + 1 : 1;
  }, [activeSection]);

  useImperativeHandle(ref, () => ({
    id: "activity-bar",
    get el() { return navRef.current!; },
    focus: (_direction) => moveTo(activeNavIndex),
  }), [moveTo, activeNavIndex]);

  return (
    <nav
      ref={navRef}
      aria-label={m.main_navigation()}
      data-zone-id="activity-bar"
      className="flex w-56 flex-col gap-1 border-r border-slate-700 bg-slate-900 py-2 px-2"
      onKeyDown={onKeyDown}
    >
      <div role="application" aria-label={m.main_navigation()} className="contents">
        {/* Profile — top of the menu (P2/P4) */}
        <Button
          ref={profileRef}
          aria-label={`${m.profile_manager_open()} — ${settings?.activeProfile ?? "Default"}`}
          aria-pressed={activeSection === "profiles"}
          excludeFromTabOrder={getTabIndex(0) === -1}
          onPress={() => $activeSection.set("profiles")}
          className={[
            "flex items-center gap-3 w-full min-h-[58px] px-[14px] py-3 rounded-[18px] border transition-colors outline-none",
            "focus-visible:ring-2 focus-visible:ring-blue-400",
            activeSection === "profiles"
              ? "bg-gradient-to-b from-sky-400/[.18] to-blue-700/[.16] border-sky-300/[.28] text-sky-300 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:border-[Highlight]"
              : "bg-white/[.02] border-slate-700/30 text-slate-400 hover:bg-white/[.05] hover:border-slate-600/50 hover:text-slate-200 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]",
          ].join(" ")}
        >
          <span className="flex items-center justify-center w-[42px] h-[42px] flex-none rounded-[14px] bg-sky-400/[.12] text-sky-200">
            <Layers size={20} aria-hidden={true} />
          </span>
          <div className="flex flex-col gap-0.5 min-w-0">
            <strong className="text-sm font-bold text-slate-300 truncate leading-tight">{m.profile_name()}</strong>
            <span className="text-xs text-slate-500 truncate">{settings?.activeProfile ?? "Default"}</span>
          </div>
        </Button>

        {/* Divider under the profile header (P2) */}
        <div role="separator" className="my-1 h-px w-full bg-slate-700/60 forced-colors:bg-[ButtonText]" />

        {/* Section group */}
        {SECTIONS.map((sec, i) => (
          <Button
            key={sec.id}
            ref={sectionRefs[i]}
            aria-label={sec.label()}
            aria-pressed={activeSection === sec.id}
            aria-disabled={sec.disabled ? "true" : undefined}
            aria-describedby={sec.disabled ? `nav-${sec.id}-desc` : undefined}
            excludeFromTabOrder={getTabIndex(i + 1) === -1}
            onPress={() => {
              if (sec.disabled) return;
              $activeSection.set(sec.id);
            }}
            className={[
              "flex items-center gap-3 w-full min-h-[58px] px-[14px] py-3 rounded-[18px] border transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-blue-400",
              activeSection === sec.id
                ? "bg-gradient-to-b from-sky-400/[.18] to-blue-700/[.16] border-sky-300/[.28] text-sky-300 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:border-[Highlight]"
                : sec.disabled
                ? "bg-white/[.02] border-transparent cursor-not-allowed text-slate-600 forced-colors:text-[GrayText]"
                : "bg-white/[.02] border-slate-700/30 text-slate-400 hover:bg-white/[.05] hover:border-slate-600/50 hover:text-slate-200 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]",
            ].join(" ")}
          >
            <span className={[
              "relative flex items-center justify-center w-[42px] h-[42px] flex-none rounded-[14px]",
              activeSection === sec.id
                ? "bg-white/[.08] text-sky-300 forced-colors:text-[HighlightText]"
                : sec.disabled
                ? "bg-white/[.02] text-slate-600 forced-colors:text-[GrayText]"
                : "bg-white/[.04] text-slate-400 hover:text-slate-200",
            ].join(" ")}>
              <sec.Icon size={20} aria-hidden={true} />
            </span>
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-bold leading-tight">{sec.label()}</span>
            </span>
            {sec.disabled && (
              <span id={`nav-${sec.id}-desc`} className="sr-only">
                {m.phase_not_available({ phase: sec.phase ?? "" })}
              </span>
            )}
          </Button>
        ))}

        {/* Footer: Settings stays a dialog (P6) */}
        <div className="mt-auto flex flex-col gap-1">
          <Button
            ref={settingsRef}
            aria-label={m.settings_title()}
            excludeFromTabOrder={getTabIndex(SECTIONS.length + 1) === -1}
            onPress={() => $settingsDialogOpen.set(true)}
            className="flex items-center gap-3 w-full min-h-[58px] px-[14px] py-3 rounded-[18px] border border-slate-700/30 bg-white/[.02] text-slate-400 hover:bg-white/[.05] hover:border-slate-600/50 hover:text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText] transition-colors"
          >
            <span className="relative flex items-center justify-center w-[42px] h-[42px] flex-none rounded-[14px] bg-white/[.04] text-slate-400 hover:text-slate-200">
              <Settings size={20} aria-hidden={true} />
            </span>
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-bold leading-tight">{m.settings_title()}</span>
            </span>
          </Button>
        </div>
      </div>
    </nav>
  );
});
ActivityBar.displayName = "ActivityBar";
