/**
 * Focus/modal helpers for the global keyboard layers (App.tsx Tier-2 listener,
 * useZoneNavigation, useCompositeList).
 *
 * Two distinct reasons exist to suppress a key, and they have different scope:
 *   - CONTEXT (a modal/dialog is open, incl. an armed KeyRecorder): universal —
 *     no global handler should act behind a modal. Every global layer gates on
 *     `isInModal()`. See KB-04 / KB-14 in docs/keyboard-shortcuts-backlog.md.
 *   - COLLISION (the focused control consumes the keystroke, e.g. typing in a
 *     field): key-specific. The Tier-2 global combos are all modified or `F1`,
 *     so they never collide with text entry — which is why the global listener
 *     does NOT gate on `isTextEntryTarget`. That predicate is retained for the
 *     not-yet-built Tier 2′ row keys (`Enter`/`F2`/`Delete`), which DO collide
 *     with an inline-edit field and live in useCompositeList, not here.
 *
 * Reuses the existing app patterns: `el.isContentEditable` and
 * `closest(MODAL_SELECTOR)`.
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

/**
 * True when `el` (or its closest ancestor) is an open modal/dialog. Defaults to
 * `document.activeElement`; pass an element explicitly for testing. This is the
 * universal context gate — the App.tsx Tier-2 listener, useZoneNavigation, and
 * useCompositeList all suppress on it. It also covers the KeyRecorder, which is
 * armed inside the Settings dialog, so a combo it records never leaks out.
 */
export function isInModal(el: Element | null = document.activeElement): boolean {
  return !!el?.closest(MODAL_SELECTOR);
}
