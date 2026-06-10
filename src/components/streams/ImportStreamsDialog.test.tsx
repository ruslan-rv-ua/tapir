import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportStreamsDialog } from "./ImportStreamsDialog";
import { $importCandidates, $streams } from "../../stores/streams";
import type { ImportCandidate, ImportProgressPayload } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";

let progressHandler: ((p: ImportProgressPayload) => void) | undefined;
vi.mock("../../hooks/useTauriEvent", () => ({
  useTauriEvent: (_event: string, handler: (p: ImportProgressPayload) => void) => {
    progressHandler = handler;
  },
}));

vi.mock("../../lib/tauri", () => ({
  validateImportCandidates: vi.fn(async () => {}),
  commitStreamImport: vi.fn(async () => ({ added: 1, skipped: 0 })),
  getStreams: vi.fn(async () => []),
}));

vi.mock("../../i18n/paraglide/messages", () => ({
  streams_import_title: () => "Import streams",
  streams_import_select_all: () => "Select all",
  streams_import_deselect_all: () => "Deselect all",
  streams_import_select_row: ({ name }: { name: string }) => `Select stream: ${name}`,
  streams_import_status_checking: () => "checking…",
  streams_import_status_ok: ({ details }: { details: string }) => `✓ ${details}`,
  streams_import_status_error: ({ error }: { error: string }) => `✗ ${error}`,
  streams_import_status_duplicate: () => "already in profile",
  streams_import_confirm: ({ count }: { count: number }) => `Import selected (${count})`,
  streams_import_progress: ({ done, total }: { done: number; total: number }) => `Checked ${done} of ${total}`,
  streams_import_summary: ({ ok, errors, duplicates }: { ok: number; errors: number; duplicates: number }) =>
    `${ok} working, ${errors} failed, ${duplicates} already in profile`,
  streams_import_done: ({ added, skipped }: { added: number; skipped: number }) =>
    `Imported: ${added}, skipped: ${skipped}`,
  cancel: () => "Cancel",
}));

const CANDIDATES: ImportCandidate[] = [
  { url: "https://a/1", name: "Alpha", alreadyInProfile: false },
  { url: "https://b/2", name: "Beta", alreadyInProfile: false },
  { url: "https://c/3", name: "Gamma", alreadyInProfile: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  progressHandler = undefined;
  $streams.set([]);
  $importCandidates.set(null);
});

describe("ImportStreamsDialog", () => {
  it("seeds rows, disables duplicates, and auto-starts validation for non-duplicates", async () => {
    $importCandidates.set(CANDIDATES);
    render(<ImportStreamsDialog />);
    await screen.findByText("Alpha");
    // duplicate checkbox disabled, non-duplicates checked
    expect(screen.getByLabelText("Select stream: Gamma")).toBeDisabled();
    expect(screen.getByLabelText("Select stream: Alpha")).toBeChecked();
    await waitFor(() =>
      expect(tauri.validateImportCandidates).toHaveBeenCalledWith(["https://a/1", "https://b/2"]),
    );
  });

  it("updates a row when a probe progress event arrives", async () => {
    $importCandidates.set(CANDIDATES);
    render(<ImportStreamsDialog />);
    await screen.findByText("Alpha");
    act(() => {
      progressHandler?.({ url: "https://a/1", status: "ok", icyName: "Real Name", bitrate: 128, format: "mp3", error: null });
    });
    await screen.findByText("Real Name");
    expect(screen.getByText("✓ 128 kbps · MP3")).toBeInTheDocument();
  });

  it("commits selected streams and refreshes $streams", async () => {
    const user = userEvent.setup();
    $importCandidates.set(CANDIDATES);
    render(<ImportStreamsDialog />);
    await screen.findByText("Alpha");
    await user.click(screen.getByRole("button", { name: "Import selected (2)" }));
    await waitFor(() =>
      expect(tauri.commitStreamImport).toHaveBeenCalledWith([
        { url: "https://a/1", name: "Alpha" },
        { url: "https://b/2", name: "Beta" },
      ]),
    );
    expect(tauri.getStreams).toHaveBeenCalled();
  });
});
