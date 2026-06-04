import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
import * as tauri from "../../lib/tauri";
import { $commandPaletteOpen } from "../../stores/navigation";
import { $streams, $statuses } from "../../stores/streams";
import { CommandPalette } from "./CommandPalette";

// No backend in jsdom — stub the Tauri IPC layer.
vi.mock("../../lib/tauri", () => ({
  startAllRecordings: vi.fn().mockResolvedValue(0),
  stopAllRecordings: vi.fn().mockResolvedValue(undefined),
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
  $streams.set([]);
  $statuses.set({});
  $commandPaletteOpen.set(true);
});

describe("CommandPalette — record all", () => {
  it("offers a Record-all command", () => {
    render(<CommandPalette />);
    expect(screen.getByText(/^записати все$|^record all$/i)).toBeTruthy();
  });

  it("calls startAllRecordings when the Record-all command is chosen", async () => {
    render(<CommandPalette />);
    const option = screen.getByText(/^записати все$|^record all$/i);
    await act(async () => {
      fireEvent.click(option);
    });
    expect(tauri.startAllRecordings).toHaveBeenCalledOnce();
  });
});
