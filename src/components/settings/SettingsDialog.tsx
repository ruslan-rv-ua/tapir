import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $settings, $settingsDialogOpen, $profileSettingsTarget } from "../../stores/settings";
import * as m from "../../i18n/paraglide/messages";
import { GeneralTab } from "./GeneralTab";
import { HotkeysTab } from "./HotkeysTab";
import { AudioTab } from "./AudioTab";
import { SETTINGS_TAB_CLS } from "./settingsTabStyle";

/**
 * Application settings — **global only** (ADR 2026-08-08). Everything
 * profile-scoped lives in the profile dialog (`Ctrl+Shift+,`); the boundary is
 * physical, not labelled, because a label would have to be repeated on every
 * control and is not announced until the group is entered.
 */
export function SettingsDialog() {
  const isOpen = useStore($settingsDialogOpen);
  const settings = useStore($settings);

  if (!isOpen || !settings) return null;

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) $settingsDialogOpen.set(false);
      }}
      isDismissable
    >
      <Modal className="flex h-[80vh] w-[90vw] max-w-3xl flex-col rounded-lg bg-slate-800 shadow-2xl outline-none">
        <Dialog
          aria-label={m.settings_title()}
          className="flex h-full flex-col outline-none"
        >
          <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
            <Heading
              slot="title"
              className="text-lg font-semibold text-slate-100"
            >
              {m.settings_title()}
            </Heading>
            <button
              onClick={() => $settingsDialogOpen.set(false)}
              aria-label={m.settings_close()}
              className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              ✖
            </button>
          </div>
          <Tabs orientation="vertical" className="flex flex-1 overflow-hidden">
            <TabList
              aria-label={m.settings_sections_label()}
              className="flex w-48 flex-col gap-1 overflow-y-auto border-r border-slate-700 px-2 py-4"
            >
              <Tab
                id="general"
                // @ts-expect-error — RAC's TabProps omits FocusableProps, but `useTab` hands the
                // tab's own props to `useFocusable`, which honours autoFocus. Red the day RAC
                // types it (or stops forwarding it) — which is the point of the directive.
                autoFocus
                className={SETTINGS_TAB_CLS}
              >
                {m.settings_tab_general()}
              </Tab>
              <Tab id="audio" className={SETTINGS_TAB_CLS}>
                {m.settings_tab_audio()}
              </Tab>
              <Tab id="hotkeys" className={SETTINGS_TAB_CLS}>
                {m.settings_tab_hotkeys()}
              </Tab>
            </TabList>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <TabPanel id="general">
                <GeneralTab />
              </TabPanel>
              <TabPanel id="audio">
                <AudioTab />
              </TabPanel>
              <TabPanel id="hotkeys">
                <HotkeysTab />
              </TabPanel>
            </div>
          </Tabs>
          <div className="flex items-center justify-between gap-4 border-t border-slate-700 px-6 py-3">
            <p className="text-xs text-slate-500">{m.settings_autosave_notice()}</p>
            {/* Ctrl+, → «Запис» — та звичка, яку ламає переїзд вкладки; вказівник
                на її місці дешевший за будь-яке навчання. */}
            <button
              onClick={() => {
                $settingsDialogOpen.set(false);
                $profileSettingsTarget.set(settings.activeProfile);
              }}
              className="shrink-0 rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-600 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
            >
              {m.profile_settings_open_action({ name: settings.activeProfile })}
            </button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
