import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ProfileChangedPayload } from "../lib/tauri";
import * as tauri from "../lib/tauri";
import { $profile } from "../stores/profile";
import { $streams, $statuses } from "../stores/streams";
import { $settings, $recordingSettings } from "../stores/settings";
import { $wishlist, $ignorelist } from "../stores/wishlist";
import { loadSongs } from "../stores/songs";

export function useProfileSync(): void {
  useEffect(() => {
    const unlisten = listen<ProfileChangedPayload>(
      "profile-changed",
      async (event) => {
        const profile = event.payload.profile;

        // Update stores from profile data
        $profile.set({
          name: profile.name,
          recording: profile.recording,
          wishlist: profile.wishlist,
          ignorelist: profile.ignorelist,
        });
        $streams.set(profile.streams);

        // Partial update settings activeProfile
        const currentSettings = $settings.get();
        if (currentSettings) {
          $settings.set({ ...currentSettings, activeProfile: profile.name });
        }

        // Reset all stream statuses to idle
        $statuses.set({});

        // Wishlist + ignorelist — re-fetch from backend (new active profile)
        try {
          const [wl, il] = await Promise.all([
            tauri.getWishlist(),
            tauri.getIgnorelist(),
          ]);
          $wishlist.set(wl);
          $ignorelist.set(il);
        } catch (e) {
          console.error("useProfileSync: failed to refresh wishlist/ignorelist", e);
        }

        // Songs — re-fetch for new profile's outputDir
        loadSongs();

        // RecordingSettings — re-fetch for new profile's recording config
        try {
          const rec = await tauri.getRecordingSettings();
          $recordingSettings.set(rec);
        } catch (e) {
          console.error("useProfileSync: failed to refresh recording settings", e);
        }
      }
    );
    return () => { unlisten.then((fn) => fn()); };
  }, []);
}
