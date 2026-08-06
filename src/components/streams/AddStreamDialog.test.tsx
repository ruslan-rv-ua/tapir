import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddStreamDialog } from "./AddStreamDialog";
import { $streams, $showAddStreamDialog, $editStream } from "../../stores/streams";

vi.mock("../../lib/tauri", () => ({
  probeStream: vi.fn(),
  addStream: vi.fn(),
  updateStream: vi.fn(),
  checkStreamConflicts: vi.fn(),
}));

vi.mock("../../i18n/paraglide/messages", () => ({
  add_stream: () => "Add stream",
  edit_stream: () => "Edit stream",
  stream_url: () => "URL",
  stream_name: () => "Name",
  cancel: () => "Cancel",
  save: () => "Save",
  saving: () => "Saving…",
  stream_probe_checking: () => "Checking stream…",
  stream_probe_failed: () => "The stream did not respond",
  stream_probe_add_anyway: () => "Add anyway",
  stream_save_anyway: () => "Save anyway",
  stream_duplicate_url_warning: ({ name }: { name: string }) => `URL already in profile as ${name}`,
  stream_name_collision_warning: ({ name }: { name: string }) => `Name already used by ${name}`,
  stream_official_name: ({ name }: { name: string }) => `Station name: ${name}`,
  stream_use_official_name: () => "Use the official name",
  stream_added: ({ name }: { name: string }) => `Stream added: ${name}`,
  stream_updated: ({ name }: { name: string }) => `Stream updated: ${name}`,
}));

import * as tauri from "../../lib/tauri";

const probeStream = vi.mocked(tauri.probeStream);
const addStream = vi.mocked(tauri.addStream);
const checkStreamConflicts = vi.mocked(tauri.checkStreamConflicts);

const NO_CONFLICTS = { duplicateUrlOf: null, nameCollidesWith: null };
const NO_META = { icyName: null, bitrate: null, format: null };

const newStream = { id: "s1", url: "http://a", name: "A" } as never;

async function fillUrlAndSubmit(url = "http://a") {
  await userEvent.type(screen.getByLabelText("URL"), url);
  await userEvent.click(screen.getByRole("button", { name: /Save|Add anyway/ }));
}

describe("AddStreamDialog probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    $streams.set([]);
    $editStream.set(null);
    $showAddStreamDialog.set(true);
    addStream.mockResolvedValue(newStream);
    checkStreamConflicts.mockResolvedValue(NO_CONFLICTS);
  });

  it("probes before saving and saves when the stream responds", async () => {
    probeStream.mockResolvedValue({ ok: true, error: null, ...NO_META });
    render(<AddStreamDialog />);

    await fillUrlAndSubmit();

    await waitFor(() => expect(addStream).toHaveBeenCalledWith("http://a", undefined, NO_META));
    expect(probeStream).toHaveBeenCalledWith("http://a");
    expect($showAddStreamDialog.get()).toBe(false); // closed on success
  });

  it("warns instead of saving when the probe fails, then saves on the second submit", async () => {
    probeStream.mockResolvedValue({ ok: false, error: "connection refused", ...NO_META });
    render(<AddStreamDialog />);

    await fillUrlAndSubmit();

    expect(await screen.findByText("The stream did not respond")).toBeInTheDocument();
    expect(addStream).not.toHaveBeenCalled(); // warning does not save

    // Second submit skips the probe and adds anyway.
    await userEvent.click(screen.getByRole("button", { name: "Add anyway" }));
    await waitFor(() => expect(addStream).toHaveBeenCalledWith("http://a", undefined, NO_META));
    expect(probeStream).toHaveBeenCalledTimes(1);
  });

  it("treats an IPC failure as an unreachable stream", async () => {
    probeStream.mockRejectedValue(new Error("ipc down"));
    render(<AddStreamDialog />);

    await fillUrlAndSubmit();

    expect(await screen.findByText("The stream did not respond")).toBeInTheDocument();
    expect(addStream).not.toHaveBeenCalled();
  });

  it("re-probes after the URL is edited", async () => {
    probeStream.mockResolvedValue({ ok: false, error: "nope", ...NO_META });
    render(<AddStreamDialog />);

    await fillUrlAndSubmit();
    expect(await screen.findByText("The stream did not respond")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("URL"), "b");
    expect(screen.queryByText("The stream did not respond")).not.toBeInTheDocument();

    probeStream.mockResolvedValue({ ok: true, error: null, ...NO_META });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(probeStream).toHaveBeenCalledTimes(2));
    expect(probeStream).toHaveBeenLastCalledWith("http://ab");
  });

  it("marks the form busy and announces progress while probing", async () => {
    let release!: (v: tauri.ProbeVerdict) => void;
    probeStream.mockReturnValue(new Promise((r) => { release = r; }));
    render(<AddStreamDialog />);

    await fillUrlAndSubmit();

    const status = await screen.findByText("Checking stream…", { selector: "p" });
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "Checking stream…" })).toBeDisabled();

    release({ ok: true, error: null, ...NO_META });
    await waitFor(() => expect(addStream).toHaveBeenCalled());
  });

  it("does not probe when editing (URL is not editable)", async () => {
    $showAddStreamDialog.set(false);
    $editStream.set({ id: "s1", url: "http://a", name: "A" } as never);
    vi.mocked(tauri.updateStream).mockResolvedValue({ id: "s1", url: "http://a", name: "B" } as never);
    render(<AddStreamDialog />);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(tauri.updateStream).toHaveBeenCalled());
    expect(probeStream).not.toHaveBeenCalled();
  });
});

describe("AddStreamDialog conflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    $streams.set([]);
    $editStream.set(null);
    $showAddStreamDialog.set(true);
    addStream.mockResolvedValue(newStream);
    probeStream.mockResolvedValue({ ok: true, error: null, ...NO_META });
    checkStreamConflicts.mockResolvedValue(NO_CONFLICTS);
  });

  it("passes the probed bitrate and codec to addStream so the name can be suffixed", async () => {
    probeStream.mockResolvedValue({ ok: true, error: null, icyName: null, bitrate: 64, format: "aac" });
    render(<AddStreamDialog />);

    await userEvent.type(screen.getByLabelText("URL"), "http://a");
    await userEvent.type(screen.getByLabelText("Name"), "Radio X");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(addStream).toHaveBeenCalledWith("http://a", "Radio X", {
        icyName: null,
        bitrate: 64,
        format: "aac",
      }),
    );
  });

  it("hands the probed station name to the backend when the user typed none", async () => {
    // Without this the stream would sit in the list under its URL until the
    // first recording renamed it — a URL is what NVDA would read out.
    probeStream.mockResolvedValue({
      ok: true, error: null, icyName: "Groove Salad", bitrate: 128, format: "mp3",
    });
    render(<AddStreamDialog />);

    await fillUrlAndSubmit();

    await waitFor(() =>
      expect(addStream).toHaveBeenCalledWith("http://a", undefined, {
        icyName: "Groove Salad",
        bitrate: 128,
        format: "mp3",
      }),
    );
  });

  it("warns about a duplicate URL, then adds anyway on the second submit", async () => {
    checkStreamConflicts.mockResolvedValue({ duplicateUrlOf: "Radio X", nameCollidesWith: null });
    render(<AddStreamDialog />);

    await fillUrlAndSubmit();

    expect(await screen.findByText("URL already in profile as Radio X")).toBeInTheDocument();
    expect(addStream).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Add anyway" }));
    await waitFor(() => expect(addStream).toHaveBeenCalled());
    expect(probeStream).toHaveBeenCalledTimes(1); // neither check re-runs
    expect(checkStreamConflicts).toHaveBeenCalledTimes(1);
  });

  it("warns about a name that would share a recording folder, then saves anyway", async () => {
    $showAddStreamDialog.set(false);
    $editStream.set({ id: "s1", url: "http://a", name: "A", icyName: null } as never);
    checkStreamConflicts.mockResolvedValue({ duplicateUrlOf: null, nameCollidesWith: "Radio X" });
    vi.mocked(tauri.updateStream).mockResolvedValue({ id: "s1", url: "http://a", name: "Radio X" } as never);
    render(<AddStreamDialog />);

    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Radio X");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Name already used by Radio X")).toBeInTheDocument();
    expect(tauri.updateStream).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(tauri.updateStream).toHaveBeenCalledWith("s1", "Radio X"));
    expect(checkStreamConflicts).toHaveBeenCalledWith({ name: "Radio X", excludeId: "s1" });
    expect(probeStream).not.toHaveBeenCalled(); // editing never probes
  });

  it("offers the station-reported name in edit mode and copies it into the field", async () => {
    $showAddStreamDialog.set(false);
    $editStream.set({ id: "s1", url: "http://a", name: "My Name", icyName: "Radio X" } as never);
    render(<AddStreamDialog />);

    expect(screen.getByText("Station name: Radio X")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use the official name" }));

    expect(screen.getByLabelText("Name")).toHaveValue("Radio X");
    // Copying the name makes the block redundant — it must disappear.
    expect(screen.queryByRole("button", { name: "Use the official name" })).not.toBeInTheDocument();
  });

  it("hides the official-name block when the stream has never connected", async () => {
    $showAddStreamDialog.set(false);
    $editStream.set({ id: "s1", url: "http://a", name: "My Name", icyName: null } as never);
    render(<AddStreamDialog />);

    expect(screen.queryByRole("button", { name: "Use the official name" })).not.toBeInTheDocument();
  });

  it("re-checks the name after the official name is applied", async () => {
    $showAddStreamDialog.set(false);
    $editStream.set({ id: "s1", url: "http://a", name: "My Name", icyName: "Radio X" } as never);
    checkStreamConflicts.mockResolvedValue({ duplicateUrlOf: null, nameCollidesWith: "Radio X" });
    render(<AddStreamDialog />);

    await userEvent.click(screen.getByRole("button", { name: "Use the official name" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Name already used by Radio X")).toBeInTheDocument();
  });
});
