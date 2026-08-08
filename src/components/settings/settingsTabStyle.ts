/**
 * Shared class list for the vertical tab strip used by both settings surfaces —
 * `SettingsDialog` (global) and `ProfileSettingsDialog` (profile-scoped). One
 * constant so the two cannot drift: the boundary between them is meant to be
 * felt in *what* each holds, never in how the tabs look or focus.
 *
 * The `aria-disabled:` variants serve the profile dialog's post-processing tab,
 * which is focusable-but-disabled (APG); they cost nothing where unused.
 */
export const SETTINGS_TAB_CLS =
  "cursor-pointer rounded border-l-2 border-transparent px-3 py-2 text-left text-sm text-slate-400 outline-none hover:text-slate-200 selected:border-blue-400 selected:text-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400 aria-disabled:text-slate-600 forced-colors:text-[ButtonText] forced-colors:selected:border-[Highlight] forced-colors:selected:text-[HighlightText] forced-colors:aria-disabled:text-[GrayText]";
