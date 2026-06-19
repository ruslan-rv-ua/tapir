import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
import * as tauri from "../../lib/tauri";
import { $commandPaletteOpen } from "../../stores/navigation";
import { $streams, $statuses, $streamSelection, replaceSelection, $exportStreamsRequest } from "../../stores/streams";
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
  replaceSelection(new Set());
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

describe("CommandPalette — whole-profile regardless of selection (R7)", () => {
  it("record-all/stop-all call the whole-profile path even with a selection", async () => {
    replaceSelection(new Set(["a", "b"]));
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.click(screen.getByText(/^записати все$|^record all$/i));
    });
    expect(tauri.startAllRecordings).toHaveBeenCalledWith(); // no ids = whole profile
  });

  it("export command opens a whole-profile request (ids: null)", () => {
    $streams.set([{ id: "a", name: "Alpha" } as never]); // export command only shows when streams exist
    replaceSelection(new Set(["a"]));
    render(<CommandPalette />);
    // Command label is `streams_export_action`: "Експортувати потоки…" / "Export streams…".
    fireEvent.click(screen.getByText(/експортувати потоки|export streams/i));
    expect($exportStreamsRequest.get()).toEqual({ ids: null });
  });
});
