import type { Section } from "../stores/navigation";
import * as m from "../i18n/paraglide/messages";
import { SECTIONS } from "./sections";

export type ShortcutGroup = "global" | "navigation" | "context" | "list";

export interface ShortcutCtx {
  activeSection: Section;
}

/** Side effects injected into `run` so the registry itself stays pure. */
export interface ShortcutActions {
  setSection: (s: Section) => void;
  toggleCommandPalette: () => void;
  toggleSettings: () => void;
  toggleProfileSettings: () => void;
  openAddStream: () => void;
  openHelp: () => void;
  openCreateProfile: () => void;
  openAddPattern: () => void;
  openCreateSchedule: () => void;
}

export interface Shortcut {
  /** Stable action id, e.g. "section:streams". */
  id: string;
  /** Canonical accelerator string ("Ctrl+K", "Alt+1", "F1") — also the help label. */
  combo: string;
  /** i18n label getter. */
  label: () => string;
  /** Grouping in the F1 help dialog. */
  group: ShortcutGroup;
  /** Present ⇒ included in RESERVED_WEBVIEW_COMBOS (KeyRecorder guard). */
  reserved?: boolean;
  /** Present ⇒ dispatched centrally by the App.tsx listener. */
  match?: (e: KeyboardEvent) => boolean;
  /** Context gate (active section / disabled). */
  when?: (ctx: ShortcutCtx) => boolean;
  /** Effect, run with injected actions. */
  run?: (a: ShortcutActions, ctx: ShortcutCtx) => void;
}

// Ctrl OR Meta, and no other modifier. e.code matches the physical key so
// Cyrillic layouts still work (accessibility.md §12).
const ctrlOrMeta = (e: KeyboardEvent): boolean =>
  (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;

// One section-nav shortcut per section, generated so the digit↔section mapping
// can never drift from SECTIONS. Disabled sections match nothing (when=false).
const sectionShortcuts: Shortcut[] = SECTIONS.map((s) => ({
  id: `section:${s.id}`,
  combo: `Alt+${s.digit}`,
  label: s.label,
  group: "navigation",
  reserved: true,
  match: (e) =>
    e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && e.code === `Digit${s.digit}`,
  when: () => !s.disabled,
  run: (a) => a.setSection(s.id),
}));

/**
 * Every named webview shortcut. Entries with `match` are dispatched centrally
 * (App.tsx); entries without (F6/Shift+F6/Shift+F10) are handled by their own
 * hooks but listed here so they appear in the F1 help and stay reserved against
 * the KeyRecorder. reservedShortcuts.ts and ShortcutsHelp derive from
 * this array, so keep it the single source of truth.
 */
export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: "command-palette",
    combo: "Ctrl+K",
    label: m.command_palette_label,
    group: "global",
    reserved: true,
    match: (e) => ctrlOrMeta(e) && e.code === "KeyK",
    run: (a) => a.toggleCommandPalette(),
  },
  {
    id: "settings",
    combo: "Ctrl+,",
    label: m.settings_title,
    group: "global",
    reserved: true,
    match: (e) => ctrlOrMeta(e) && e.code === "Comma",
    run: (a) => a.toggleSettings(),
  },
  {
    // Матчинг по фізичній позиції (`e.code === "Comma"`), тож українська
    // розкладка, де кома вимагає Shift, нічого не ламає. `Ctrl+,` вище правити
    // не треба: `ctrlOrMeta` уже вимагає `!e.shiftKey`.
    id: "profile-settings",
    combo: "Ctrl+Shift+,",
    label: m.profile_settings,
    group: "global",
    reserved: true,
    match: (e) =>
      (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === "Comma",
    run: (a) => a.toggleProfileSettings(),
  },
  {
    id: "help",
    combo: "F1",
    label: m.shortcuts_help_action,
    group: "global",
    reserved: true,
    match: (e) => !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && e.code === "F1",
    run: (a) => a.openHelp(),
  },
  ...sectionShortcuts,
  {
    id: "new:streams",
    combo: "Ctrl+N",
    label: m.add_stream,
    group: "context",
    reserved: true,
    match: (e) => ctrlOrMeta(e) && e.code === "KeyN",
    when: (ctx) => ctx.activeSection === "streams",
    run: (a) => a.openAddStream(),
  },
  {
    id: "new:profiles",
    combo: "Ctrl+N",
    label: m.profile_create,
    group: "context",
    reserved: true,
    match: (e) => ctrlOrMeta(e) && e.code === "KeyN",
    when: (ctx) => ctx.activeSection === "profiles",
    run: (a) => a.openCreateProfile(),
  },
  {
    id: "new:wishlist",
    combo: "Ctrl+N",
    label: m.add_pattern,
    group: "context",
    reserved: true,
    match: (e) => ctrlOrMeta(e) && e.code === "KeyN",
    when: (ctx) => ctx.activeSection === "wishlist",
    run: (a) => a.openAddPattern(),
  },
  {
    id: "new:schedule",
    combo: "Ctrl+N",
    label: m.schedule_add,
    group: "context",
    reserved: true,
    match: (e) => ctrlOrMeta(e) && e.code === "KeyN",
    when: (ctx) => ctx.activeSection === "schedule",
    run: (a) => a.openCreateSchedule(),
  },
  // Tier 2′ — handled by their own hooks; here for help + reserved guard only.
  {
    id: "zone-nav",
    combo: "F6",
    label: m.settings_hotkey_action_zone_nav,
    group: "navigation",
    reserved: true,
  },
  {
    id: "zone-nav-back",
    combo: "Shift+F6",
    label: m.settings_hotkey_action_zone_nav_back,
    group: "navigation",
    reserved: true,
  },
  {
    id: "row-menu",
    combo: "Shift+F10",
    label: m.settings_hotkey_action_row_menu,
    group: "list",
    reserved: true,
  },
  // Fixed list-activation combos (useCompositeList): Shift = listen, Ctrl = record,
  // Alt = hand off to an external app — they override the configurable plain-Enter
  // action on rows that support them.
  {
    id: "row-listen",
    combo: "Shift+Enter",
    label: m.settings_hotkey_action_row_listen,
    group: "list",
    reserved: true,
  },
  {
    id: "row-record",
    combo: "Ctrl+Enter",
    label: m.settings_hotkey_action_row_record,
    group: "list",
    reserved: true,
  },
  {
    id: "row-open-external",
    combo: "Alt+Enter",
    label: m.settings_hotkey_action_row_open_external,
    group: "list",
    reserved: true,
  },
  {
    id: "copy-url",
    combo: "Ctrl+C",
    label: m.copy_url,
    group: "list",
    reserved: true,
  },
  // F2 — edit/rename the focused row. Handled by useCompositeList (no match/run);
  // listed here so it's reserved against the KeyRecorder (F2 is recordable, unlike
  // bare Enter/Delete) and surfaces in the F1 help.
  {
    id: "row-edit",
    combo: "F2",
    label: m.settings_hotkey_action_row_edit,
    group: "list",
    reserved: true,
  },
];

/**
 * Pure dispatch: first shortcut whose `match` fires and whose `when` (if any)
 * holds. e.repeat / focus guards live in the App.tsx listener, not here.
 */
export function matchShortcut(e: KeyboardEvent, ctx: ShortcutCtx): Shortcut | null {
  for (const s of SHORTCUTS) {
    if (!s.match || !s.match(e)) continue;
    if (s.when && !s.when(ctx)) continue;
    return s;
  }
  return null;
}
