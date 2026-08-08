import { describe, it, expect, afterEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { LiveAnnouncer } from "./LiveAnnouncer";
import { $announcer } from "../../stores/announcer";

function announce(message: string, priority: "polite" | "assertive" = "polite") {
  act(() => { $announcer.set({ message, priority }); });
}

function messages(container: HTMLElement, priority: "polite" | "assertive") {
  const region = container.querySelector(`[aria-live="${priority}"]`)!;
  return [...region.children].map((c) => c.textContent);
}

afterEach(() => { $announcer.set(null); });

describe("LiveAnnouncer", () => {
  it("marks both live regions with data-live-announcer so react-aria modals do not aria-hide them", () => {
    const { container } = render(<LiveAnnouncer />);
    const polite = container.querySelector('[aria-live="polite"]');
    const assertive = container.querySelector('[aria-live="assertive"]');
    expect(polite).toHaveAttribute("data-live-announcer", "true");
    expect(assertive).toHaveAttribute("data-live-announcer", "true");
  });

  it("logs additions only — a message is a new child, never a text swap", () => {
    const { container } = render(<LiveAnnouncer />);
    const polite = container.querySelector('[aria-live="polite"]')!;
    expect(polite).toHaveAttribute("role", "log");
    expect(polite).toHaveAttribute("aria-relevant", "additions");
    // aria-atomic would make every announcement re-read the whole log.
    expect(polite).not.toHaveAttribute("aria-atomic");
  });

  it("repeats an identical message as a second node — the autosave silence", () => {
    const { container } = render(<LiveAnnouncer />);
    announce("Налаштування збережено: Default");
    announce("Налаштування збережено: Default");
    // Two additions, not one node whose text was rewritten to the same string:
    // that rewrite is what browsers batch away and NVDA never reports.
    expect(messages(container, "polite")).toEqual([
      "Налаштування збережено: Default",
      "Налаштування збережено: Default",
    ]);
  });

  it("routes by priority", () => {
    const { container } = render(<LiveAnnouncer />);
    announce("ввічливо", "polite");
    announce("наполегливо", "assertive");
    expect(messages(container, "polite")).toEqual(["ввічливо"]);
    expect(messages(container, "assertive")).toEqual(["наполегливо"]);
  });

  it("drops a message from the log once it has had time to be read", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<LiveAnnouncer />);
      announce("минуще");
      expect(messages(container, "polite")).toEqual(["минуще"]);
      act(() => { vi.advanceTimersByTime(7000); });
      expect(messages(container, "polite")).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
