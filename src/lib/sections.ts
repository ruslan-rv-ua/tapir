import type { Section } from "../stores/navigation";
import * as m from "../i18n/paraglide/messages";

export interface SectionMeta {
  /** Logical section id (matches `$activeSection`). */
  id: Section;
  /** i18n label getter — read at call time so it follows the active locale. */
  label: () => string;
  /** Alt+<digit> shortcut. Array index equals digit by construction. */
  digit: number;
  /** True while the section is not yet shippable (Schedule until Phase 3D). */
  disabled?: boolean;
}

/**
 * Single source of truth for section order, digits, and disabled state.
 * Consumed by the Alt+digit dispatch (shortcuts.ts), ActivityBar, and the F1
 * help dialog. Profiles is digit 0 (rendered separately at the top of the
 * ActivityBar); streams..songs are 1..5. Icons/phase live in ActivityBar —
 * presentation does not belong in a lib.
 */
export const SECTIONS: readonly SectionMeta[] = [
  { id: "profiles", label: m.profiles_section, digit: 0 },
  { id: "streams", label: m.streams_section, digit: 1 },
  { id: "browser", label: m.browser_section, digit: 2 },
  { id: "wishlist", label: m.wishlist_section, digit: 3 },
  { id: "schedule", label: m.schedule_section, digit: 4, disabled: true },
  { id: "songs", label: m.songs_section, digit: 5 },
];
