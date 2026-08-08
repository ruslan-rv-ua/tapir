import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $profileList, $focusProfileList } from "../../stores/profileManager";
import { $profileSettings, $profileSettingsTarget, $settings } from "../../stores/settings";
import { useAnnounce } from "../../hooks/useAnnounce";
import { useAutoSave } from "../../hooks/useAutoSave";
import { addToast } from "../../stores/toasts";
import * as tauri from "../../lib/tauri";
import type {
  ProfileMeta,
  ProfileSettings,
  ProfileSettingsPatch,
  RecordingSettings,
  UiSettings,
} from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import { ProfileRecordingTab } from "./ProfileRecordingTab";
import { ProfilePlaybackTab, type PlaybackSettings } from "./ProfilePlaybackTab";
import { ProfileInterfaceTab } from "./ProfileInterfaceTab";

const TAB_CLS =
  "cursor-pointer rounded border-l-2 border-transparent px-3 py-2 text-left text-sm text-slate-400 outline-none hover:text-slate-200 selected:border-blue-400 selected:text-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400 aria-disabled:text-slate-600 forced-colors:text-[ButtonText] forced-colors:selected:border-[Highlight] forced-colors:selected:text-[HighlightText] forced-colors:aria-disabled:text-[GrayText]";

interface Props {
  /** Profile the settings apply to — may be the inactive one. */
  name: string;
  /** Fresh profile list; the target vanishing from it forces the dialog closed. */
  profiles: ProfileMeta[];
  /** Name of the currently active profile, or null while settings are loading. */
  activeProfile: string | null;
  onClose: () => void;
  /** Target deleted or renamed while open — close and land focus in the list. */
  onForceClose: () => void;
}

/**
 * Profile-scoped settings — the only surface that edits them, for the active
 * profile or an inactive one (ADR 2026-08-08). Four tabs mirroring the data:
 * Recording / Playback / Interface / Post-processing.
 *
 * Saves automatically (debounced 300 ms) like `SettingsDialog`: no
 * Confirm/Cancel buttons on any tab.
 *
 * `Tabs` inside `Modal` is the safe side of the known NVDA problem — the unsafe
 * one is a portalled modal *inside* a collection (`WishlistPanel`, fix ba87641).
 */
export function ProfileSettingsDialog({
  name,
  profiles,
  activeProfile,
  onClose,
  onForceClose,
}: Props) {
  const announce = useAnnounce();
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Ref callback, not an effect: RAC collections build their children in a
  // pass where the tab is not in the document yet, so an effect would fire
  // before the node exists. React never manages this attribute itself, so once
  // set it survives re-renders.
  const markPostprocessDisabled = useCallback((el: HTMLDivElement | null) => {
    el?.setAttribute("aria-disabled", "true");
  }, []);

  // Always a local copy, seeded from get_profile_settings — one rule instead of
  // branching «active edits the store, inactive edits local state».
  useEffect(() => {
    let cancelled = false;
    setSettings(null);
    setLoadFailed(false);
    tauri.getProfileSettings(name)
      .then((ps) => { if (!cancelled) setSettings(ps); })
      .catch((e) => {
        console.error(e);
        if (cancelled) return;
        setLoadFailed(true);
        addToast(m.settings_load_error(), "error");
      });
    return () => { cancelled = true; };
  }, [name]);

  // Accumulates the sections actually touched since the last flush: the backend
  // takes a patch, and sending a whole copy would clobber concurrently written
  // fields (volume, the resume trace, a schedule's last result).
  const pendingRef = useRef<ProfileSettingsPatch>({});
  const settingsRef = useRef<ProfileSettings | null>(null);
  settingsRef.current = settings;

  const save = useAutoSave(async () => {
    const patch = pendingRef.current;
    if (Object.keys(patch).length === 0) return;
    pendingRef.current = {};
    await tauri.updateProfileSettings(name, patch);
    // The dialog gives no visual feedback, so autosave must be audible.
    announce(m.profile_settings_saved({ name }), "polite");
    const current = settingsRef.current;
    if (current && name === activeProfile) $profileSettings.set(current);
  });

  function patch(next: ProfileSettingsPatch, apply: (s: ProfileSettings) => ProfileSettings) {
    const current = settingsRef.current;
    if (!current) return;
    const updated = apply(current);
    settingsRef.current = updated;
    setSettings(updated);
    pendingRef.current = { ...pendingRef.current, ...next };
    save();
  }

  const updateRecording = (p: Partial<RecordingSettings>) => {
    const current = settingsRef.current;
    if (!current) return;
    const recording = { ...current.recording, ...p };
    patch({ recording }, (s) => ({ ...s, recording }));
  };

  const updateUi = (p: Partial<UiSettings>) => {
    const current = settingsRef.current;
    if (!current) return;
    const ui = { ...current.ui, ...p };
    patch({ ui }, (s) => ({ ...s, ui }));
  };

  // player_session travels field by field: the section also holds fields the
  // backend owns, so it can never be sent whole.
  const updatePlayback = (p: Partial<PlaybackSettings>) => patch(p, (s) => ({ ...s, ...p }));

  // The target vanished from a refreshed list — deleted, or renamed (new name
  // present, old one gone). Both read the same way. Only possible for an
  // inactive target opened from the profiles screen, so focus always has
  // somewhere to land.
  useEffect(() => {
    if (profiles.length === 0) return; // list not loaded yet
    if (profiles.some((p) => p.name === name)) return;
    announce(m.profile_settings_closed_gone({ name }), "assertive");
    onForceClose();
  }, [profiles, name, announce, onForceClose]);

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      isDismissable
    >
      <Modal className="flex h-[80vh] w-[90vw] max-w-3xl flex-col rounded-lg bg-slate-800 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog
          aria-label={m.profile_settings_title({ name })}
          className="flex h-full flex-col outline-none"
        >
          <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
            <Heading slot="title" className="text-lg font-semibold text-slate-100">
              {m.profile_settings_title({ name })}
            </Heading>
            <button
              onClick={onClose}
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
              <Tab id="recording" autoFocus className={TAB_CLS}>
                {m.settings_tab_recording()}
              </Tab>
              <Tab id="playback" className={TAB_CLS}>
                {m.settings_tab_playback()}
              </Tab>
              <Tab id="interface" className={TAB_CLS}>
                {m.profile_settings_tab_interface()}
              </Tab>
              {/* APG "disabled but focusable": `aria-disabled`, NOT `isDisabled` —
                  react-aria would drop the tab from arrow navigation and a screen
                  reader user would never meet it. It stays in the count (4 of 4).
                  Set through a ref because RAC's `filterDOMProps` does not pass
                  `aria-disabled` through to the rendered tab. */}
              <Tab id="postprocess" ref={markPostprocessDisabled} className={TAB_CLS}>
                {m.profile_settings_tab_postprocess()}
              </Tab>
            </TabList>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadFailed && (
                <p className="text-sm text-red-300">{m.settings_load_error()}</p>
              )}
              {settings && (
                <>
                  <TabPanel id="recording">
                    <ProfileRecordingTab
                      recording={settings.recording}
                      onChange={updateRecording}
                    />
                  </TabPanel>
                  <TabPanel id="playback">
                    <ProfilePlaybackTab value={settings} onChange={updatePlayback} />
                  </TabPanel>
                  <TabPanel id="interface">
                    <ProfileInterfaceTab ui={settings.ui} onChange={updateUi} />
                  </TabPanel>
                </>
              )}
              <TabPanel id="postprocess">
                <p className="text-sm text-slate-400 forced-colors:text-[GrayText]">
                  {m.profile_settings_postprocess_unavailable()}
                </p>
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

/**
 * Store-connected wrapper. Mounted at `App` level (not inside `ProfilesPanel`)
 * so `Ctrl+Shift+,` works from every section, not just the profiles screen.
 */
export function ProfileSettingsDialogHost() {
  const target = useStore($profileSettingsTarget);
  const profiles = useStore($profileList);
  const settings = useStore($settings);

  if (!target) return null;

  return (
    <ProfileSettingsDialog
      name={target}
      profiles={profiles}
      activeProfile={settings?.activeProfile ?? null}
      onClose={() => $profileSettingsTarget.set(null)}
      onForceClose={() => {
        $profileSettingsTarget.set(null);
        $focusProfileList.set($focusProfileList.get() + 1);
      }}
    />
  );
}
