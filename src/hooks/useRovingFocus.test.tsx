import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useMemo, useRef } from "react";
import { useRovingFocus } from "./useRovingFocus";

/**
 * Toolbar-like harness mirroring the Streams actions zone: an enabled button,
 * an optionally-disabled button in the middle, and trailing buttons. The middle
 * button reproduces the "Зупинити все" control, which is natively `disabled`
 * when nothing is recording.
 */
function Toolbar({
  middleDisabled,
  middleAriaDisabled,
}: {
  middleDisabled?: boolean;
  middleAriaDisabled?: boolean;
}) {
  const r0 = useRef<HTMLButtonElement | null>(null);
  const r1 = useRef<HTMLButtonElement | null>(null);
  const r2 = useRef<HTMLButtonElement | null>(null);
  const r3 = useRef<HTMLButtonElement | null>(null);
  const refs = useMemo(() => [r0, r1, r2, r3], []);
  const { onKeyDown, getTabIndex } = useRovingFocus(refs, "horizontal", {
    mode: "mixed-boundary-handoff",
    onTabBoundary: () => {},
  });
  return (
    <div role="application" onKeyDown={onKeyDown}>
      <button ref={r0} tabIndex={getTabIndex(0)}>add</button>
      <button
        ref={r1}
        tabIndex={getTabIndex(1)}
        disabled={middleDisabled}
        aria-disabled={middleAriaDisabled}
      >
        stop-all
      </button>
      <button ref={r2} tabIndex={getTabIndex(2)}>chip-all</button>
      <button ref={r3} tabIndex={getTabIndex(3)}>chip-errors</button>
    </div>
  );
}

const buttons = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLButtonElement>("button"));

describe("useRovingFocus — native disabled skipping", () => {
  it("ArrowRight skips a native-disabled element instead of landing silently on it", () => {
    const { container } = render(<Toolbar middleDisabled />);
    const [add, , chipAll] = buttons(container);
    add.focus();

    fireEvent.keyDown(container.querySelector('[role="application"]')!, { key: "ArrowRight" });

    // Skips the disabled stop-all (index 1) and lands on chip-all (index 2).
    expect(document.activeElement).toBe(chipAll);
    expect(chipAll.getAttribute("tabindex")).toBe("0");
  });

  it("ArrowLeft skips a native-disabled element on the way back", () => {
    const { container } = render(<Toolbar middleDisabled />);
    const [add, , chipAll] = buttons(container);
    chipAll.focus();
    // Sync the roving index to chip-all first.
    fireEvent.keyDown(container.querySelector('[role="application"]')!, { key: "Home" });
    add.focus();
    fireEvent.keyDown(container.querySelector('[role="application"]')!, { key: "ArrowRight" });
    fireEvent.keyDown(container.querySelector('[role="application"]')!, { key: "ArrowLeft" });

    expect(document.activeElement).toBe(add);
  });

  it("Home lands on the first focusable element", () => {
    const { container } = render(<Toolbar middleDisabled />);
    const [add, , chipAll] = buttons(container);
    const app = container.querySelector('[role="application"]')!;
    // Move off index 0 first (Home is a no-op when already at the target index).
    add.focus();
    fireEvent.keyDown(app, { key: "ArrowRight" });
    expect(document.activeElement).toBe(chipAll);
    fireEvent.keyDown(app, { key: "Home" });
    expect(document.activeElement).toBe(add);
  });

  it("does NOT skip an aria-disabled element (stays discoverable)", () => {
    const { container } = render(<Toolbar middleAriaDisabled />);
    const [add, stopAll] = buttons(container);
    add.focus();
    fireEvent.keyDown(container.querySelector('[role="application"]')!, { key: "ArrowRight" });

    // aria-disabled is still focusable and must remain reachable (FRD §7.2.3).
    expect(document.activeElement).toBe(stopAll);
  });

  it("leaves focus in place when every element in the travel direction is disabled", () => {
    // Only the last button enabled; from it ArrowRight has nowhere to go.
    const { container } = render(<Toolbar middleDisabled />);
    const [, , , chipErrors] = buttons(container);
    chipErrors.focus();
    fireEvent.keyDown(container.querySelector('[role="application"]')!, { key: "End" });
    expect(document.activeElement).toBe(chipErrors);
    fireEvent.keyDown(container.querySelector('[role="application"]')!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(chipErrors);
  });
});
