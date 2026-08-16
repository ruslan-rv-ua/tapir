/**
 * Land focus in a text field the way the browser convention for `Ctrl+F`
 * expects: focus it, or — if focus is already there — select what is typed, so
 * the next character starts a new query instead of appending to the old one.
 *
 * Shared by every zone that implements `ZoneEntry.focusSearch`
 * (useZoneNavigation.ts), which is where the rationale for the method lives.
 */
export function focusOrSelect(input: HTMLInputElement | null): void {
  if (!input) return;
  if (document.activeElement === input) input.select();
  else input.focus();
}
