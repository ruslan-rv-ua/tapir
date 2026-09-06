import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
import * as tauri from "../../lib/tauri";
import { $commandPaletteOpen } from "../../stores/navigation";
import { $streams, $statuses, replaceSelection, $exportStreamsRequest } from "../../stores/streams";
import { $announcer } from "../../stores/announcer";
import * as m from "../../i18n/paraglide/messages";
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
  $announcer.set(null);
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

describe("CommandPalette — the per-stream record command while the recording is only connecting", () => {
  // The palette is read as a list, so a wrong label lies there no less than
  // on the row: a recording exists from the start command on.
  const phase = (state: "connecting" | "reconnecting") => ({
    streamId: "a", state, currentTrack: null, recordingStartedAt: null,
    bytesRecorded: 0, tracksRecorded: 0, error: null,
    reconnectAttempt: state === "reconnecting" ? 1 : null,
    reconnectMaxRetries: state === "reconnecting" ? 10 : null,
    sessionId: 0,
  });

  it.each(["connecting", "reconnecting"] as const)(
    "offers «Зупинити запис» for a stream that is %s, and stops it",
    async (state) => {
      $streams.set([{ id: "a", name: "Alpha" } as never]);
      $statuses.set({ a: phase(state) });
      render(<CommandPalette />);
      // Narrow to this stream's commands: «Зупинити запис» is also the label of
      // the whole-profile stop command.
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "Alpha" } });
      expect(screen.queryByText(m.start_recording())).toBeNull();
      await act(async () => {
        fireEvent.click(screen.getByText(m.stop_recording()));
      });
      expect(tauri.stopRecording).toHaveBeenCalledWith("a");
      expect(tauri.startRecording).not.toHaveBeenCalled();
    },
  );
});

describe("CommandPalette — a11y: empty state & results count", () => {
  it("renders the localized empty-state string (not a hardcoded literal)", () => {
    render(<CommandPalette />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "zzzzznomatch" } });
    // Tests run under the `uk` base locale, so this is "Нічого не знайдено".
    expect(screen.getByText(m.palette_no_results())).toBeTruthy();
  });

  it("announces the result count after a 300ms debounce", () => {
    vi.useFakeTimers();
    try {
      render(<CommandPalette />);
      const input = screen.getByRole("combobox");
      act(() => {
        fireEvent.change(input, { target: { value: "record" } });
      });
      // Nothing announced before the debounce elapses.
      expect($announcer.get()).toBeNull();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      const msg = $announcer.get();
      expect(msg?.priority).toBe("polite");
      // Polite announcement carries the current match count (a number).
      expect(msg?.message).toMatch(/\d+/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("announces zero for the empty result set", () => {
    vi.useFakeTimers();
    try {
      render(<CommandPalette />);
      const input = screen.getByRole("combobox");
      act(() => {
        fireEvent.change(input, { target: { value: "zzzzznomatch" } });
        vi.advanceTimersByTime(300);
      });
      expect($announcer.get()?.message).toMatch(/\b0\b/);
    } finally {
      vi.useRealTimers();
    }
  });
});
