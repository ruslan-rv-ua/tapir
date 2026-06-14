import { useEffect } from "react";
import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $settings, $settingsDialogOpen, $recordingSettings } from "../../stores/settings";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import { addToast } from "../../stores/toasts";
import { GeneralTab } from "./GeneralTab";
import { RecordingTab } from "./RecordingTab";
import { HotkeysTab } from "./HotkeysTab";
import { AudioTab } from "./AudioTab";

const TAB_CLS =
  "cursor-pointer border-b-2 border-transparent px-3 py-2 text-sm text-slate-400 outline-none hover:text-slate-200 selected:border-blue-400 selected:text-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText] forced-colors:selected:border-[Highlight] forced-colors:selected:text-[HighlightText]";

export function SettingsDialog() {
  const isOpen = useStore($settingsDialogOpen);
  const settings = useStore($settings);

  useEffect(() => {
    if (isOpen) {
      tauri.getRecordingSettings().then((rec) => {
        $recordingSettings.set(rec);
      }).catch((e) => { console.error(e); addToast(m.settings_load_error(), "error"); });
    }
  }, [isOpen]);

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
          <Tabs className="flex flex-1 flex-col overflow-hidden">
            <TabList
              aria-label={m.settings_title()}
              className="flex gap-1 border-b border-slate-700 px-6"
            >
              <Tab id="general" autoFocus className={TAB_CLS}>
                {m.settings_tab_general()}
              </Tab>
              <Tab id="recording" className={TAB_CLS}>
                {m.settings_tab_recording()}
              </Tab>
              <Tab id="audio" className={TAB_CLS}>
                {m.settings_tab_playback()}
              </Tab>
              <Tab id="hotkeys" className={TAB_CLS}>
                {m.settings_tab_hotkeys()}
              </Tab>
            </TabList>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <TabPanel id="general">
                <GeneralTab />
              </TabPanel>
              <TabPanel id="recording">
                <RecordingTab />
              </TabPanel>
              <TabPanel id="audio">
                <AudioTab />
              </TabPanel>
              <TabPanel id="hotkeys">
                <HotkeysTab />
              </TabPanel>
            </div>
          </Tabs>
          <div className="flex items-center border-t border-slate-700 px-6 py-3">
            <p className="text-xs text-slate-500">{m.settings_autosave_notice()}</p>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
