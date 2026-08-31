import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ProfileChangedPayload } from "../lib/tauri";
import * as tauri from "../lib/tauri";
import { $profile } from "../stores/profile";
import { $streams, $statuses, replaceSelection } from "../stores/streams";
import { $settings, $profileSettings } from "../stores/settings";
import { $wishlist, $ignorelist, $wishlistMatches } from "../stores/wishlist";
import { loadSongs } from "../stores/songs";
import { loadSchedules } from "../stores/schedule";
import { addToast } from "../stores/toasts";
import * as m from "../i18n/paraglide/messages";

export function useProfileSync(): void {
  useEffect(() => {
    let cancelled = false;

    const unlisten = listen<ProfileChangedPayload>(
      "profile-changed",
      async (event) => {
        if (cancelled) return;

        const profile = event.payload.profile;

        // Update stores from profile data
        $profile.set({
          name: profile.name,
          recording: profile.recording,
          wishlist: profile.wishlist,
          ignorelist: profile.ignorelist,
        });
        $streams.set(profile.streams);
        // Selection is profile-scoped — clear immediately (explicit, so the toolbar
        // counter drops at once rather than waiting on the prune effect).
        replaceSelection(new Set());

        // Partial update settings activeProfile
        const currentSettings = $settings.get();
        if (currentSettings) {
          $settings.set({ ...currentSettings, activeProfile: profile.name });
        }

        // Reset all stream statuses to idle
        $statuses.set({});

        // Журнал збігів профільний разом із вішлістом — Rust уже спорожнив свій
        // буфер у switch_profile, дзеркало йде слідом. Зупинка запису його НЕ
        // чистить: там сеанс той самий.
        $wishlistMatches.set([]);

        // Wishlist + ignorelist — re-fetch from backend (new active profile)
        try {
          const [wl, il] = await Promise.all([
            tauri.getWishlist(),
            tauri.getIgnorelist(),
          ]);
          if (cancelled) return;
          $wishlist.set(wl);
          $ignorelist.set(il);
        } catch (e) {
          console.error("useProfileSync: failed to refresh wishlist/ignorelist", e);
          addToast(m.profile_sync_error(), "error");
        }

        // Songs — re-fetch for new profile's outputDir
        if (!cancelled) loadSongs();

        // Schedules — розклади нового активного профілю (Phase 3D)
        if (!cancelled) loadSchedules();

        // Профільні налаштування — поріг диску, сортування, автоперехід і
        // сповіщення мусять діяти за новим профілем одразу, без перезапуску.
        try {
          const ps = await tauri.getProfileSettings(profile.name);
          if (cancelled) return;
          $profileSettings.set(ps);
        } catch (e) {
          console.error("useProfileSync: failed to refresh profile settings", e);
          addToast(m.profile_sync_error(), "error");
        }
      }
    );

    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, []);
}
