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
