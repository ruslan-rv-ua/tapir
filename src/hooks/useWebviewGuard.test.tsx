import { useEffect, useRef, type ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useWebviewGuard } from "./useWebviewGuard";

function Harness({ children }: { children?: ReactNode }) {
  useWebviewGuard();
  return <>{children}</>;
}

/** The common case: the guard mounted over one focusable control. */
function renderWithButton(): HTMLElement {
  render(
    <Harness>
      <button data-testid="btn" />
    </Harness>,
  );
  return screen.getByTestId("btn");
}

/**
 * Swallows keydown and contextmenu in the BUBBLE phase — react-aria controls
 * (notably `SearchField`) do exactly this, which is why the global layers listen
 * in the capture phase. A window listener registered WITHOUT `{ capture: true }`
 * would never see an event dispatched under here, so this component is what
 * pins the guard's phase: drop `capture` from the hook and these tests go red.
 */
function Swallowing({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener("keydown", stop);
    el.addEventListener("contextmenu", stop);
    return () => {
      el.removeEventListener("keydown", stop);
      el.removeEventListener("contextmenu", stop);
    };
  }, []);
  return <div ref={ref}>{children}</div>;
}

/**
 * A node with a native BUBBLE-phase keydown listener — stands in for every
 * downstream handler in the app (row keys, KeyRecorder). The guard captures at
 * the window, so if it ever added `stopPropagation()` this listener would stop
 * seeing the event; that is the regression this file exists to catch.
 */
function Downstream({ received }: { received: KeyboardEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const on = (e: Event) => received.push(e as KeyboardEvent);
    el.addEventListener("keydown", on);
    return () => el.removeEventListener("keydown", on);
  }, [received]);
  return (
    <div data-testid="downstream" ref={ref}>
      <button data-testid="btn" />
    </div>
  );
}

/** Dispatches a real (bubbling, cancelable) event and hands it back for inspection. */
function pressKey(target: Element, init: KeyboardEventInit): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

function openContextMenu(target: Element): MouseEvent {
  const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

describe("useWebviewGuard — keydown", () => {
  it.each([
    ["F5", { code: "F5" }],
    ["Ctrl+F5", { code: "F5", ctrlKey: true }],
    ["Shift+F5", { code: "F5", shiftKey: true }],
    ["Ctrl+Shift+F5", { code: "F5", ctrlKey: true, shiftKey: true }],
    ["Ctrl+R", { code: "KeyR", ctrlKey: true }],
    ["Ctrl+Shift+R", { code: "KeyR", ctrlKey: true, shiftKey: true }],
    ["Meta+R", { code: "KeyR", metaKey: true }],
  ])("suppresses the reload family: %s", (_label, init) => {
    expect(pressKey(renderWithButton(), init).defaultPrevented).toBe(true);
  });

  it.each([["F3"], ["F7"], ["F11"]])(
    "suppresses the browser function key %s",
    (code) => {
      expect(pressKey(renderWithButton(), { code }).defaultPrevented).toBe(true);
    },
  );

  // Find bar: the app takes Ctrl+F for its own "focus the screen's search",
  // so WebView2's find bar must never open — including from inside a dialog,
  // where the Tier-2 dispatcher bails out on isInModal() and cannot consume it.
  it.each([
    ["Ctrl+F", { code: "KeyF", ctrlKey: true }],
    ["Meta+F", { code: "KeyF", metaKey: true }],
    ["Ctrl+Shift+F", { code: "KeyF", ctrlKey: true, shiftKey: true }],
  ])("suppresses the find bar: %s", (_label, init) => {
    expect(pressKey(renderWithButton(), init).defaultPrevented).toBe(true);
  });

  it("suppresses Ctrl+F with focus inside an open dialog, where Tier 2 bails out", () => {
    render(
      <Harness>
        <div role="dialog">
          <button data-testid="btn" />
        </div>
      </Harness>,
    );
    act(() => screen.getByTestId("btn").focus());
    expect(
      pressKey(screen.getByTestId("btn"), { code: "KeyF", ctrlKey: true }).defaultPrevented,
    ).toBe(true);
  });

  it.each([
    ["Ctrl+Plus", { code: "Equal", ctrlKey: true }],
    ["Ctrl+NumpadAdd", { code: "NumpadAdd", ctrlKey: true }],
    ["Ctrl+Minus", { code: "Minus", ctrlKey: true }],
    ["Ctrl+0", { code: "Digit0", ctrlKey: true }],
    ["Alt+F4", { code: "F4", altKey: true }],
    ["bare R", { code: "KeyR" }],
    ["Alt+R", { code: "KeyR", altKey: true }],
    ["Ctrl+Alt+R (AltGr)", { code: "KeyR", ctrlKey: true, altKey: true }],
    ["bare F", { code: "KeyF" }],
    ["Alt+F", { code: "KeyF", altKey: true }],
    ["Ctrl+Alt+F (AltGr)", { code: "KeyF", ctrlKey: true, altKey: true }],
    ["Ctrl+K", { code: "KeyK", ctrlKey: true }],
    ["Alt+1", { code: "Digit1", altKey: true }],
  ])("leaves %s alone", (_label, init) => {
    expect(pressKey(renderWithButton(), init).defaultPrevented).toBe(false);
  });

  it("suppresses auto-repeat too — a held F5 must not slip through once", () => {
    expect(
      pressKey(renderWithButton(), { code: "F5", repeat: true }).defaultPrevented,
    ).toBe(true);
  });

  it("suppresses F5 with focus inside an open dialog (no isInModal gate)", () => {
    render(
      <Harness>
        <div role="dialog">
          <button data-testid="btn" />
        </div>
      </Harness>,
    );
    // Focus really has to be in the dialog: `isInModal()` reads
    // `document.activeElement`, so an unfocused dialog would pass even if the
    // guard did gate on it.
    act(() => screen.getByTestId("btn").focus());
    expect(pressKey(screen.getByTestId("btn"), { code: "F5" }).defaultPrevented).toBe(true);
  });

  it("wins from the capture phase — a bubbling swallower cannot hide F5 from it", () => {
    render(
      <Harness>
        <Swallowing>
          <button data-testid="btn" />
        </Swallowing>
      </Harness>,
    );
    expect(pressKey(screen.getByTestId("btn"), { code: "F5" }).defaultPrevented).toBe(true);
  });

  it("never stops propagation — downstream handlers still receive the suppressed key", () => {
    const received: KeyboardEvent[] = [];
    render(
      <Harness>
        <Downstream received={received} />
      </Harness>,
    );
    const e = pressKey(screen.getByTestId("btn"), { code: "F5" });
    expect(received).toEqual([e]);
    expect(received[0].defaultPrevented).toBe(true);
  });
});

describe("useWebviewGuard — contextmenu", () => {
  it("suppresses the native menu on the document body", () => {
    render(<Harness />);
    expect(openContextMenu(document.body).defaultPrevented).toBe(true);
  });

  it("suppresses the native menu on a button", () => {
    expect(openContextMenu(renderWithButton()).defaultPrevented).toBe(true);
  });

  it("wins from the capture phase here too — a bubbling swallower cannot hide it", () => {
    render(
      <Harness>
        <Swallowing>
          <button data-testid="btn" />
        </Swallowing>
      </Harness>,
    );
    expect(openContextMenu(screen.getByTestId("btn")).defaultPrevented).toBe(true);
  });

  it("suppresses the native menu on a slider thumb (input type=range)", () => {
    render(
      <Harness>
        <input type="range" data-testid="slider" />
      </Harness>,
    );
    expect(openContextMenu(screen.getByTestId("slider")).defaultPrevented).toBe(true);
  });

  it.each([["text"], ["search"]])(
    "keeps the native menu on <input type=%s>",
    (type) => {
      render(
        <Harness>
          <input type={type} data-testid="field" />
        </Harness>,
      );
      expect(openContextMenu(screen.getByTestId("field")).defaultPrevented).toBe(false);
    },
  );

  it("keeps the native menu on <textarea>", () => {
    render(
      <Harness>
        <textarea data-testid="field" />
      </Harness>,
    );
    expect(openContextMenu(screen.getByTestId("field")).defaultPrevented).toBe(false);
  });

  it("keeps the native menu on a node nested inside a contentEditable host", () => {
    render(
      <Harness>
        <div data-testid="host">
          <span data-testid="nested">text</span>
        </div>
      </Harness>,
    );
    // jsdom does not derive `isContentEditable` from the attribute — stub it on the
    // host, exactly as shortcutGuard.test.ts does, so the ancestor walk is exercised.
    Object.defineProperty(screen.getByTestId("host"), "isContentEditable", { value: true });
    expect(openContextMenu(screen.getByTestId("nested")).defaultPrevented).toBe(false);
  });
});

describe("useWebviewGuard — teardown", () => {
  it("stops suppressing anything after unmount", () => {
    const { unmount } = render(
      <Harness>
        <button data-testid="btn" />
      </Harness>,
    );
    const btn = screen.getByTestId("btn");
    unmount();
    expect(pressKey(btn, { code: "F5" }).defaultPrevented).toBe(false);
    expect(openContextMenu(document.body).defaultPrevented).toBe(false);
  });
});
