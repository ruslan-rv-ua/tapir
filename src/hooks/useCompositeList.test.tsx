import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, act, screen } from "@testing-library/react";
import {
  useCompositeList,
  type CompositeListItem,
  type SegmentKind,
  type ActionType,
  type ActionModifiers,
  type SelectionChange,
} from "./useCompositeList";

/* ------------------------------------------------------------------ */
/* Test harness — mirrors the real list DOM:                          */
/*   <li> is the 'summary' (whole-row) focus stop;                    */
/*   info segments are role="group" divs; 'action-*' are <button>s.   */
/* ------------------------------------------------------------------ */

interface HarnessProps {
  items: CompositeListItem[];
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
}

function Harness({
  items,
  onTabOut = () => {},
  onAction = () => {},
  onEmpty,
  onButtonClick,
  onParentKeyDown,
  selectionRef,
  onSelectionChange,
}: HarnessProps) {
  const selection = selectionRef
    ? {
        current: () => selectionRef.current as ReadonlySet<string>,
        replace: (next: ReadonlySet<string>) => {
          selectionRef.current = new Set(next);
        },
      }
    : undefined;

  const { listRef, onKeyDownCapture, onContextMenu, onClick, isFocused, restoreFocus } = useCompositeList({
    zoneId: "test",
    items,
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

/** Fire a keydown on the currently focused list element (falls back to the ul). */
function press(key: string, init: KeyboardEventInit = {}) {
  const ae = document.activeElement as HTMLElement | null;
  const target = ae && list().contains(ae) ? ae : list();
  fireEvent.keyDown(target, { key, bubbles: true, ...init });
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

const noMods: ActionModifiers = { shift: false, ctrl: false };

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

  it("passes Shift/Ctrl modifiers to onAction for Enter and Space", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");

    press("Enter", { shiftKey: true });
    expect(onAction).toHaveBeenLastCalledWith("primary", "a", "summary", {
      shift: true,
      ctrl: false,
    });

    press("Enter", { ctrlKey: true });
    expect(onAction).toHaveBeenLastCalledWith("primary", "a", "summary", {
      shift: false,
      ctrl: true,
    });

    press(" ", { shiftKey: true });
    expect(onAction).toHaveBeenLastCalledWith("toggle", "a", "summary", {
      shift: true,
      ctrl: false,
    });
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

  it("Ctrl+C fires copy for the active row", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");
    press("c", { code: "KeyC", ctrlKey: true });
    expect(onAction).toHaveBeenCalledWith("copy", "a", "summary", { shift: false, ctrl: true });
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
