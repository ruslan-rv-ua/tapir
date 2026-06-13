import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { createRef } from "react";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { ActivityBar } from "./ActivityBar";
import { $activeSection } from "../../stores/navigation";
import { $settings } from "../../stores/settings";

beforeEach(() => {
  $activeSection.set("streams");
  $settings.set(null);
});

function renderBar() {
  const ref = createRef<ZoneEntry>();
  const utils = render(<ActivityBar ref={ref} exitZone={() => {}} />);
  return { ...utils, ref };
}

const tabIndices = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLButtonElement>("button")).map((b) =>
    b.getAttribute("tabindex"),
  );

describe("ActivityBar — structure", () => {
  it("keeps the navigation landmark and nests an application wrapper", () => {
    const { container } = renderBar();
    const nav = container.querySelector("nav")!;
    expect(nav.getAttribute("role")).toBeNull();
    const app = nav.querySelector('[role="application"]')!;
    expect(app).toBeTruthy();
    expect(nav.querySelectorAll('[role="application"] button').length).toBe(
      nav.querySelectorAll("button").length,
    );
  });

  it("renders 7 buttons with the profile button first", () => {
    const { container } = renderBar();
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(7);
    // Profile button is first and carries the active profile name in its label.
    expect(buttons[0].getAttribute("aria-label")).toMatch(/default/i);
  });

  it("renders a separator under the profile button", () => {
    const { container } = renderBar();
    expect(container.querySelector('[role="separator"]')).toBeTruthy();
  });

  it("marks no section button disabled (Schedule shipped in Phase 3D)", () => {
    const { container } = renderBar();
    const disabled = Array.from(container.querySelectorAll("button")).find((b) =>
      b.getAttribute("aria-disabled") === "true",
    );
    expect(disabled).toBeUndefined();
  });
});

describe("ActivityBar — profile section behaviour", () => {
  it("sets aria-pressed on the profile button when profiles is active", () => {
    $activeSection.set("profiles");
    const { container } = renderBar();
    const profileBtn = container.querySelectorAll("button")[0];
    expect(profileBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("switches activeSection to profiles when the profile button is pressed", () => {
    const { container } = renderBar();
    const profileBtn = container.querySelectorAll("button")[0];
    fireEvent.click(profileBtn);
    expect($activeSection.get()).toBe("profiles");
  });

  it("profile button is the first roving item (tabindex 0 at start)", () => {
    const { container } = renderBar();
    const nav = container.querySelector("nav")!;
    expect(tabIndices(nav)[0]).toBe("0");
  });
});

describe("ActivityBar — launch focus (P3)", () => {
  it("focuses the active section button on zone entry, not the first item", () => {
    $activeSection.set("browser"); // index 2 (profile=0, streams=1, browser=2)
    const { container, ref } = renderBar();
    act(() => ref.current!.focus("forward"));
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    expect(document.activeElement).toBe(buttons[2]);
  });

  it("re-focuses the active section button on re-entry, even when the roving index is unchanged", () => {
    // streams active → activeNavIndex = 1. Regression test for Shift+Tab back to
    // the nav: the first entry sets the roving index to 1; on re-entry the target
    // index already equals the roving index, so the state-change-driven focus
    // effect bails. Focus must still land on the section button, not be swallowed.
    $activeSection.set("streams");
    const { container, ref } = renderBar();
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");

    act(() => ref.current!.focus("forward"));
    expect(document.activeElement).toBe(buttons[1]);

    // Simulate Tab into another zone — DOM focus leaves the bar without changing
    // the roving index.
    act(() => buttons[3].focus());
    expect(document.activeElement).toBe(buttons[3]);

    // Shift+Tab back into the nav re-enters at the same active-section index.
    act(() => ref.current!.focus("backward"));
    expect(document.activeElement).toBe(buttons[1]);
  });
});
