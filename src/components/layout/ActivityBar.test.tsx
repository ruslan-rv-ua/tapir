import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { createRef } from "react";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { ActivityBar } from "./ActivityBar";
import { $activeSection, $helpOpen } from "../../stores/navigation";
import { $settings } from "../../stores/settings";
import * as m from "../../i18n/paraglide/messages";

beforeEach(() => {
  $activeSection.set("streams");
  $settings.set(null);
  $helpOpen.set(false);
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

  it("renders 8 buttons with the profile button first", () => {
    const { container } = renderBar();
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(8);
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

describe("ActivityBar — help button", () => {
  const helpButton = (root: HTMLElement) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.getAttribute("aria-label") === m.help_title(),
    )!;

  it("renders a labelled help button in the footer, above Settings", () => {
    const { container } = renderBar();
    const buttons = Array.from(container.querySelectorAll("button"));
    const help = helpButton(container);
    expect(help).toBeTruthy();
    // Footer order: Help then Settings (Settings stays last).
    expect(buttons.indexOf(help)).toBe(buttons.length - 2);
    expect(buttons[buttons.length - 1].getAttribute("aria-label")).toBe(
      m.settings_title(),
    );
  });

  it("opens the help dialog when pressed", () => {
    const { container } = renderBar();
    fireEvent.click(helpButton(container));
    expect($helpOpen.get()).toBe(true);
  });

  it("joins the roving-focus order between the sections and Settings", () => {
    const { container, ref } = renderBar();
    const nav = container.querySelector("nav")!;
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
    const help = helpButton(container);

    act(() => ref.current!.focus("forward"));
    // End lands on the last roving item (Settings); ArrowUp from there is Help.
    fireEvent.keyDown(nav, { key: "End" });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    fireEvent.keyDown(nav, { key: "ArrowUp" });
    expect(document.activeElement).toBe(help);
    expect(help.getAttribute("tabindex")).toBe("0");
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
