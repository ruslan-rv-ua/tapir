import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
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
  return render(<ActivityBar ref={ref} exitZone={() => {}} />);
}

const navButtonTabIndices = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLButtonElement>("button")).map((b) =>
    b.getAttribute("tabindex"),
  );

describe("ActivityBar — scoped application role", () => {
  it("keeps the navigation landmark and nests an application wrapper", () => {
    const { container } = renderBar();
    const nav = container.querySelector("nav")!;
    // Implicit navigation landmark must NOT be overridden by an explicit role.
    expect(nav.getAttribute("role")).toBeNull();
    const app = nav.querySelector('[role="application"]')!;
    expect(app).toBeTruthy();
    expect(app.getAttribute("aria-label")).toBeTruthy();
    // All focusable buttons live inside the application wrapper.
    expect(app.querySelectorAll("button").length).toBeGreaterThan(0);
    expect(nav.querySelectorAll('[role="application"] button').length).toBe(
      nav.querySelectorAll("button").length,
    );
  });

  it("roving arrows still drive focus (keydown bubbles through the wrapper)", () => {
    const { container } = renderBar();
    const nav = container.querySelector("nav")!;
    expect(navButtonTabIndices(nav)[0]).toBe("0");
    fireEvent.keyDown(nav, { key: "ArrowDown" });
    // Active roving tabindex moves off the first button.
    expect(navButtonTabIndices(nav)[0]).toBe("-1");
  });
});

describe("ActivityBar profile button (added in Task 16)", () => {
  it("renders profile area as a button (not a passive div)", () => {
    const { container } = renderBar();
    const allButtons = container.querySelectorAll("button");
    // ActivityBar should have: 5 nav buttons + 1 settings button + 1 profile button = 7
    expect(allButtons.length).toBe(7);
    // The last button is the profile button — must have aria-label with profile name
    const profileBtn = allButtons[allButtons.length - 1];
    expect(profileBtn.getAttribute("aria-label")).toMatch(/default/i);
  });

  it("profile button is wired into roving tabindex (reachable by arrow keys)", () => {
    const { container } = renderBar();
    const nav = container.querySelector("nav")!;
    // Navigate down 6 times from the first button to reach the profile button (index 6)
    for (let i = 0; i < 6; i++) {
      fireEvent.keyDown(nav, { key: "ArrowDown" });
    }
    // Profile button (last, index 6) must now be the active roving item
    const allTabIndices = Array.from(
      nav.querySelectorAll<HTMLButtonElement>("button"),
    ).map((b) => b.getAttribute("tabindex"));
    expect(allTabIndices[6]).toBe("0");
    // Verify all other buttons are out of tab order
    allTabIndices.slice(0, 6).forEach((ti) => expect(ti).toBe("-1"));
  });
});
