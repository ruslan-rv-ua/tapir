import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { StatusBar } from "./StatusBar";
import { $statuses } from "../../stores/streams";
import { $freeSpace } from "../../stores/system";
import { $settings } from "../../stores/settings";

const GiB = 1024 ** 3;

beforeEach(() => {
  $statuses.set({});
  $freeSpace.set(null);
  $settings.set(null);
});

function renderBar() {
  const ref = createRef<ZoneEntry>();
  return render(<StatusBar ref={ref} exitZone={() => {}} />);
}

describe("StatusBar free-space segment", () => {
  it("renders a dash when free space is unknown", () => {
    renderBar();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the formatted free space when known", () => {
    $freeSpace.set(5 * GiB);
    renderBar();
    expect(screen.getByText("5.00 GB")).toBeInTheDocument();
  });

  it("marks the segment low when below threshold", () => {
    $freeSpace.set(2 * GiB);
    $settings.set({ diskSpaceThresholdGb: 5 } as never);
    renderBar();
    const seg = screen.getByText("2.00 GB").closest("div")!;
    expect(seg.getAttribute("aria-label")).toMatch(/low|мало/i);
  });
});
