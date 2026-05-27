import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { StreamItem } from "./StreamItem";

// Stub the Tauri IPC layer — there is no backend in jsdom.
vi.mock("../../lib/tauri", () => ({
  playStream: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue(undefined),
  addToWishlist: vi.fn().mockResolvedValue(undefined),
  addToIgnorelist: vi.fn().mockResolvedValue(undefined),
}));

const mkStream = (over: Partial<StreamInfo> = {}): StreamInfo => ({
  id: "s1",
  url: "http://x/s1",
  name: "Radio Paradise",
  format: "mp3",
  bitrate: 192,
  icyName: null,
  icyGenre: null,
  icyUrl: null,
  ignorelist: [],
  username: null,
  password: null,
  addedAt: "2026-01-01T00:00:00Z",
  ...over,
});

function renderItem(stream = mkStream(), status?: StreamStatus, focusedSeg = "summary") {
  return render(
    <ul>
      <StreamItem
        stream={stream}
        status={status}
        isActiveRow
        isFocused={(seg) => seg === focusedSeg}
        onPrimaryAction={() => {}}
        onContextMenu={() => {}}
        onDelete={() => {}}
      />
    </ul>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("StreamItem — accessibility structure", () => {
  it("exposes the row as a listitem named after the stream and described as a stream (no bare 'section')", () => {
    const { container } = renderItem();
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]');
    expect(li).toBeTruthy();
    expect(li!.getAttribute("aria-label")).toContain("Radio Paradise");
    expect(li!.getAttribute("aria-roledescription")).toMatch(/потік|stream/i);
    // The <li> itself is the focus stop (tabIndex 0 while summary is active).
    expect(li!.tabIndex).toBe(0);
  });

  it("renders info cells as role=group with a roledescription and a value-only label", () => {
    const { container } = renderItem();
    const tech = container.querySelector('[data-segment="tech"]')!;
    expect(tech.getAttribute("role")).toBe("group");
    expect(tech.getAttribute("aria-roledescription")).toMatch(/техн|tech/i);
    // Value only — the segment type lives in aria-roledescription, not the label.
    expect(tech.getAttribute("aria-label")).toMatch(/192/);
  });

  it("renders each action as its own button focus stop", () => {
    const { container } = renderItem();
    const segs = Array.from(container.querySelectorAll("button[data-segment]")).map((b) =>
      b.getAttribute("data-segment"),
    );
    expect(segs).toEqual(
      expect.arrayContaining(["action-play", "action-record", "action-menu"]),
    );
  });
});

describe("StreamItem — action buttons activate Tauri commands", () => {
  it("Play starts playback for the stream", () => {
    const { container } = renderItem();
    fireEvent.click(container.querySelector('button[data-segment="action-play"]')!);
    expect(tauri.playStream).toHaveBeenCalledWith("s1");
  });

  it("Record starts recording for an idle stream", () => {
    const { container } = renderItem();
    fireEvent.click(container.querySelector('button[data-segment="action-record"]')!);
    expect(tauri.startRecording).toHaveBeenCalledWith("s1");
  });
});
