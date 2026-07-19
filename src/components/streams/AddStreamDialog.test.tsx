import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddStreamDialog } from "./AddStreamDialog";
import { $streams, $showAddStreamDialog, $editStream } from "../../stores/streams";

vi.mock("../../lib/tauri", () => ({
  probeStream: vi.fn(),
  addStream: vi.fn(),
  updateStream: vi.fn(),
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
  stream_added: ({ name }: { name: string }) => `Stream added: ${name}`,
  stream_updated: ({ name }: { name: string }) => `Stream updated: ${name}`,
}));

import * as tauri from "../../lib/tauri";

const probeStream = vi.mocked(tauri.probeStream);
const addStream = vi.mocked(tauri.addStream);

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
  });

  it("probes before saving and saves when the stream responds", async () => {
    probeStream.mockResolvedValue({ ok: true, error: null });
    render(<AddStreamDialog />);

    await fillUrlAndSubmit();

    await waitFor(() => expect(addStream).toHaveBeenCalledWith("http://a", undefined));
    expect(probeStream).toHaveBeenCalledWith("http://a");
    expect($showAddStreamDialog.get()).toBe(false); // closed on success
  });

  it("warns instead of saving when the probe fails, then saves on the second submit", async () => {
    probeStream.mockResolvedValue({ ok: false, error: "connection refused" });
    render(<AddStreamDialog />);

    await fillUrlAndSubmit();

    expect(await screen.findByText("The stream did not respond")).toBeInTheDocument();
    expect(addStream).not.toHaveBeenCalled(); // warning does not save

    // Second submit skips the probe and adds anyway.
    await userEvent.click(screen.getByRole("button", { name: "Add anyway" }));
    await waitFor(() => expect(addStream).toHaveBeenCalledWith("http://a", undefined));
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
    probeStream.mockResolvedValue({ ok: false, error: "nope" });
    render(<AddStreamDialog />);

    await fillUrlAndSubmit();
    expect(await screen.findByText("The stream did not respond")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("URL"), "b");
    expect(screen.queryByText("The stream did not respond")).not.toBeInTheDocument();

    probeStream.mockResolvedValue({ ok: true, error: null });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(probeStream).toHaveBeenCalledTimes(2));
    expect(probeStream).toHaveBeenLastCalledWith("http://ab");
  });

  it("marks the form busy and announces progress while probing", async () => {
    let release!: (v: { ok: boolean; error: string | null }) => void;
    probeStream.mockReturnValue(new Promise((r) => { release = r; }));
    render(<AddStreamDialog />);

    await fillUrlAndSubmit();

    const status = await screen.findByText("Checking stream…", { selector: "p" });
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "Checking stream…" })).toBeDisabled();

    release({ ok: true, error: null });
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
