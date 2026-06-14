import { Dialog, Modal, ModalOverlay, Heading, Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $helpOpen } from "../../stores/navigation";
import { getLocale } from "../../i18n/paraglide/runtime";
import * as m from "../../i18n/paraglide/messages";
import { getHelpHtml } from "./helpContent";
import { HelpContent } from "./HelpContent.tsx";
import { ShortcutsHelp } from "./ShortcutsHelp";

const TAB_CLS =
  "cursor-pointer rounded border-l-2 border-transparent px-3 py-2 text-left text-sm text-slate-400 outline-none hover:text-slate-200 selected:border-blue-400 selected:text-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText] forced-colors:selected:border-[Highlight] forced-colors:selected:text-[HighlightText]";

export function HelpDialog() {
  const isOpen = useStore($helpOpen);
  if (!isOpen) return null;

  const locale = getLocale();

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) $helpOpen.set(false);
      }}
      isDismissable
    >
      <Modal className="flex h-[80vh] w-[90vw] max-w-3xl flex-col rounded-lg bg-slate-800 shadow-2xl outline-none">
        <Dialog aria-label={m.help_title()} className="flex h-full flex-col outline-none">
          <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
            <Heading slot="title" level={1} className="text-lg font-semibold text-slate-100">
              {m.help_title()}
            </Heading>
            <button
              onClick={() => $helpOpen.set(false)}
              aria-label={m.settings_close()}
              className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              ✖
            </button>
          </div>
          <Tabs orientation="vertical" className="flex flex-1 overflow-hidden">
            <TabList
              aria-label={m.help_sections_label()}
              className="flex w-48 flex-col gap-1 overflow-y-auto border-r border-slate-700 px-2 py-4"
            >
              <Tab id="overview" autoFocus className={TAB_CLS}>{m.help_section_overview()}</Tab>
              <Tab id="shortcuts" className={TAB_CLS}>{m.shortcuts_help_title()}</Tab>
              <Tab id="recording" className={TAB_CLS}>{m.help_section_recording()}</Tab>
              <Tab id="wishlist" className={TAB_CLS}>{m.help_section_wishlist()}</Tab>
              <Tab id="templates" className={TAB_CLS}>{m.help_section_templates()}</Tab>
              <Tab id="scheduling" className={TAB_CLS}>{m.help_section_scheduling()}</Tab>
              <Tab id="profiles" className={TAB_CLS}>{m.help_section_profiles()}</Tab>
            </TabList>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <TabPanel id="overview"><HelpContent html={getHelpHtml(locale, "overview")} /></TabPanel>
              <TabPanel id="shortcuts"><ShortcutsHelp /></TabPanel>
              <TabPanel id="recording"><HelpContent html={getHelpHtml(locale, "recording")} /></TabPanel>
              <TabPanel id="wishlist"><HelpContent html={getHelpHtml(locale, "wishlist")} /></TabPanel>
              <TabPanel id="templates"><HelpContent html={getHelpHtml(locale, "templates")} /></TabPanel>
              <TabPanel id="scheduling"><HelpContent html={getHelpHtml(locale, "scheduling")} /></TabPanel>
              <TabPanel id="profiles"><HelpContent html={getHelpHtml(locale, "profiles")} /></TabPanel>
            </div>
          </Tabs>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
