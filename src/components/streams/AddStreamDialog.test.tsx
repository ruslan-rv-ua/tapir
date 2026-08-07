import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddStreamDialog } from "./AddStreamDialog";
import { $streams, $showAddStreamDialog, $editStream, $statuses } from "../../stores/streams";

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
  stream_url_locked: () => "Stop the recording to edit the address",
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
    $statuses.set({});
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

  it("does not probe when editing leaves the address alone", async () => {
    $showAddStreamDialog.set(false);
    $editStream.set({ id: "s1", url: "http://a", name: "A" } as never);
    vi.mocked(tauri.updateStream).mockResolvedValue({ id: "s1", url: "http://a", name: "B" } as never);
    render(<AddStreamDialog />);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(tauri.updateStream).toHaveBeenCalled());
    expect(probeStream).not.toHaveBeenCalled();
  });
});

describe("AddStreamDialog edit mode — URL", () => {
  const updateStream = vi.mocked(tauri.updateStream);
  const editing = { id: "s1", url: "http://old", name: "Radio X", icyName: null };

  const openEdit = (patch: Partial<typeof editing> = {}) => {
    $showAddStreamDialog.set(false);
    $editStream.set({ ...editing, ...patch } as never);
  };

  const retypeUrl = async (next: string) => {
    await userEvent.clear(screen.getByLabelText("URL"));
    await userEvent.type(screen.getByLabelText("URL"), next);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    $streams.set([]);
    $statuses.set({});
    checkStreamConflicts.mockResolvedValue(NO_CONFLICTS);
    probeStream.mockResolvedValue({ ok: true, error: null, ...NO_META });
    updateStream.mockResolvedValue({ ...editing, url: "http://new" } as never);
  });

  it("shows the address first but still opens with focus on the name", async () => {
    // One layout to remember; F2 stays muscle memory for renaming.
    openEdit();
    render(<AddStreamDialog />);

    const [first, second] = screen.getAllByRole("textbox");
    expect(first).toBe(screen.getByLabelText("URL"));
    expect(second).toBe(screen.getByLabelText("Name"));
    expect(screen.getByLabelText("URL")).toHaveValue("http://old");
    expect(screen.getByLabelText("Name")).toHaveFocus();
  });

  it("keeps a plain rename a single submit — no probe, no duplicate check", async () => {
    openEdit();
    render(<AddStreamDialog />);

    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Radio Y");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateStream).toHaveBeenCalledWith("s1", "Radio Y"));
    expect(probeStream).not.toHaveBeenCalled();
    expect(checkStreamConflicts).toHaveBeenCalledWith({
      url: undefined,
      name: "Radio Y",
      excludeId: "s1",
    });
  });

  it("probes the new address and saves it with the fresh metadata", async () => {
    probeStream.mockResolvedValue({
      ok: true, error: null, icyName: "Groove Salad", bitrate: 128, format: "mp3",
    });
    openEdit();
    render(<AddStreamDialog />);

    await retypeUrl("http://new");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateStream).toHaveBeenCalledWith("s1", "Radio X", "http://new", {
        icyName: "Groove Salad",
        bitrate: 128,
        format: "mp3",
      }),
    );
    expect(probeStream).toHaveBeenCalledWith("http://new");
    // Both halves in one round trip — the name may now collide too.
    expect(checkStreamConflicts).toHaveBeenCalledWith({
      url: "http://new",
      name: "Radio X",
      excludeId: "s1",
    });
  });

  it("saves blank metadata when the new address does not respond", async () => {
    // The stored codec/bitrate/station name described the address that just
    // left; keeping them would have NVDA read out a lie.
    probeStream.mockResolvedValue({ ok: false, error: "nope", ...NO_META });
    openEdit();
    render(<AddStreamDialog />);

    await retypeUrl("http://new");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("The stream did not respond")).toBeInTheDocument();
    expect(updateStream).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Save anyway" }));
    await waitFor(() =>
      expect(updateStream).toHaveBeenCalledWith("s1", "Radio X", "http://new", NO_META),
    );
    expect(probeStream).toHaveBeenCalledTimes(1); // the verdict stands down
  });

  it("warns about an address the profile already holds, then saves anyway", async () => {
    checkStreamConflicts.mockResolvedValue({ duplicateUrlOf: "Radio Y", nameCollidesWith: null });
    openEdit();
    render(<AddStreamDialog />);

    await retypeUrl("http://new");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("URL already in profile as Radio Y")).toBeInTheDocument();
    expect(updateStream).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(updateStream).toHaveBeenCalled());
    expect(checkStreamConflicts).toHaveBeenCalledTimes(1);
  });

  it("re-probes after the address is edited again", async () => {
    probeStream.mockResolvedValue({ ok: false, error: "nope", ...NO_META });
    openEdit();
    render(<AddStreamDialog />);

    await retypeUrl("http://new");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The stream did not respond")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("URL"), "er");
    expect(screen.queryByText("The stream did not respond")).not.toBeInTheDocument();

    probeStream.mockResolvedValue({ ok: true, error: null, ...NO_META });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(probeStream).toHaveBeenCalledTimes(2));
    expect(probeStream).toHaveBeenLastCalledWith("http://newer");
  });

  it("treats an address typed back to the stored one as unchanged", async () => {
    openEdit();
    render(<AddStreamDialog />);

    await retypeUrl("http://old");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateStream).toHaveBeenCalledWith("s1", "Radio X"));
    expect(probeStream).not.toHaveBeenCalled();
  });

  it.each(["recording", "connecting", "reconnecting"] as const)(
    "locks the address while the stream is %s and says why",
    async (state) => {
      openEdit();
      $statuses.setKey("s1", { streamId: "s1", state } as never);
      render(<AddStreamDialog />);

      const field = screen.getByLabelText("URL");
      expect(field).toHaveAttribute("readonly");
      expect(field).toHaveAttribute("aria-disabled", "true");
      // Never natively disabled: that would drop the field out of the tab order,
      // so the screen reader could never reach it — nor the description below.
      expect(field).toBeEnabled();
      const hint = screen.getByText("Stop the recording to edit the address");
      expect(field).toHaveAttribute("aria-describedby", hint.id);
    },
  );

  it("keeps the locked address reachable from the keyboard", async () => {
    openEdit();
    $statuses.setKey("s1", { streamId: "s1", state: "recording" } as never);
    render(<AddStreamDialog />);

    // Focus opens on the name; one Shift+Tab must still land on the address,
    // which is where the explanation is announced.
    await userEvent.tab({ shift: true });
    expect(screen.getByLabelText("URL")).toHaveFocus();
  });

  it.each(["idle", "error", "stopped"] as const)(
    "leaves the address editable while the stream is %s",
    async (state) => {
      // An errored stream in a reconnect loop is exactly the one whose address
      // most needs fixing.
      openEdit();
      $statuses.setKey("s1", { streamId: "s1", state } as never);
      render(<AddStreamDialog />);

      const field = screen.getByLabelText("URL");
      expect(field).not.toHaveAttribute("readonly");
      expect(field).not.toHaveAttribute("aria-disabled");
      expect(
        screen.queryByText("Stop the recording to edit the address"),
      ).not.toBeInTheDocument();
    },
  );

  it("announces both warnings when a move collides on address and name at once", async () => {
    // The check stands down after this submit — a warning held back here is a
    // warning the user never hears.
    checkStreamConflicts.mockResolvedValue({
      duplicateUrlOf: "Radio Y",
      nameCollidesWith: "Radio Z",
    });
    openEdit();
    render(<AddStreamDialog />);

    await retypeUrl("http://new");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const region = await screen.findByText(/URL already in profile as Radio Y/);
    expect(region).toHaveTextContent("Name already used by Radio Z");
  });

  it("trims the address before probing, checking and saving", async () => {
    openEdit();
    render(<AddStreamDialog />);

    await retypeUrl("  http://new  ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(probeStream).toHaveBeenCalledWith("http://new"));
    expect(checkStreamConflicts).toHaveBeenCalledWith({
      url: "http://new",
      name: "Radio X",
      excludeId: "s1",
    });
    expect(updateStream).toHaveBeenCalledWith("s1", "Radio X", "http://new", NO_META);
  });
});

describe("AddStreamDialog conflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    $streams.set([]);
    $statuses.set({});
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

  it("puts focus on the confirm button when a warning stops the save", async () => {
    // Probing disables the whole form, so the control the user submitted from
    // loses focus to <body> and the screen reader says nothing at all. Submit
    // from the URL field (Enter) so the assertion fails if focus is merely left
    // where it started.
    checkStreamConflicts.mockResolvedValue({ duplicateUrlOf: "Промінь", nameCollidesWith: null });
    render(<AddStreamDialog />);

    await userEvent.type(screen.getByLabelText("URL"), "http://a{Enter}");

    const confirm = await screen.findByRole("button", { name: "Add anyway" });
    await waitFor(() => expect(confirm).toHaveFocus());
  });

  it("puts focus on the confirm button when the probe warning stops the save", async () => {
    probeStream.mockResolvedValue({ ok: false, error: "nope", ...NO_META });
    render(<AddStreamDialog />);

    await userEvent.type(screen.getByLabelText("URL"), "http://a{Enter}");

    const confirm = await screen.findByRole("button", { name: "Add anyway" });
    await waitFor(() => expect(confirm).toHaveFocus());
  });

  it("puts focus on the confirm button when a rename warning stops the save", async () => {
    $showAddStreamDialog.set(false);
    $editStream.set({ id: "s1", url: "http://a", name: "A", icyName: null } as never);
    checkStreamConflicts.mockResolvedValue({ duplicateUrlOf: null, nameCollidesWith: "Radio X" });
    render(<AddStreamDialog />);

    await userEvent.type(screen.getByLabelText("Name"), "{Enter}");

    const confirm = await screen.findByRole("button", { name: "Save anyway" });
    await waitFor(() => expect(confirm).toHaveFocus());
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
