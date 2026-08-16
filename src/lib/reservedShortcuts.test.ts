import { describe, it, expect } from "vitest";
import * as m from "../i18n/paraglide/messages";
import { RESERVED_WEBVIEW_COMBOS, findReservedConflict } from "./reservedShortcuts";
import { matchShortcut } from "./shortcuts";

describe("RESERVED_WEBVIEW_COMBOS", () => {
  it("reserves exactly the registry's reserved combos, in registry order", () => {
    expect(RESERVED_WEBVIEW_COMBOS.map((r) => r.combo)).toEqual([
      "Ctrl+K", "Ctrl+,", "Ctrl+Shift+,", "F1", "Ctrl+M", "F9", "Ctrl+F",
      "Alt+0", "Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5",
      "Ctrl+N",
      "F6", "Shift+F6", "Shift+F10",
      "Shift+Enter", "Ctrl+Enter", "Alt+Enter",
      "Ctrl+C",
      "F2", "F4", "F5", "Shift+F5",
    ]);
  });

  it("reserves Alt+Enter so a global hotkey cannot shadow the external-open row action", () => {
    expect(findReservedConflict("Alt+Enter")).not.toBeNull();
  });
});

describe("findReservedConflict", () => {
  it("flags every reserved combo with a non-null label getter", () => {
    for (const { combo } of RESERVED_WEBVIEW_COMBOS) {
      expect(findReservedConflict(combo)).not.toBeNull();
    }
  });

  it("returns the command-palette label for Ctrl+K", () => {
    expect(findReservedConflict("Ctrl+K")?.()).toBe(m.command_palette_label());
  });

  it("returns the Add Stream label for Ctrl+N", () => {
    expect(findReservedConflict("Ctrl+N")?.()).toBe(m.add_stream());
  });

  it("covers Tier 2′ named keys that KeyRecorder can record", () => {
    expect(findReservedConflict("F6")).not.toBeNull();
    expect(findReservedConflict("Shift+F6")).not.toBeNull();
    expect(findReservedConflict("Shift+F10")).not.toBeNull();
    expect(findReservedConflict("F2")).not.toBeNull();
  });

  // KeyRecorder accepts both letters and F1–F24, so without these entries a user
  // could silently take the app's own keys for an OS hotkey.
  it("covers Ctrl+M, F9 and F4", () => {
    expect(findReservedConflict("Ctrl+M")).not.toBeNull();
    expect(findReservedConflict("F9")).not.toBeNull();
    expect(findReservedConflict("F4")).not.toBeNull();
  });

  it("returns null for a free combo", () => {
    expect(findReservedConflict("Ctrl+Shift+J")).toBeNull();
  });

  it("matches exactly — wrong case or a Tier-1 default does not collide", () => {
    expect(findReservedConflict("ctrl+k")).toBeNull();
    expect(findReservedConflict("Ctrl+Shift+R")).toBeNull();
  });
});

describe("Ctrl+C copy-url registration", () => {
  it("is reserved against the KeyRecorder", () => {
    expect(findReservedConflict("Ctrl+C")).not.toBeNull();
  });

  it("is NOT centrally dispatched (no match) — left to useCompositeList", () => {
    const e = {
      ctrlKey: true, metaKey: false, altKey: false, shiftKey: false,
      code: "KeyC", key: "c",
    } as unknown as KeyboardEvent;
    expect(matchShortcut(e, { activeSection: "streams" })).toBeNull();
  });
});
