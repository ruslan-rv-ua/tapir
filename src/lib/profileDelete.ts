import * as m from "../i18n/paraglide/messages";

/**
 * Why this profile cannot be deleted, or `null` when it can. The backend forbids
 * exactly two rows — `Default` (`profile.rs::delete`) and the active profile
 * (`profile_commands.rs::delete_profile`) — and the interface hides the inline
 * button and disables the menu item for both. This is that same rule for the one
 * input path with no widget to hide: the `Delete` key.
 *
 * `Default` is checked first because it is normally the active profile too, and
 * "switch to another profile first" would be a lie there: switching away does
 * not make `Default` deletable. The unconditional rule wins.
 */
export function profileDeleteRefusal(name: string, activeProfile: string): string | null {
  if (name === "Default") return m.profile_delete_denied_default();
  if (name === activeProfile) return m.profile_delete_denied_active();
  return null;
}

/**
 * Localized text for a rejected `delete_profile`. `Forbidden:` never carries a
 * reason the user should read — it is an English sentence written for the log —
 * so it is re-derived from what the interface already knows about the row, and
 * falls back to a generic sentence when it cannot be (a rule added backend-side
 * later, or a profile that became active between the pre-check and the call).
 *
 * Everything else stays raw, as in `playRefusalMessage`: an IO failure names the
 * file or the permission, and a generic sentence would cost the user that detail.
 */
export function profileDeleteErrorMessage(
  err: unknown,
  name: string,
  activeProfile: string,
): string {
  const msg = String(err);
  if (!msg.startsWith("Forbidden:")) return msg;
  return profileDeleteRefusal(name, activeProfile) ?? m.profile_delete_denied_other();
}
