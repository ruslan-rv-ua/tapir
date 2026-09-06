import { useCallback, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, act, screen } from "@testing-library/react";
import { $announcer } from "../stores/announcer";
import {
  useCompositeList,
  type CompositeListItem,
  type SegmentKind,
  type ActionType,
  type ActionModifiers,
  suppressesDefault,
  type SelectionChange,
  type TrailingStop,
} from "./useCompositeList";

/* ------------------------------------------------------------------ */
/* Test harness — mirrors the real list DOM:                          */
/*   <li> is the 'summary' (whole-row) focus stop;                    */
/*   info segments are role="group" divs; 'action-*' are <button>s.   */
/* ------------------------------------------------------------------ */

interface HarnessProps {
  items: CompositeListItem[];
  /** Identity of the result set on screen. Changing it = the panel replaced it. */
  resultSetKey?: string | null;
  onTabOut?: (forward: boolean) => void;
  onAction?: (
    type: ActionType,
    itemId: string,
    segment: SegmentKind,
    modifiers: ActionModifiers,
  ) => void;
  onEmpty?: () => void;
  onButtonClick?: (itemId: string, segment: string) => void;
  onParentKeyDown?: (e: ReactKeyboardEvent) => void;
  selectionRef?: { current: Set<string> };
  onSelectionChange?: (c: SelectionChange) => void;
  trailingStop?: TrailingStop;
}

function Harness({
  items,
  resultSetKey = null,
  onTabOut = () => {},
  onAction = () => {},
  onEmpty,
  onButtonClick,
  onParentKeyDown,
  selectionRef,
  onSelectionChange,
  trailingStop,
}: HarnessProps) {
  const selection = selectionRef
    ? {
        current: () => selectionRef.current as ReadonlySet<string>,
        replace: (next: ReadonlySet<string>) => {
          selectionRef.current = new Set(next);
        },
      }
    : undefined;

  const {
    listRef, trailingRef, onKeyDownCapture, onContextMenu, onClick,
    isFocused, isTrailingFocused, activateTrailing, restoreFocus,
  } = useCompositeList({
    items,
    resultSetKey,
    trailingStop,
    onTabOut,
    onAction,
    onEmpty,
    selection,
    onSelectionChange,
  });

  return (
    // Bubble-phase spy on a parent: lets tests assert what the capture handler
    // consumes (stopPropagation) vs. lets pass through.
    <div onKeyDown={onParentKeyDown}>
      <button data-testid="outside">outside</button>
      <button data-testid="restore" onClick={() => restoreFocus("forward")}>
        restore
      </button>
      <ul ref={listRef} role="list" data-testid="list" onKeyDownCapture={onKeyDownCapture} onContextMenu={onContextMenu} onClick={onClick}>
        {items.map((item) => (
          <li
            key={item.id}
            data-item-id={item.id}
            data-segment="summary"
            tabIndex={isFocused(item.id, "summary") ? 0 : -1}
            aria-label={`summary:${item.id}`}
          >
            {item.segments.map((seg) =>
              seg.startsWith("action-") ? (
                <button
                  key={seg}
                  data-item-id={item.id}
                  data-segment={seg}
                  data-context-menu-trigger={seg === "action-menu" ? "" : undefined}
                  tabIndex={isFocused(item.id, seg) ? 0 : -1}
                  onClick={() => onButtonClick?.(item.id, seg)}
                >
                  {seg}
                </button>
              ) : (
                <div
                  key={seg}
                  role="group"
                  data-item-id={item.id}
                  data-segment={seg}
                  tabIndex={isFocused(item.id, seg) ? 0 : -1}
                  aria-label={`${seg}:${item.id}`}
                >
                  {seg}
                </div>
              ),
            )}
          </li>
        ))}
        {/* Mirrors what CompositeList renders for a trailing stop. */}
        {trailingStop && (
          <li>
            <button
              ref={trailingRef}
              type="button"
              data-testid="trailing"
              tabIndex={isTrailingFocused ? 0 : -1}
              aria-busy={trailingStop.busy || undefined}
              onClick={() => void activateTrailing()}
            >
              {trailingStop.label}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const list = () => screen.getByTestId("list");

const stop = (id: string, seg: string) =>
  list().querySelector<HTMLElement>(`[data-item-id="${id}"][data-segment="${seg}"]`)!;

/**
 * Every focus stop the list currently offers a native Tab, as "id/segment".
 * The invariant these tests guard is "exactly one, and it is in the result set",
 * so they assert over the whole set rather than probing one element.
 */
const stops = () =>
  [...list().querySelectorAll<HTMLElement>('[data-item-id][tabindex="0"]')].map(
    (el) => `${el.dataset.itemId}/${el.dataset.segment}`,
  );

/** Fire a keydown on the currently focused list element (falls back to the ul). */
function press(key: string, init: KeyboardEventInit = {}) {
  const ae = document.activeElement as HTMLElement | null;
  const target = ae && list().contains(ae) ? ae : list();
  // fireEvent returns dispatchEvent's verdict: false ⇔ preventDefault was called.
  return fireEvent.keyDown(target, { key, bubbles: true, ...init });
}

/** Dispatch a contextmenu event; returns false when preventDefault was called. */
function rightClick(el: HTMLElement) {
  return fireEvent.contextMenu(el, { bubbles: true });
}

function focusStart(id = "a") {
  act(() => stop(id, "summary").focus());
}

function expectActive(id: string | null, seg: string | null) {
  const ae = document.activeElement as HTMLElement | null;
  expect(ae?.getAttribute("data-item-id") ?? null).toBe(id);
  expect(ae?.getAttribute("data-segment") ?? null).toBe(seg);
}

const noMods: ActionModifiers = { shift: false, ctrl: false, alt: false };

const makeItems = (): CompositeListItem[] => [
  { id: "a", segments: ["track", "tech", "action-play", "action-record", "action-menu"] },
  { id: "b", segments: ["track", "tech"] },
  { id: "c", segments: ["metadata", "action-add", "action-menu"] },
];

/* ================================================================== */

describe("useCompositeList — initial state & roving tabIndex", () => {
  it("makes the first item's summary the only tabIndex=0 stop", () => {
    render(<Harness items={makeItems()} />);
    expect(stop("a", "summary").tabIndex).toBe(0);
    expect(stop("b", "summary").tabIndex).toBe(-1);
    expect(stop("c", "summary").tabIndex).toBe(-1);
    expect(stop("a", "track").tabIndex).toBe(-1);
  });

  it("starts with no active stop when the list is empty", () => {
    const onTabOut = vi.fn();
    render(<Harness items={[]} onTabOut={onTabOut} />);
    // No crash, and Tab still exits the (empty) zone.
    fireEvent.keyDown(list(), { key: "Tab" });
    expect(onTabOut).toHaveBeenCalledWith(true);
  });
});

describe("vertical navigation always lands on the whole-row summary", () => {
  it("ArrowDown / ArrowUp move between adjacent rows", () => {
    render(<Harness items={makeItems()} />);
    focusStart("a");

    press("ArrowDown");
    expectActive("b", "summary");
    expect(stop("b", "summary").tabIndex).toBe(0);
    expect(stop("a", "summary").tabIndex).toBe(-1);

    press("ArrowUp");
    expectActive("a", "summary");
  });

  it("does not move past the first/last row", () => {
    render(<Harness items={makeItems()} />);
    focusStart("a");
    press("ArrowUp");
    expectActive("a", "summary");

    press("End");
    expectActive("c", "summary");
    press("ArrowDown");
    expectActive("c", "summary");
  });

  it("Home / End jump to the first / last row summary", () => {
    render(<Harness items={makeItems()} />);
    focusStart("a");
    press("End");
    expectActive("c", "summary");
    press("Home");
    expectActive("a", "summary");
  });

  it("resets to summary when moving vertically out of a drilled-in segment", () => {
    render(<Harness items={makeItems()} />);
    focusStart("a");
    press("ArrowRight"); // a/track
    expectActive("a", "track");
    press("ArrowDown"); // -> b, NOT b/track
    expectActive("b", "summary");
  });

  it("PageDown / PageUp move and reset to summary", () => {
    render(<Harness items={makeItems()} />);
    focusStart("a");
    press("PageDown");
    // jsdom has zero layout, so a page resolves to ~1 row; key point: it reset to summary.
    expect(document.activeElement?.getAttribute("data-segment")).toBe("summary");
    expect(document.activeElement?.getAttribute("data-item-id")).not.toBe("a");
  });
});

describe("horizontal navigation within a row (Left/Right between segments)", () => {
  it("Right walks summary -> segments -> action buttons, then stays at the last", () => {
    render(<Harness items={makeItems()} />);
    focusStart("a");
    const order = ["track", "tech", "action-play", "action-record", "action-menu"];
    for (const seg of order) {
      press("ArrowRight");
      expectActive("a", seg);
    }
    press("ArrowRight"); // already at last
    expectActive("a", "action-menu");
  });

  it("Left walks back to summary and stays there", () => {
    render(<Harness items={makeItems()} />);
    focusStart("a");
    press("ArrowRight"); // track
    press("ArrowRight"); // tech
    press("ArrowLeft"); // track
    expectActive("a", "track");
    press("ArrowLeft"); // summary
    expectActive("a", "summary");
    press("ArrowLeft"); // stays
    expectActive("a", "summary");
  });
});

describe("activation keys", () => {
  it("Enter on summary fires primary; Space fires toggle", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");

    press("Enter");
    expect(onAction).toHaveBeenCalledWith("primary", "a", "summary", noMods);

    press(" ");
    expect(onAction).toHaveBeenCalledWith("toggle", "a", "summary", noMods);
  });

  it("Enter carries exactly one of Shift/Ctrl/Alt to onAction", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");

    press("Enter", { shiftKey: true });
    expect(onAction).toHaveBeenLastCalledWith("primary", "a", "summary", {
      shift: true,
      ctrl: false,
      alt: false,
    });

    press("Enter", { ctrlKey: true });
    expect(onAction).toHaveBeenLastCalledWith("primary", "a", "summary", {
      shift: false,
      ctrl: true,
      alt: false,
    });
  });

  it("Enter refuses modifier PAIRS and Meta rather than ranking them", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");

    press("Enter", { ctrlKey: true, shiftKey: true });
    press("Enter", { ctrlKey: true, altKey: true }); // AltGr on European layouts
    press("Enter", { shiftKey: true, altKey: true });
    press("Enter", { ctrlKey: true, shiftKey: true, altKey: true });
    press("Enter", { metaKey: true });
    expect(onAction).not.toHaveBeenCalled();
  });

  // Space is a plain list key: nothing above the guard names a modified one, so
  // it never reaches onAction at all. The old test asserted the opposite for
  // Alt+Space — the one modifier no list ever read, so it stayed green over a
  // claim that was false for Shift+Space in Streams.
  it("Space takes no modifiers — a modified Space is not the list's key", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");

    press(" ", { code: "Space", shiftKey: true });
    press(" ", { code: "Space", altKey: true });
    expect(onAction).not.toHaveBeenCalled();

    press(" ", { code: "Space" });
    expect(onAction).toHaveBeenCalledWith("toggle", "a", "summary", noMods);
  });

  it("Enter on an info segment fires primary for that segment", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");
    press("ArrowRight"); // a/track
    press("Enter");
    expect(onAction).toHaveBeenCalledWith("primary", "a", "track", noMods);
  });

  it("Delete fires delete; bare F10 does not fire contextMenu", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");

    press("Delete");
    expect(onAction).toHaveBeenCalledWith("delete", "a", "summary", noMods);

    onAction.mockClear();
    press("F10"); // no shift
    expect(onAction).not.toHaveBeenCalled();
  });

  it("F2 fires edit for the active row", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");
    press("F2");
    expect(onAction).toHaveBeenCalledWith("edit", "a", "summary", noMods);
  });

  it("Ctrl+C fires copy for the active row", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");
    press("c", { code: "KeyC", ctrlKey: true });
    expect(onAction).toHaveBeenCalledWith("copy", "a", "summary", { shift: false, ctrl: true, alt: false });
  });

  it("Alt+Enter fires primary with the alt modifier set", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");
    press("Enter", { altKey: true });
    expect(onAction).toHaveBeenCalledWith("primary", "a", "summary", {
      shift: false, ctrl: false, alt: true,
    });
  });

  it("Ctrl+C with no active item does nothing", () => {
    const onAction = vi.fn();
    render(<Harness items={[]} onAction={onAction} />);
    press("c", { code: "KeyC", ctrlKey: true });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("contextmenu on a row suppresses the native menu and clicks the row's trigger", () => {
    const onButtonClick = vi.fn();
    render(<Harness items={makeItems()} onButtonClick={onButtonClick} />);
    focusStart("a");

    // Right-click anywhere on row 'a' (its summary <li>) opens that row's menu.
    const prevented = rightClick(stop("a", "summary")) === false;
    expect(prevented).toBe(true); // preventDefault → native menu suppressed
    expect(onButtonClick).toHaveBeenCalledWith("a", "action-menu");
  });

  it("contextmenu on a non-active row makes it active before opening", () => {
    const onButtonClick = vi.fn();
    render(<Harness items={makeItems()} onButtonClick={onButtonClick} />);
    focusStart("a"); // active row is 'a'

    // Row 'c' carries an action-menu trigger; right-click moves activity to it.
    rightClick(stop("c", "action-menu"));
    expect(stop("c", "summary").getAttribute("tabindex")).toBe("0");
    expect(onButtonClick).toHaveBeenCalledWith("c", "action-menu");
  });

  it("contextmenu on empty list space suppresses the native menu and opens nothing", () => {
    const onButtonClick = vi.fn();
    render(<Harness items={makeItems()} onButtonClick={onButtonClick} />);
    focusStart("a");

    const prevented = rightClick(list()) === false; // the <ul> itself, no row
    expect(prevented).toBe(true);
    expect(onButtonClick).not.toHaveBeenCalled();
  });

  it("does NOT synthesize onAction for Enter/Space on a native action button", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");
    press("ArrowRight"); // track
    press("ArrowRight"); // tech
    press("ArrowRight"); // action-play (a real <button>)
    expectActive("a", "action-play");
    expect((document.activeElement as HTMLElement).tagName).toBe("BUTTON");

    press("Enter");
    press(" ");
    // The button activates natively; the hook must not double-handle.
    expect(onAction).not.toHaveBeenCalledWith("primary", "a", "action-play");
    expect(onAction).not.toHaveBeenCalledWith("toggle", "a", "action-play");
  });
});

describe("Tab exits the zone", () => {
  it("Tab -> forward, Shift+Tab -> backward", () => {
    const onTabOut = vi.fn();
    render(<Harness items={makeItems()} onTabOut={onTabOut} />);
    focusStart("a");

    press("Tab");
    expect(onTabOut).toHaveBeenLastCalledWith(true);

    press("Tab", { shiftKey: true });
    expect(onTabOut).toHaveBeenLastCalledWith(false);
  });
});

describe("capture phase: consumes navigation keys, passes through the rest", () => {
  it("stops navigation keys from reaching a parent handler", () => {
    const onParentKeyDown = vi.fn();
    render(<Harness items={makeItems()} onParentKeyDown={onParentKeyDown} />);
    focusStart("a");

    press("ArrowDown");
    expect(onParentKeyDown).not.toHaveBeenCalled();
  });

  it("lets unhandled keys bubble to the parent", () => {
    const onParentKeyDown = vi.fn();
    render(<Harness items={makeItems()} onParentKeyDown={onParentKeyDown} />);
    focusStart("a");

    press("x");
    expect(onParentKeyDown).toHaveBeenCalledTimes(1);
  });

  it("lets Enter on a native button bubble to the parent (passthrough)", () => {
    const onParentKeyDown = vi.fn();
    render(<Harness items={makeItems()} onParentKeyDown={onParentKeyDown} />);
    focusStart("a");
    press("ArrowRight");
    press("ArrowRight");
    press("ArrowRight"); // action-play button
    onParentKeyDown.mockClear();

    press("Enter");
    expect(onParentKeyDown).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/* A list key is bare unless named — ADR 2026-09-04                    */
/* docs/decisions/2026-09-04-list-keys-are-bare-unless-named.md        */
/* ------------------------------------------------------------------ */

// The matrix is the TEST's job, not a human's: suppressesDefault is pure and
// derived from resolveKeyAction, so every key × modifier pair is one call.
describe("suppressesDefault — the key × modifier matrix", () => {
  type Mods = Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>>;
  const stroke = (key: string, code: string, mods: Mods = {}) => ({
    key,
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods,
  });

  /** Every key the switch below the guard owns — 12 of them, plus Space. */
  const LIST_KEYS: [string, string][] = [
    ["ArrowUp", "ArrowUp"],
    ["ArrowDown", "ArrowDown"],
    ["ArrowLeft", "ArrowLeft"],
    ["ArrowRight", "ArrowRight"],
    ["Home", "Home"],
    ["End", "End"],
    ["PageUp", "PageUp"],
    ["PageDown", "PageDown"],
    ["Escape", "Escape"],
    ["Delete", "Delete"],
    ["F2", "F2"],
    ["F4", "F4"],
    [" ", "Space"],
  ];

  /** Named above the guard, so they resolve rather than being suppressed. */
  const NAMED_KEYS: [string, string][] = [
    ["Enter", "Enter"],
    ["F5", "F5"],
    ["Tab", "Tab"],
  ];

  it.each(LIST_KEYS)("suppresses Ctrl / Shift / Ctrl+Shift on %s", (key, code) => {
    expect(suppressesDefault(stroke(key, code, { ctrlKey: true }))).toBe(true);
    expect(suppressesDefault(stroke(key, code, { shiftKey: true }))).toBe(true);
    expect(suppressesDefault(stroke(key, code, { ctrlKey: true, shiftKey: true }))).toBe(true);
  });

  // Every pair that contains Alt or Meta, not a sample of them: the rule is
  // "one foreign modifier is enough to make it the OS layer's business".
  it.each(LIST_KEYS)("never touches Alt or Meta on %s — that is the OS layer", (key, code) => {
    expect(suppressesDefault(stroke(key, code, { altKey: true }))).toBe(false);
    expect(suppressesDefault(stroke(key, code, { metaKey: true }))).toBe(false);
    expect(suppressesDefault(stroke(key, code, { ctrlKey: true, altKey: true }))).toBe(false);
    expect(suppressesDefault(stroke(key, code, { ctrlKey: true, metaKey: true }))).toBe(false);
    expect(suppressesDefault(stroke(key, code, { shiftKey: true, altKey: true }))).toBe(false);
    expect(suppressesDefault(stroke(key, code, { shiftKey: true, metaKey: true }))).toBe(false);
    expect(suppressesDefault(stroke(key, code, { altKey: true, metaKey: true }))).toBe(false);
  });

  it.each([...LIST_KEYS, ...NAMED_KEYS])("leaves the bare %s alone", (key, code) => {
    expect(suppressesDefault(stroke(key, code))).toBe(false);
  });

  // Enter/F5/Tab are named above the guard, so a Ctrl/Shift form of them either
  // resolves (and is consumed outright) or is refused — either way this
  // predicate is only ever consulted on the refusal path, where dropping the
  // default is still right: Ctrl+Shift+Enter has a live browser default too.
  it.each(NAMED_KEYS)("still answers for the named %s", (key, code) => {
    expect(suppressesDefault(stroke(key, code, { ctrlKey: true }))).toBe(true);
    expect(suppressesDefault(stroke(key, code, { altKey: true }))).toBe(false);
  });

  it("says nothing about keys the list never owned", () => {
    for (const mods of [{ ctrlKey: true }, { shiftKey: true }, { altKey: true }] as Mods[]) {
      expect(suppressesDefault(stroke("x", "KeyX", mods))).toBe(false);
      expect(suppressesDefault(stroke("F7", "F7", mods))).toBe(false);
      expect(suppressesDefault(stroke("Insert", "Insert", mods))).toBe(false);
    }
  });
});

describe("modified list keys are refused, not consumed", () => {
  it("Ctrl+End does not move the cursor, reaches the parent, and loses its default", () => {
    const onParentKeyDown = vi.fn();
    render(<Harness items={makeItems()} onParentKeyDown={onParentKeyDown} />);
    focusStart("a");

    const notPrevented = press("End", { ctrlKey: true });
    expectActive("a", "summary");
    expect(onParentKeyDown).toHaveBeenCalledTimes(1); // no stopPropagation
    expect(notPrevented).toBe(false); // the scroll default is dropped
  });

  it("Ctrl+End from an action button is suppressed too — the cursor is still a cursor", () => {
    render(<Harness items={makeItems()} />);
    focusStart("a");
    press("ArrowRight");
    press("ArrowRight");
    press("ArrowRight"); // a/action-play
    expectActive("a", "action-play");

    expect(press("End", { ctrlKey: true })).toBe(false);
    expectActive("a", "action-play");
  });

  it("Alt+Space is left entirely alone — it is the Windows window menu", () => {
    const onAction = vi.fn();
    const onParentKeyDown = vi.fn();
    render(
      <Harness items={makeItems()} onAction={onAction} onParentKeyDown={onParentKeyDown} />,
    );
    focusStart("a");

    const notPrevented = press(" ", { code: "Space", altKey: true });
    expect(onAction).not.toHaveBeenCalled();
    expect(onParentKeyDown).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(true); // no preventDefault on the OS layer
  });

  it("Alt+Delete and Shift+Delete do not open anything", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");

    press("Delete", { altKey: true });
    press("Delete", { shiftKey: true });
    press("Delete", { ctrlKey: true });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("Ctrl+Tab is an attempt at a shortcut, not a way out of the zone", () => {
    const onTabOut = vi.fn();
    const onParentKeyDown = vi.fn();
    render(
      <Harness items={makeItems()} onTabOut={onTabOut} onParentKeyDown={onParentKeyDown} />,
    );
    focusStart("a");

    press("Tab", { ctrlKey: true });
    expect(onTabOut).not.toHaveBeenCalled();
    expect(onParentKeyDown).toHaveBeenCalledTimes(1);
  });

  it("Ctrl+F2 / Shift+F2 / Alt+F4 no longer reach the row (the shared guard replaced theirs)", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");

    press("F2", { ctrlKey: true });
    press("F2", { shiftKey: true });
    press("F4", { altKey: true });
    expect(onAction).not.toHaveBeenCalled();

    press("F2");
    expect(onAction).toHaveBeenCalledWith("edit", "a", "summary", noMods);
  });

  it("F5 and Shift+F5 are untouched; Ctrl+F5 still declines", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");

    press("F5");
    expect(onAction).toHaveBeenLastCalledWith("transfer-copy", "a", "summary", noMods);

    press("F5", { shiftKey: true });
    expect(onAction).toHaveBeenLastCalledWith("transfer-move", "a", "summary", {
      shift: true,
      ctrl: false,
      alt: false,
    });

    onAction.mockClear();
    press("F5", { ctrlKey: true });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("Shift+Space on an action button is left to the button (§5)", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");
    press("ArrowRight");
    press("ArrowRight");
    press("ArrowRight"); // a/action-play

    // Not prevented ⇒ the browser's own Space activation still happens.
    expect(press(" ", { code: "Space", shiftKey: true })).toBe(true);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("Shift+Space on the trailing stop is left to the button too", () => {
    const stopDesc = trailing();
    render(<Harness items={makeItems()} trailingStop={stopDesc} />);
    goLastRow();
    press("ArrowDown"); // onto the trailing stop
    expect(document.activeElement).toBe(trailingBtn());

    expect(press(" ", { code: "Space", shiftKey: true })).toBe(true);
    expect(stopDesc.onActivate).not.toHaveBeenCalled(); // the click would, not us
  });
});

describe("modal containment", () => {
  it("swallows nothing while inside an aria-modal container (canonical MODAL_SELECTOR)", () => {
    // Regression: the modal check must share shortcutGuard's MODAL_SELECTOR, which
    // includes [aria-modal="true"]. A dialog that sets only aria-modal (no role or
    // data-modal) must still suppress the list's key handling — otherwise the list
    // hijacks navigation keys behind an open modal.
    const onParentKeyDown = vi.fn();
    render(
      <div aria-modal="true">
        <Harness items={makeItems()} onParentKeyDown={onParentKeyDown} />
      </div>,
    );
    focusStart("a");

    press("ArrowDown");
    // The hook bailed: focus did not move and the event bubbled to the parent.
    expectActive("a", "summary");
    expect(onParentKeyDown).toHaveBeenCalled();
  });
});

describe("restoreFocus (zone re-entry)", () => {
  it("returns to the remembered item and segment", () => {
    render(<Harness items={makeItems()} />);
    focusStart("a");
    press("ArrowDown"); // b/summary
    press("ArrowRight"); // b/track
    expectActive("b", "track");

    act(() => screen.getByTestId("outside").focus());
    expect(list().contains(document.activeElement)).toBe(false);

    act(() => screen.getByTestId("restore").click());
    expectActive("b", "track");
  });

  it("falls back to the first item summary when nothing was visited", () => {
    render(<Harness items={makeItems()} />);
    act(() => screen.getByTestId("restore").click());
    expectActive("a", "summary");
  });

  it("falls back to a clamped neighbor when the remembered item is gone", () => {
    const { rerender } = render(<Harness items={makeItems()} />);
    focusStart("a");
    press("End"); // c/summary  (remembered index 2)
    expectActive("c", "summary");

    act(() => screen.getByTestId("outside").focus());
    rerender(<Harness items={makeItems().filter((i) => i.id !== "c")} />); // drop c

    act(() => screen.getByTestId("restore").click());
    // remembered id "c" gone -> clamp(prevIndex=2, len-1=1) -> "b"
    expectActive("b", "summary");
  });
});

/* ------------------------------------------------------------------ */
/* A NEW RESULT SET vs. DRIFT — ADR 2026-09-06                        */
/* docs/decisions/2026-09-06-new-result-set-forgets-the-current-stop.md */
/* ------------------------------------------------------------------ */

const RECORDING: CompositeListItem[] = [{ id: "b", segments: ["track"] }];

describe("a new result set (the key changed) forgets the current stop", () => {
  it("seats the only stop on the first row when the active row is not in the new set", () => {
    // The reported bug, in the state that produced it: the person has walked the
    // list, focus is parked on a LIVE control outside it (a filter chip), and the
    // new result set does not contain the row the cursor sat on. A list with no
    // tabIndex=0 stop is skipped by a native Tab entirely.
    const { rerender } = render(<Harness items={makeItems()} resultSetKey="all" />);
    focusStart("a");
    press("ArrowDown"); // deliberate move: active = b
    act(() => screen.getByTestId("outside").focus());

    rerender(<Harness items={[{ id: "z", segments: ["track"] }]} resultSetKey="recording" />);

    expect(stops()).toEqual(["z/summary"]);
    expect(document.activeElement).toBe(screen.getByTestId("outside"));
  });

  it("forgets a row that SURVIVED the new set — the stop still goes to the first row", () => {
    // A row present in both sets is a coincidence, not an identity: entry
    // mid-list would not say whether the filter did anything (ADR §1).
    const { rerender } = render(<Harness items={makeItems()} resultSetKey="all" />);
    focusStart("a");
    press("ArrowDown"); // active = b
    act(() => screen.getByTestId("outside").focus());

    // b survives the new set, but NOT as its first row.
    rerender(
      <Harness
        items={[{ id: "z", segments: ["track"] }, { id: "b", segments: ["track"] }]}
        resultSetKey="recording"
      />,
    );

    expect(stops()).toEqual(["z/summary"]);
  });

  it("keeps the answer the same through all three ways in", () => {
    // Native Tab reads the roving tabIndex=0 stop; F6 goes through restoreFocus;
    // returning to the previous chip is a third new result set. One list, one
    // answer (ADR §6).
    const { rerender } = render(<Harness items={makeItems()} resultSetKey="all" />);
    focusStart("a");
    press("End"); // active = c
    act(() => screen.getByTestId("outside").focus());

    rerender(<Harness items={RECORDING} resultSetKey="recording" />);
    expect(stops()).toEqual(["b/summary"]); // native Tab target

    act(() => screen.getByTestId("restore").click()); // F6 entry
    expectActive("b", "summary");

    act(() => screen.getByTestId("outside").focus());
    rerender(<Harness items={makeItems()} resultSetKey="all" />); // back to "All"
    expect(stops()).toEqual(["a/summary"]); // the FIRST row, not the old one
    act(() => screen.getByTestId("restore").click());
    expectActive("a", "summary");
  });

  it("moves the stop at once, before the new rows arrive", () => {
    // The criteria change first and the rows follow — half a second later for a
    // debounced text search. A native Tab in that window must not land on a row
    // from the set that is already gone.
    const { rerender } = render(<Harness items={makeItems()} resultSetKey="q:" />);
    focusStart("a");
    press("End"); // active = c
    act(() => screen.getByTestId("outside").focus());
    expect(stops()).toEqual(["c/summary"]);

    rerender(<Harness items={makeItems()} resultSetKey="q:ja" />); // same rows, new criteria

    expect(stops()).toEqual(["a/summary"]);
  });

  it("does not move focus", () => {
    const { rerender } = render(<Harness items={makeItems()} resultSetKey="all" />);
    focusStart("a");
    press("ArrowDown");
    act(() => screen.getByTestId("outside").focus());

    rerender(<Harness items={RECORDING} resultSetKey="recording" />);

    expect(document.activeElement).toBe(screen.getByTestId("outside"));
  });

  it("is a no-op while the list holds focus — never yank a live cursor", () => {
    // ADR §5: the rule is about the NEXT entry. While the list has focus the
    // current stop IS the focus.
    const { rerender } = render(<Harness items={makeItems()} resultSetKey="all" />);
    focusStart("a");
    press("ArrowDown"); // active = b, focus inside the list

    rerender(<Harness items={makeItems()} resultSetKey="recording" />);

    expectActive("b", "summary");
    expect(stops()).toEqual(["b/summary"]);
  });

  it("leaves the range anchor usable — Shift+Click still spans, it does not collapse", () => {
    // The pointer range reads memoryRef.current.itemId as its anchor, so a reset
    // that blanked the focus memory would turn the next Shift+Click into a
    // one-row selection.
    const selectionRef = { current: new Set<string>() };
    const { rerender } = render(
      <Harness items={makeItems()} resultSetKey="all" selectionRef={selectionRef} />,
    );
    focusStart("a");
    press("ArrowDown"); // b/summary
    act(() => screen.getByTestId("outside").focus());
    rerender(<Harness items={makeItems()} resultSetKey="name" selectionRef={selectionRef} />);

    // The cursor now sits on the first row, so the span runs from there.
    clickRow("c", { shiftKey: true });
    expect([...selectionRef.current].sort()).toEqual(["a", "b", "c"]);
  });

  it("takes the focus with it when the row UNDER it goes with the old result set", () => {
    // ADR §5's other half. The criteria changed while the person stood in the
    // list and their own row is not in the new set, so focus has nowhere to be —
    // and a live person on <body> is the failure this project refuses. The first
    // row of the new set takes the focus along with the stop.
    const { rerender } = render(<Harness items={makeItems()} resultSetKey="all" />);
    focusStart("a");
    press("ArrowDown"); // active = b, index 1, focus inside the list

    rerender(
      <Harness
        items={[{ id: "a", segments: ["track"] }, { id: "c", segments: ["track"] }]}
        resultSetKey="recording"
      />,
    );

    expectActive("a", "summary");
    expect(stops()).toEqual(["a/summary"]);
  });

  it("leaves an EMPTY new result set with no stop at all", () => {
    // Correct, and the reason the empty state carries its own focusable anchor
    // (accessibility.md §3.1): there is no row to be the way in.
    const { rerender } = render(<Harness items={makeItems()} resultSetKey="all" />);
    focusStart("a");
    press("ArrowDown");
    act(() => screen.getByTestId("outside").focus());

    rerender(<Harness items={[]} resultSetKey="recording" />);

    expect(stops()).toEqual([]);
  });
});

describe("restoreFocus leaves nothing armed behind it", () => {
  it("does not pull focus back into the list on some later, unrelated commit", () => {
    // The queue is the FALLBACK for React bailing out of the re-render. Arming it
    // as well as focusing meant that in exactly the bail-out case it stayed armed,
    // and the next commit for any reason at all yanked focus out of wherever the
    // person had since moved it.
    const { rerender } = render(<Harness items={makeItems()} />);
    act(() => screen.getByTestId("restore").click()); // entry lands on "a"
    expectActive("a", "summary");
    act(() => screen.getByTestId("restore").click()); // same row again → React bails out
    act(() => screen.getByTestId("outside").focus());

    rerender(<Harness items={makeItems()} />); // any later commit at all

    expect(document.activeElement).toBe(screen.getByTestId("outside"));
  });
});

describe("live reconciliation when items change under the active row", () => {
  it("recovers focus to a neighbour when the active row itself is removed", () => {
    const { rerender } = render(<Harness items={makeItems()} />);
    focusStart("a");
    press("ArrowDown"); // active = b (index 1), focus on b
    expectActive("b", "summary");

    rerender(<Harness items={makeItems().filter((i) => i.id !== "b")} />); // drop active b

    // clamp(prevIndex=1, len-1=1) -> items[1] === "c"
    expectActive("c", "summary");
  });

  it("calls onEmpty when the last row is removed while focused", () => {
    const onEmpty = vi.fn();
    const { rerender } = render(
      <Harness items={[{ id: "only", segments: ["track"] }]} onEmpty={onEmpty} />,
    );
    focusStart("only");
    rerender(<Harness items={[]} onEmpty={onEmpty} />);
    expect(onEmpty).toHaveBeenCalledTimes(1);
  });

  it("does NOT steal focus when the user has already moved elsewhere", () => {
    const { rerender } = render(<Harness items={makeItems()} />);
    focusStart("a");
    press("ArrowDown"); // active = b

    act(() => screen.getByTestId("outside").focus()); // user moved to another control
    rerender(<Harness items={makeItems().filter((i) => i.id !== "b")} />);

    // Focus must remain where the user put it; the hook must not yank it back.
    expect(document.activeElement).toBe(screen.getByTestId("outside"));
  });

  it("re-seats the stop on the neighbour anyway — not moving focus is a different duty", () => {
    // Drift under an UNCHANGED result set (a stream stopped recording on its own)
    // while focus sits on a live control outside the list. "Don't move their
    // focus" must not become "leave the list with no way in" (ADR §3).
    const { rerender } = render(<Harness items={makeItems()} resultSetKey="recording" />);
    focusStart("a");
    press("ArrowDown"); // active = b, index 1

    act(() => screen.getByTestId("outside").focus());
    rerender(<Harness items={makeItems().filter((i) => i.id !== "b")} resultSetKey="recording" />);

    // clamp(prevIndex=1, len-1=1) -> "c", the neighbour by index — NOT the first row.
    expect(stops()).toEqual(["c/summary"]);
    expect(document.activeElement).toBe(screen.getByTestId("outside"));
  });

  it("leaves a surviving active row alone when the set only drifts", () => {
    const { rerender } = render(<Harness items={makeItems()} resultSetKey="all" />);
    focusStart("a");
    press("ArrowDown"); // active = b

    act(() => screen.getByTestId("outside").focus());
    rerender(<Harness items={makeItems().filter((i) => i.id !== "c")} resultSetKey="all" />);

    expect(stops()).toEqual(["b/summary"]);
  });
});

describe("selection — Ctrl+Space toggles the active row", () => {
  it("adds the active row to the selection and emits a single change (not toggle/record)", () => {
    const selectionRef = { current: new Set<string>() };
    const onAction = vi.fn();
    const onSelectionChange = vi.fn();
    render(
      <Harness items={makeItems()} onAction={onAction} selectionRef={selectionRef} onSelectionChange={onSelectionChange} />,
    );
    focusStart("a");

    press(" ", { code: "Space", ctrlKey: true });

    expect([...selectionRef.current]).toEqual(["a"]);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "single", via: "key", count: 1, lastId: "a", selected: true }),
    );
    // Must NOT fall into the record/play toggle branch.
    expect(onAction).not.toHaveBeenCalledWith("toggle", "a", "summary", expect.anything());
  });

  it("Ctrl+Space again removes the row (selected:false)", () => {
    const selectionRef = { current: new Set<string>(["a"]) };
    const onSelectionChange = vi.fn();
    render(<Harness items={makeItems()} selectionRef={selectionRef} onSelectionChange={onSelectionChange} />);
    focusStart("a");
    press(" ", { code: "Space", ctrlKey: true });
    expect(selectionRef.current.has("a")).toBe(false);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "single", via: "key", count: 0, lastId: "a", selected: false }),
    );
  });

  it("plain Space still fires record/play toggle (no selection change)", () => {
    const selectionRef = { current: new Set<string>() };
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} selectionRef={selectionRef} />);
    focusStart("a");
    press(" ");
    expect(onAction).toHaveBeenCalledWith("toggle", "a", "summary", noMods);
    expect(selectionRef.current.size).toBe(0);
  });

  it("Ctrl+Space on an action button still toggles the ROW (not gated by isNativeControl)", () => {
    const selectionRef = { current: new Set<string>() };
    render(<Harness items={makeItems()} selectionRef={selectionRef} />);
    focusStart("a");
    press("ArrowRight"); press("ArrowRight"); press("ArrowRight"); // a/action-play (a button)
    expectActive("a", "action-play");
    press(" ", { code: "Space", ctrlKey: true });
    expect([...selectionRef.current]).toEqual(["a"]);
  });
});

describe("selection — Shift+Arrow range from the anchor", () => {
  it("Shift+Down expands, then Shift+Up contracts (anchored, base-snapshot model)", () => {
    const selectionRef = { current: new Set<string>() };
    const onSelectionChange = vi.fn();
    render(<Harness items={makeItems()} selectionRef={selectionRef} onSelectionChange={onSelectionChange} />);
    focusStart("a");

    press(" ", { code: "Space", ctrlKey: true }); // anchor = a, select a
    press("ArrowDown", { shiftKey: true }); // span a..b
    expect([...selectionRef.current].sort()).toEqual(["a", "b"]);
    expectActive("b", "summary");

    press("ArrowDown", { shiftKey: true }); // span a..c
    expect([...selectionRef.current].sort()).toEqual(["a", "b", "c"]);

    press("ArrowUp", { shiftKey: true }); // span a..b — c drops
    expect([...selectionRef.current].sort()).toEqual(["a", "b"]);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "group", via: "key", count: 2 }),
    );
  });

  it("Shift+Down from an empty selection includes the focused row (Explorer-inclusive)", () => {
    const selectionRef = { current: new Set<string>() };
    const onSelectionChange = vi.fn();
    render(<Harness items={makeItems()} selectionRef={selectionRef} onSelectionChange={onSelectionChange} />);
    focusStart("a"); // focus on a, selection ∅
    press("ArrowDown", { shiftKey: true }); // a (anchor) + b (range)
    expect([...selectionRef.current].sort()).toEqual(["a", "b"]);
    expectActive("b", "summary");
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "group", via: "key", count: 2 }),
    );
  });

  it("Shift+Up from an empty selection includes the focused row", () => {
    const selectionRef = { current: new Set<string>() };
    render(<Harness items={makeItems()} selectionRef={selectionRef} />);
    focusStart("a");
    press("End"); // plain move to c (selection stays ∅)
    press("ArrowUp", { shiftKey: true }); // c (anchor) + b (range)
    expect([...selectionRef.current].sort()).toEqual(["b", "c"]);
    expectActive("b", "summary");
  });

  it("anchorBase guard: after external clear, a stale base row outside the new span does NOT resurrect", () => {
    const selectionRef = { current: new Set<string>() };
    render(<Harness items={makeItems()} selectionRef={selectionRef} />);
    focusStart("a");
    // Build a stale base of {a,b,c}: select all, then plain moves snapshot it.
    press("a", { code: "KeyA", ctrlKey: true }); // select {a,b,c}
    press("End");                                // setAnchor(c) → base = {a,b,c}
    press("Home");                               // setAnchor(a) → base = {a,b,c}, active = a
    // External clear (toolbar/lifecycle) WITHOUT touching the hook's anchor/base:
    selectionRef.current = new Set();
    press("ArrowDown", { shiftKey: true });
    // Explorer-inclusive: focused row a joins via the anchor, b via the range.
    // Stale base member c is OUTSIDE the span and must NOT resurrect.
    expect([...selectionRef.current].sort()).toEqual(["a", "b"]);
  });

  it("without a selection adapter, Shift+Down is a plain move (1:1 legacy)", () => {
    render(<Harness items={makeItems()} />);
    focusStart("a");
    press("ArrowDown", { shiftKey: true });
    expectActive("b", "summary");
  });
});

describe("selection — Escape clears non-empty, otherwise passes through", () => {
  it("non-empty: clears, emits group count 0, and consumes (no bubble)", () => {
    const selectionRef = { current: new Set<string>(["a", "b"]) };
    const onSelectionChange = vi.fn();
    const onParentKeyDown = vi.fn();
    render(
      <Harness items={makeItems()} selectionRef={selectionRef} onSelectionChange={onSelectionChange} onParentKeyDown={onParentKeyDown} />,
    );
    focusStart("a");
    press("Escape");
    expect(selectionRef.current.size).toBe(0);
    expect(onSelectionChange).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "group", count: 0 }));
    expect(onParentKeyDown).not.toHaveBeenCalled(); // consumed
  });

  it("empty: does NOT consume — Escape stays free in the list", () => {
    const selectionRef = { current: new Set<string>() };
    const onParentKeyDown = vi.fn();
    render(<Harness items={makeItems()} selectionRef={selectionRef} onParentKeyDown={onParentKeyDown} />);
    focusStart("a");
    press("Escape");
    expect(onParentKeyDown).toHaveBeenCalledTimes(1); // bubbled
  });
});

describe("selection — plain navigation re-sets the anchor", () => {
  it("after moving the cursor, Shift+Up contracts toward the NEW anchor, not the old one", () => {
    const selectionRef = { current: new Set<string>() };
    render(<Harness items={makeItems()} selectionRef={selectionRef} />);
    focusStart("a");
    press(" ", { code: "Space", ctrlKey: true }); // anchor=a
    press("End"); // plain move to c → anchor=c, base={a}
    press("ArrowUp", { shiftKey: true }); // span c..b → base{a} ∪ range(c,b)={b,c}
    expect([...selectionRef.current].sort()).toEqual(["a", "b", "c"]);
    press("ArrowDown", { shiftKey: true }); // back to c → base{a} ∪ {c} = {a,c}
    expect([...selectionRef.current].sort()).toEqual(["a", "c"]);
  });
});

describe("selection — Ctrl+A toggles all visible", () => {
  it("from partial selection → all visible selected; group change", () => {
    const selectionRef = { current: new Set<string>(["a"]) };
    const onSelectionChange = vi.fn();
    render(<Harness items={makeItems()} selectionRef={selectionRef} onSelectionChange={onSelectionChange} />);
    focusStart("a");
    press("a", { code: "KeyA", ctrlKey: true });
    expect([...selectionRef.current].sort()).toEqual(["a", "b", "c"]);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "group", count: 3 }),
    );
  });

  it("from all-visible-selected → cleared (those rows removed)", () => {
    const selectionRef = { current: new Set<string>(["a", "b", "c"]) };
    render(<Harness items={makeItems()} selectionRef={selectionRef} />);
    focusStart("a");
    press("a", { code: "KeyA", ctrlKey: true });
    expect(selectionRef.current.size).toBe(0);
  });
});

function clickRow(id: string, init: MouseEventInit = {}) {
  fireEvent.click(stop(id, "summary"), { bubbles: true, ...init });
}

describe("selection — mouse gestures on the <ul>", () => {
  it("simple click collapses the selection to that row (single, pointer)", () => {
    const selectionRef = { current: new Set<string>(["a", "b"]) };
    const onSelectionChange = vi.fn();
    render(<Harness items={makeItems()} selectionRef={selectionRef} onSelectionChange={onSelectionChange} />);
    clickRow("c");
    expect([...selectionRef.current]).toEqual(["c"]);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "single", via: "pointer", count: 1, lastId: "c", selected: true }),
    );
  });

  it("Ctrl+Click toggles that row (single, pointer)", () => {
    const selectionRef = { current: new Set<string>(["a"]) };
    render(<Harness items={makeItems()} selectionRef={selectionRef} />);
    clickRow("b", { ctrlKey: true });
    expect([...selectionRef.current].sort()).toEqual(["a", "b"]);
  });

  it("Shift+Click spans anchor→click (group, pointer)", () => {
    const selectionRef = { current: new Set<string>() };
    const onSelectionChange = vi.fn();
    render(<Harness items={makeItems()} selectionRef={selectionRef} onSelectionChange={onSelectionChange} />);
    clickRow("a"); // anchor = a
    clickRow("c", { shiftKey: true }); // span a..c
    expect([...selectionRef.current].sort()).toEqual(["a", "b", "c"]);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "group", via: "pointer", count: 3 }),
    );
  });

  it("Shift+Click from an empty selection spans the previously-active row → click (Explorer-inclusive)", () => {
    const selectionRef = { current: new Set<string>() };
    const onSelectionChange = vi.fn();
    render(<Harness items={makeItems()} selectionRef={selectionRef} onSelectionChange={onSelectionChange} />);
    focusStart("a"); // active = a, selection ∅ (no prior click)
    clickRow("c", { shiftKey: true }); // span (prev-active a)..c
    expect([...selectionRef.current].sort()).toEqual(["a", "b", "c"]);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "group", via: "pointer", count: 3 }),
    );
  });

  it("clicks on the row's own controls do not touch the selection", () => {
    const selectionRef = { current: new Set<string>(["a"]) };
    render(<Harness items={makeItems()} selectionRef={selectionRef} />);
    fireEvent.click(stop("a", "action-play"), { bubbles: true });
    expect([...selectionRef.current]).toEqual(["a"]); // unchanged
  });
});

/* ================================================================== */
/* Trailing stop — the rules live here, not on the one screen that     */
/* currently has a footer (ADR 2026-09-03 §5).                         */
/* ================================================================== */

const trailing = (over: Partial<TrailingStop> = {}): TrailingStop => ({
  label: "Load more",
  onActivate: vi.fn(),
  exhaustedMessage: "No more results",
  ...over,
});

const trailingBtn = () => screen.getByTestId("trailing");

/**
 * Walk the cursor to the last row. `focusStart` alone only moves DOM focus —
 * the hook's active item stays where it was seeded, which is not the state any
 * of these rules are about.
 */
function goLastRow(firstId = "a") {
  focusStart(firstId);
  press("End");
}

describe("trailing stop — reaching it and leaving it", () => {
  it("Down from the last row lands on the stop, Up goes back to that row", () => {
    render(<Harness items={makeItems()} trailingStop={trailing()} />);
    focusStart("a");
    press("End");
    expectActive("c", "summary");

    press("ArrowDown");
    expect(document.activeElement).toBe(trailingBtn());

    press("ArrowUp");
    expectActive("c", "summary");
  });

  it("Down on the stop stays put — it is the last stop", () => {
    render(<Harness items={makeItems()} trailingStop={trailing()} />);
    goLastRow();
    press("ArrowDown");
    press("ArrowDown");
    expect(document.activeElement).toBe(trailingBtn());
  });

  it("Down past the last row does nothing when the list has no trailing stop", () => {
    render(<Harness items={makeItems()} />);
    goLastRow();
    press("ArrowDown");
    expectActive("c", "summary");
  });

  it("End, PageDown and Shift+ArrowDown do NOT cross the boundary", () => {
    const selectionRef = { current: new Set<string>() };
    render(<Harness items={makeItems()} selectionRef={selectionRef} trailingStop={trailing()} />);

    focusStart("a");
    press("End");
    expectActive("c", "summary"); // the last ROW, not the stop

    press("Home");
    press("PageDown");
    press("PageDown");
    press("PageDown");
    expectActive("c", "summary"); // PageDown clamps at the last row

    press("ArrowDown", { shiftKey: true });
    expectActive("c", "summary"); // and Shift-extend stops there too
  });

  it("takes the roving tabIndex=0 with it, so a native Tab lands on the stop", () => {
    render(<Harness items={makeItems()} trailingStop={trailing()} />);
    goLastRow();
    press("ArrowDown");
    expect(trailingBtn().tabIndex).toBe(0);
    expect(stop("c", "summary").tabIndex).toBe(-1);

    press("ArrowUp");
    expect(trailingBtn().tabIndex).toBe(-1);
    expect(stop("c", "summary").tabIndex).toBe(0);
  });

  it("re-entry lands on the row the cursor came from — the memory never learns the stop", () => {
    render(<Harness items={makeItems()} trailingStop={trailing()} />);
    goLastRow();
    press("ArrowDown");
    expect(document.activeElement).toBe(trailingBtn());

    act(() => (document.activeElement as HTMLElement).blur());
    fireEvent.click(screen.getByTestId("restore"));
    expectActive("c", "summary");
  });
});

describe("trailing stop — what the cursor takes with it", () => {
  /** Walk to the stop the only way that exists, then forget the trip. */
  function goToStop(extra: Partial<HarnessProps> = {}) {
    const onAction = vi.fn();
    const onParentKeyDown = vi.fn();
    render(
      <Harness
        items={makeItems()}
        onAction={onAction}
        onParentKeyDown={onParentKeyDown}
        trailingStop={trailing()}
        {...extra}
      />,
    );
    goLastRow();
    press("ArrowDown");
    onParentKeyDown.mockClear();
    return { onAction, onParentKeyDown };
  }

  const ROW_KEYS: [string, string, KeyboardEventInit][] = [
    ["Delete", "Delete", {}],
    ["F2", "F2", {}],
    ["F4", "F4", {}],
    ["F5", "F5", {}],
    ["Shift+F5", "F5", { shiftKey: true }],
    ["Ctrl+Space", " ", { code: "Space", ctrlKey: true }],
    ["Ctrl+C", "c", { code: "KeyC", ctrlKey: true }],
    ["ArrowLeft", "ArrowLeft", {}],
    ["ArrowRight", "ArrowRight", {}],
  ];

  it.each(ROW_KEYS)("%s is silent on the stop and is NOT swallowed", (_label, key, init) => {
    const selectionRef = { current: new Set<string>() };
    const { onAction, onParentKeyDown } = goToStop({ selectionRef });
    press(key, init);
    expect(onAction).not.toHaveBeenCalled();
    expect(selectionRef.current.size).toBe(0);
    expect(document.activeElement).toBe(trailingBtn()); // cursor unmoved
    // Not consumed — the key travels on to the handlers above the list.
    expect(onParentKeyDown).toHaveBeenCalled();
  });

  it("Ctrl+Space does not let the browser press the button", () => {
    goToStop();
    // fireEvent returns false when preventDefault was called. Propagation is
    // untouched (asserted above); only the native activation is suppressed.
    const notPrevented = fireEvent.keyDown(trailingBtn(), {
      key: " ", code: "Space", ctrlKey: true, bubbles: true,
    });
    expect(notPrevented).toBe(false);
  });

  it("plain Space is left alone so the button activates natively", () => {
    goToStop();
    const notPrevented = fireEvent.keyDown(trailingBtn(), {
      key: " ", code: "Space", bubbles: true,
    });
    expect(notPrevented).toBe(true);
  });

  it("Ctrl+A still selects every visible row from the stop", () => {
    const selectionRef = { current: new Set<string>() };
    goToStop({ selectionRef });
    press("a", { code: "KeyA", ctrlKey: true });
    expect([...selectionRef.current].sort()).toEqual(["a", "b", "c"]);
  });

  it("Escape still clears the selection from the stop", () => {
    const selectionRef = { current: new Set<string>(["a", "b"]) };
    goToStop({ selectionRef });
    press("Escape");
    expect(selectionRef.current.size).toBe(0);
  });

  it("Enter and Space are left to the button itself", () => {
    const { onAction } = goToStop();
    press("Enter");
    press(" ", { code: "Space" });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("Tab still exits the zone from the stop", () => {
    const onTabOut = vi.fn();
    goToStop({ onTabOut });
    press("Tab");
    expect(onTabOut).toHaveBeenCalledWith(true);
  });
});

describe("trailing stop — activation", () => {
  const rows = (n: number): CompositeListItem[] =>
    Array.from({ length: n }, (_, i) => ({ id: `r${i}`, segments: [] }));

  /**
   * A list that pages like the real one: the activation resolves first, the rows
   * arrive with it, and only then does the list decide where the cursor goes.
   * `grownTo === null` is the empty batch; `fails` is the rejected one.
   */
  function Paged({ grownTo, fails, spy }: { grownTo?: number; fails?: boolean; spy: () => void }) {
    const [count, setCount] = useState(3);
    const [exhausted, setExhausted] = useState(false);
    const items = useMemo(() => rows(count), [count]);
    const onActivate = useCallback(async () => {
      spy();
      await Promise.resolve();
      if (fails) throw new Error("network");
      if (grownTo != null) setCount(grownTo);
      // Nothing came back, so the stop stops existing — as the real store does
      // by dropping hasMore. It is gone in the very commit that resolves the
      // activation, which is why the list must settle on what it captured.
      else setExhausted(true);
    }, [grownTo, fails, spy]);
    return (
      <Harness
        items={items}
        trailingStop={
          exhausted ? undefined : { label: "Load more", onActivate, exhaustedMessage: "No more results" }
        }
      />
    );
  }

  /** Walk to the stop and press it. */
  async function activate() {
    goLastRow("r0");
    press("ArrowDown");
    expect(document.activeElement).toBe(trailingBtn());
    await act(async () => { fireEvent.click(trailingBtn()); });
  }

  it("lands on the FIRST new row after a batch arrives", async () => {
    const spy = vi.fn();
    render(<Paged grownTo={5} spy={spy} />);
    await activate();
    expect(spy).toHaveBeenCalledTimes(1);
    expectActive("r3", "summary"); // items[oldLength] — not the last row
  });

  it("a growing batch says nothing — the landed row is the answer", async () => {
    $announcer.set(null);
    render(<Paged grownTo={5} spy={vi.fn()} />);
    await activate();
    expect($announcer.get()).toBeNull();
  });

  it("an empty batch lands on the last row and says so", async () => {
    $announcer.set(null);
    render(<Paged spy={vi.fn()} />);
    await activate();
    expectActive("r2", "summary");
    expect(document.activeElement).not.toBe(document.body);
    expect($announcer.get()?.message).toBe("No more results");
    // The button is gone: its absence is the standing carrier of the same fact.
    expect(screen.queryByTestId("trailing")).toBeNull();
  });

  it("a failed batch leaves the cursor on the button and says nothing here", async () => {
    $announcer.set(null);
    render(<Paged fails spy={vi.fn()} />);
    await activate();
    expect(document.activeElement).toBe(trailingBtn());
    expect($announcer.get()).toBeNull();
  });

  it("stays focusable while busy and ignores a second activation", async () => {
    const onActivate = vi.fn(async () => {});
    render(
      <Harness
        items={rows(3)}
        trailingStop={{ label: "Loading…", busy: true, onActivate, exhaustedMessage: "No more results" }}
      />,
    );
    goLastRow("r0");
    press("ArrowDown");
    const btn = trailingBtn();
    expect(document.activeElement).toBe(btn);
    expect(btn.hasAttribute("disabled")).toBe(false); // never natively disabled
    expect(btn.getAttribute("aria-busy")).toBe("true");

    await act(async () => { fireEvent.click(btn); });
    expect(onActivate).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(btn); // focus never left
  });
});
