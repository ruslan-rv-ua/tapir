import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportFormatDialog } from "./ExportFormatDialog";
import { $showExportStreamsDialog } from "../../stores/streams";
import * as tauri from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  exportStreams: vi.fn(async () => {}),
}));

vi.mock("../../i18n/paraglide/messages", () => ({
  streams_export_title: () => "Export streams",
  streams_export_format_label: () => "Export format",
  streams_export_confirm: () => "Export",
  streams_export_done: () => "Stream list exported",
  cancel: () => "Cancel",
}));

beforeEach(() => {
  vi.clearAllMocks();
  $showExportStreamsDialog.set(false);
});

describe("ExportFormatDialog", () => {
  it("defaults to M3U8 and exports it", async () => {
    const user = userEvent.setup();
    $showExportStreamsDialog.set(true);
    render(<ExportFormatDialog />);
    await screen.findByRole("radiogroup", { name: "Export format" });
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(tauri.exportStreams).toHaveBeenCalledWith("m3u8"));
  });

  it("exports PLS when selected", async () => {
    const user = userEvent.setup();
    $showExportStreamsDialog.set(true);
    render(<ExportFormatDialog />);
    await user.click(screen.getByRole("radio", { name: "PLS" }));
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(tauri.exportStreams).toHaveBeenCalledWith("pls"));
  });
});
