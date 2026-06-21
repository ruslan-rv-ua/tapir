import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportFormatDialog } from "./ExportFormatDialog";
import { $exportStreamsRequest } from "../../stores/streams";
import * as tauri from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  exportStreams: vi.fn(async () => true),
}));

const announceSpy = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAnnounce", () => ({ useAnnounce: () => announceSpy }));

vi.mock("../../i18n/paraglide/messages", () => ({
  streams_export_title: () => "Export streams",
  streams_export_selected_title: ({ count }: { count: number }) => `Export selected (${count})`,
  streams_export_format_label: () => "Export format",
  streams_export_m3u8_desc: () => "Universal format, UTF-8 names.",
  streams_export_pls_desc: () => "Classic Winamp/SHOUTcast format.",
  streams_export_confirm: () => "Export",
  streams_export_done: () => "Stream list exported",
  cancel: () => "Cancel",
}));

beforeEach(() => {
  vi.clearAllMocks();
  $exportStreamsRequest.set(null);
});

describe("ExportFormatDialog", () => {
  it("defaults to M3U8 and exports it", async () => {
    const user = userEvent.setup();
    $exportStreamsRequest.set({ ids: null });
    render(<ExportFormatDialog />);
    await screen.findByRole("radiogroup", { name: "Export format" });
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(tauri.exportStreams).toHaveBeenCalledWith("m3u8", undefined));
  });

  it("focuses the selected format radio on open", async () => {
    $exportStreamsRequest.set({ ids: null });
    render(<ExportFormatDialog />);
    const m3u8 = await screen.findByRole("radio", { name: "M3U8" });
    expect(m3u8).toHaveFocus();
  });

  it("describes each format card for AT", async () => {
    $exportStreamsRequest.set({ ids: null });
    render(<ExportFormatDialog />);
    const m3u8 = await screen.findByRole("radio", { name: "M3U8" });
    expect(m3u8).toHaveAccessibleDescription("Universal format, UTF-8 names.");
    expect(screen.getByRole("radio", { name: "PLS" })).toHaveAccessibleDescription(
      "Classic Winamp/SHOUTcast format.",
    );
  });

  it("exports PLS when selected", async () => {
    const user = userEvent.setup();
    $exportStreamsRequest.set({ ids: null });
    render(<ExportFormatDialog />);
    await user.click(screen.getByRole("radio", { name: "PLS" }));
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(tauri.exportStreams).toHaveBeenCalledWith("pls", undefined));
  });

  it("announces success when a file was written", async () => {
    const user = userEvent.setup();
    $exportStreamsRequest.set({ ids: null });
    render(<ExportFormatDialog />);
    await user.click(await screen.findByRole("button", { name: "Export" }));
    await waitFor(() => expect(announceSpy).toHaveBeenCalledWith("Stream list exported"));
  });

  it("stays silent when the save dialog was cancelled", async () => {
    const user = userEvent.setup();
    vi.mocked(tauri.exportStreams).mockResolvedValueOnce(false);
    $exportStreamsRequest.set({ ids: null });
    render(<ExportFormatDialog />);
    await user.click(await screen.findByRole("button", { name: "Export" }));
    await waitFor(() => expect(tauri.exportStreams).toHaveBeenCalled());
    expect(announceSpy).not.toHaveBeenCalled();
    expect($exportStreamsRequest.get()).toBeNull(); // dialog still closes
  });

  it("shows the selected title and exports only the selected ids", async () => {
    const user = userEvent.setup();
    $exportStreamsRequest.set({ ids: ["a", "b"] });
    render(<ExportFormatDialog />);
    expect(await screen.findByText("Export selected (2)")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(tauri.exportStreams).toHaveBeenCalledWith("m3u8", ["a", "b"]));
  });
});
