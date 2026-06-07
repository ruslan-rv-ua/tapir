/**
 * Focus/modal guard for the Tier-2 global keyboard listener (App.tsx).
 *
 * The listener is attached to `window`, so without a guard it fires regardless
 * of where focus is — meaning a contextual/navigational hotkey (`Ctrl+N`,
 * `Alt+digit`) would steal a keystroke from a search field or fire on top of an
 * open dialog. This module centralises the "should this global shortcut be
 * ignored right now?" decision. See docs/keyboard-shortcuts-backlog.md (KB-04).
 *
 * Reuses the existing app patterns: `el.isContentEditable`
 * (see useCompositeList.ts) and `closest(MODAL_SELECTOR)` (see useZoneNavigation.ts).
 */

/**
 * Elements that mean "a dialog/modal is currently open". `aria-modal` and the
 * explicit `data-modal` attribute cover both react-aria dialogs (Settings) and
 * the hand-rolled CommandPalette. This is the canonical selector — the F6 zone
 * navigation imports it too.
 */
export const MODAL_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [data-modal="true"]';

/**
 * `<input>` types that capture text entry. Deliberately an allowlist: a focused
 * react-aria slider thumb is an `<input type="range">`, so blanket-matching
 * `<input>` would wrongly suppress shortcuts while a volume/position slider has
 * focus. Unlisted types (range, checkbox, radio, button, …) are not typing.
 */
const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
]);

/**
 * True when `el` is a text-entry target: a `<textarea>`, a text-like `<input>`,
 * or any contentEditable element. These are contexts where a keystroke is part
 * of what the user is typing and must not be hijacked by a global shortcut.
 */
export function isTextEntryTarget(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return TEXT_INPUT_TYPES.has((el as HTMLInputElement).type);
  return false;
}

/** True when `el` (or its closest ancestor) is an open modal/dialog. */
export function isInModal(el: Element | null = document.activeElement): boolean {
  return !!el?.closest(MODAL_SELECTOR);
}

/**
 * Whether a Tier-2 global shortcut should be ignored given current focus.
 * Suppressed while:
 *   - typing in a text field (e.g. the Browser search box), or
 *   - a modal/dialog is open — which also covers the KeyRecorder: it lives
 *     inside the Settings dialog while armed, so a combo it is recording never
 *     leaks out to fire a global shortcut.
 *
 * Defaults to `document.activeElement` to match the `isInModal()` convention in
 * useZoneNavigation; pass an element explicitly for testing.
 */
export function shouldIgnoreShortcut(
  active: Element | null = document.activeElement,
): boolean {
  return isTextEntryTarget(active) || isInModal(active);
}
