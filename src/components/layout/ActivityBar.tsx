import { useStore } from "@nanostores/react";
import { $activeSection } from "../../stores/navigation";
import { $settingsDialogOpen } from "../../stores/settings";
import type { Section } from "../../stores/navigation";
import { Radio, Globe, Heart, Calendar, Music, Settings } from "lucide-react";
import { Button } from "react-aria-components";
import * as m from "../../i18n/paraglide/messages";

const sections: Array<{
  id: Section;
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  label: string;
  disabled: boolean;
  phase?: string;
}> = [
  { id: "streams", icon: Radio, label: m.streams_section(), disabled: false },
  { id: "browser", icon: Globe, label: m.browser_section(), disabled: true, phase: "2" },
  { id: "wishlist", icon: Heart, label: m.wishlist_section(), disabled: false },
  { id: "schedule", icon: Calendar, label: m.schedule_section(), disabled: true, phase: "3" },
  { id: "songs", icon: Music, label: m.songs_section(), disabled: true, phase: "3" },
];

export function ActivityBar() {
  const activeSection = useStore($activeSection);

  return (
    <nav
      role="navigation"
      aria-label={m.main_navigation()}
      className="flex w-12 flex-col items-center gap-1 border-r border-slate-700 bg-slate-900 py-2"
    >
      {sections.map((section) => (
        <Button
          key={section.id}
          aria-label={section.label}
          aria-current={activeSection === section.id ? "page" : undefined}
          isDisabled={section.disabled}
          onPress={() => $activeSection.set(section.id)}
          aria-description={
            section.disabled
              ? m.phase_not_available({ phase: section.phase ?? "" })
              : undefined
          }
          className={`flex h-10 w-10 items-center justify-center rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
            activeSection === section.id
              ? "bg-slate-700 text-blue-400"
              : section.disabled
              ? "cursor-not-allowed text-slate-600"
              : "text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          }`}
        >
          <section.icon size={20} aria-hidden={true} />
        </Button>
      ))}
      <div className="mt-auto">
        <Button
          onPress={() => $settingsDialogOpen.set(true)}
          aria-label={m.settings_title()}
          className="flex h-10 w-10 items-center justify-center rounded text-slate-400 hover:bg-slate-700 hover:text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <Settings size={20} aria-hidden={true} />
        </Button>
      </div>
    </nav>
  );
}
