import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LiveAnnouncer } from "./LiveAnnouncer";

describe("LiveAnnouncer", () => {
  it("marks both live regions with data-live-announcer so react-aria modals do not aria-hide them", () => {
    const { container } = render(<LiveAnnouncer />);
    const polite = container.querySelector('[aria-live="polite"]');
    const assertive = container.querySelector('[aria-live="assertive"]');
    expect(polite).toHaveAttribute("data-live-announcer", "true");
    expect(assertive).toHaveAttribute("data-live-announcer", "true");
  });
});
