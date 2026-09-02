import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { createRef } from "react";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { StreamStatus } from "../../lib/tauri";
import { StatusBar } from "./StatusBar";
import { $statuses } from "../../stores/streams";
import { $freeSpace } from "../../stores/system";
import { $settings, $profileSettings } from "../../stores/settings";

const GiB = 1024 ** 3;

const recordingStatus = (startedMsAgo: number): StreamStatus => ({
  streamId: "s1",
  state: "recording",
  currentTrack: null,
  recordingStartedAt: new Date(Date.now() - startedMsAgo).toISOString(),
  bytesRecorded: 0,
  tracksRecorded: 0,
  error: null,
  reconnectAttempt: null, reconnectMaxRetries: null,
  sessionId: 0,
});

const tabIndices = (footer: HTMLElement) =>
  Array.from(footer.querySelectorAll<HTMLElement>("[tabindex]")).map((el) =>
    el.getAttribute("tabindex"),
  );

beforeEach(() => {
  $statuses.set({});
  $freeSpace.set(null);
  $settings.set(null);
  $profileSettings.set(null);
});

function renderBar() {
  const ref = createRef<ZoneEntry>();
  return render(<StatusBar ref={ref} exitZone={() => {}} />);
}

describe("StatusBar free-space segment", () => {
  it("renders a dash and unavailable aria when free space is unknown", () => {
    renderBar();
    const seg = screen.getByText("—").closest("div")!;
    expect(seg.getAttribute("aria-label")).toMatch(/not available|недоступно/i);
  });

  it("renders the formatted free space with labeled aria when known", () => {
    $freeSpace.set(5 * GiB);
    renderBar();
    const seg = screen.getByText("5.00 GB").closest("div")!;
    expect(seg.getAttribute("aria-label")).toMatch(/(free space|вільно).*5\.00 GB/i);
  });

  it("marks the segment low when below threshold", () => {
    $freeSpace.set(2 * GiB);
    $profileSettings.set({ recording: { diskSpaceThresholdGb: 5 } } as never);
    renderBar();
    const seg = screen.getByText("2.00 GB").closest("div")!;
    expect(seg.getAttribute("aria-label")).toMatch(/low|мало/i);
  });

  it("roves focus across all three segments with arrow keys", () => {
    $statuses.set({ s1: recordingStatus(60_000) });
    $freeSpace.set(5 * GiB);
    const { container } = renderBar();
    const footer = container.querySelector("footer")!;

    // recordings (0), free-space (1), longest-recording (2) all present
    expect(tabIndices(footer)).toEqual(["0", "-1", "-1"]);

    fireEvent.keyDown(footer, { key: "ArrowRight" });
    expect(tabIndices(footer)).toEqual(["-1", "0", "-1"]); // free-space active

    fireEvent.keyDown(footer, { key: "ArrowRight" });
    expect(tabIndices(footer)).toEqual(["-1", "-1", "0"]); // longest-recording active
  });

  it("resets roving focus to the first segment when the last segment unmounts", () => {
    $statuses.set({ s1: recordingStatus(60_000) });
    $freeSpace.set(5 * GiB);
    const { container } = renderBar();
    const footer = container.querySelector("footer")!;

    fireEvent.keyDown(footer, { key: "End" });
    expect(tabIndices(footer)).toEqual(["-1", "-1", "0"]); // on the conditional last segment

    // Recording stops → longest-recording segment unmounts, focus must not be lost
    act(() => {
      $statuses.set({ s1: { ...recordingStatus(0), state: "idle", recordingStartedAt: null } });
    });
    expect(tabIndices(footer)).toEqual(["0", "-1"]); // back to first, no orphaned tabIndex
  });
});

describe("StatusBar — scoped application role", () => {
  it("keeps the contentinfo landmark and nests an application wrapper", () => {
    const { container } = renderBar();
    const footer = container.querySelector("footer")!;
    // Implicit contentinfo landmark must NOT be overridden.
    expect(footer.getAttribute("role")).toBeNull();
    const app = footer.querySelector('[role="application"]')!;
    expect(app).toBeTruthy();
    expect(app.getAttribute("aria-label")).toBeTruthy();
    // Roving segments live inside the wrapper.
    expect(app.querySelectorAll("[tabindex]").length).toBeGreaterThan(0);
  });
});
