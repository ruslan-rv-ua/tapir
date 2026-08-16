import { describe, it, expect, vi } from "vitest";
import type { Section } from "../stores/navigation";
import { matchShortcut, SHORTCUTS, type ShortcutActions, type ShortcutCtx } from "./shortcuts";

// Synthetic event: matchShortcut only reads code + the four modifier flags.
const ev = (
  code: string,
  mods: Partial<Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">> = {},
): KeyboardEvent =>
  ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods }) as KeyboardEvent;

const ctx = (activeSection: Section): ShortcutCtx => ({ activeSection });

const makeActions = (): ShortcutActions => ({
  setSection: vi.fn(),
  toggleCommandPalette: vi.fn(),
  toggleSettings: vi.fn(),
  toggleProfileSettings: vi.fn(),
  openAddStream: vi.fn(),
  openHelp: vi.fn(),
  openCreateProfile: vi.fn(),
  openAddPattern: vi.fn(),
  openCreateSchedule: vi.fn(),
  toggleMute: vi.fn(),
  announceNowPlaying: vi.fn(),
  focusSearch: vi.fn(),
});

describe("matchShortcut — matching", () => {
  it("matches Ctrl+K → command-palette", () => {
    expect(matchShortcut(ev("KeyK", { ctrlKey: true }), ctx("streams"))?.id).toBe("command-palette");
  });

  it("matches Meta+K too (macOS-style)", () => {
    expect(matchShortcut(ev("KeyK", { metaKey: true }), ctx("streams"))?.id).toBe("command-palette");
  });

  it("matches Ctrl+, → settings", () => {
    expect(matchShortcut(ev("Comma", { ctrlKey: true }), ctx("streams"))?.id).toBe("settings");
  });

  // Регресія межі глобальне/профільне: дві комбінації на одній фізичній клавіші
  // не мають перехоплювати одна одну.
  it("matches Ctrl+Shift+, → profile-settings, not settings", () => {
    expect(matchShortcut(ev("Comma", { ctrlKey: true, shiftKey: true }), ctx("streams"))?.id)
      .toBe("profile-settings");
  });

  it("Ctrl+, never reaches profile-settings", () => {
    expect(matchShortcut(ev("Comma", { ctrlKey: true }), ctx("streams"))?.id).toBe("settings");
  });

  it("matches Meta+Shift+, too (macOS-style)", () => {
    expect(matchShortcut(ev("Comma", { metaKey: true, shiftKey: true }), ctx("streams"))?.id)
      .toBe("profile-settings");
  });

  it("Ctrl+Alt+, matches neither", () => {
    expect(matchShortcut(ev("Comma", { ctrlKey: true, altKey: true }), ctx("streams"))).toBeNull();
    expect(matchShortcut(ev("Comma", { ctrlKey: true, altKey: true, shiftKey: true }), ctx("streams")))
      .toBeNull();
  });

  it("matches F1 → help", () => {
    expect(matchShortcut(ev("F1"), ctx("streams"))?.id).toBe("help");
  });

  it("matches Ctrl+M → toggle-mute, but leaves Ctrl+Shift+M alone (Teams/Discord)", () => {
    expect(matchShortcut(ev("KeyM", { ctrlKey: true }), ctx("streams"))?.id).toBe("toggle-mute");
    expect(matchShortcut(ev("KeyM", { ctrlKey: true, shiftKey: true }), ctx("streams"))).toBeNull();
  });

  it("matches bare F9 → now-playing", () => {
    expect(matchShortcut(ev("F9"), ctx("streams"))?.id).toBe("now-playing");
    expect(matchShortcut(ev("F9", { shiftKey: true }), ctx("streams"))).toBeNull();
  });

  // Global (no `when`): a section without a search field still answers the key —
  // silence would be indistinguishable from "the app is stuck".
  it("matches Ctrl+F → focus-search on every section", () => {
    expect(matchShortcut(ev("KeyF", { ctrlKey: true }), ctx("browser"))?.id).toBe("focus-search");
    expect(matchShortcut(ev("KeyF", { ctrlKey: true }), ctx("schedule"))?.id).toBe("focus-search");
    expect(matchShortcut(ev("KeyF", { metaKey: true }), ctx("songs"))?.id).toBe("focus-search");
  });

  // AltGr reports ctrl+alt on European layouts — it must stay a character.
  it("leaves Ctrl+Alt+F and Ctrl+Shift+F alone", () => {
    expect(matchShortcut(ev("KeyF", { ctrlKey: true, altKey: true }), ctx("browser"))).toBeNull();
    expect(matchShortcut(ev("KeyF", { ctrlKey: true, shiftKey: true }), ctx("browser"))).toBeNull();
  });

  it("maps Alt+digit to the right section", () => {
    expect(matchShortcut(ev("Digit0", { altKey: true }), ctx("streams"))?.id).toBe("section:profiles");
    expect(matchShortcut(ev("Digit1", { altKey: true }), ctx("songs"))?.id).toBe("section:streams");
    expect(matchShortcut(ev("Digit5", { altKey: true }), ctx("streams"))?.id).toBe("section:songs");
  });

  it("maps Alt+4 → schedule (shipped in Phase 3D)", () => {
    expect(matchShortcut(ev("Digit4", { altKey: true }), ctx("streams"))?.id).toBe("section:schedule");
  });

  it("matches Ctrl+N only on the streams section", () => {
    expect(matchShortcut(ev("KeyN", { ctrlKey: true }), ctx("streams"))?.id).toBe("new:streams");
    expect(matchShortcut(ev("KeyN", { ctrlKey: true }), ctx("songs"))).toBeNull();
  });

  it("is e.code-based, so it works on a Cyrillic layout", () => {
    // Physical N yields key "т" on Cyrillic, but e.code stays "KeyN".
    const cyrillic = { code: "KeyN", key: "т", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false } as KeyboardEvent;
    expect(matchShortcut(cyrillic, ctx("streams"))?.id).toBe("new:streams");
  });

  it("requires exact modifiers (Ctrl+Alt+1 is not a section shortcut)", () => {
    expect(matchShortcut(ev("Digit1", { altKey: true, ctrlKey: true }), ctx("streams"))).toBeNull();
  });

  it("does not match the numpad (Alt+Numpad is a Windows alt-code)", () => {
    expect(matchShortcut(ev("Numpad1", { altKey: true }), ctx("streams"))).toBeNull();
  });

  it("returns null for an unbound combo", () => {
    expect(matchShortcut(ev("KeyJ", { ctrlKey: true, shiftKey: true }), ctx("streams"))).toBeNull();
  });
});

describe("matchShortcut — run mapping", () => {
  it("Ctrl+K runs toggleCommandPalette", () => {
    const a = makeActions();
    const c = ctx("streams");
    matchShortcut(ev("KeyK", { ctrlKey: true }), c)!.run!(a, c);
    expect(a.toggleCommandPalette).toHaveBeenCalledOnce();
  });

  it("Alt+1 runs setSection('streams')", () => {
    const a = makeActions();
    const c = ctx("songs");
    matchShortcut(ev("Digit1", { altKey: true }), c)!.run!(a, c);
    expect(a.setSection).toHaveBeenCalledWith("streams");
  });

  it("Ctrl+N runs openAddStream", () => {
    const a = makeActions();
    const c = ctx("streams");
    matchShortcut(ev("KeyN", { ctrlKey: true }), c)!.run!(a, c);
    expect(a.openAddStream).toHaveBeenCalledOnce();
  });

  it("Ctrl+F runs focusSearch", () => {
    const a = makeActions();
    const c = ctx("browser");
    matchShortcut(ev("KeyF", { ctrlKey: true }), c)!.run!(a, c);
    expect(a.focusSearch).toHaveBeenCalledOnce();
  });

  it("F1 runs openHelp", () => {
    const a = makeActions();
    const c = ctx("streams");
    matchShortcut(ev("F1"), c)!.run!(a, c);
    expect(a.openHelp).toHaveBeenCalledOnce();
  });
});

describe("SHORTCUTS — registry shape", () => {
  it("every entry has a unique id and a non-empty combo + label", () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SHORTCUTS) {
      expect(s.combo.length).toBeGreaterThan(0);
      expect(s.label().length).toBeGreaterThan(0);
    }
  });
});
