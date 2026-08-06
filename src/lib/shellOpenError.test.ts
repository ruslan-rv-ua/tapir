import { describe, it, expect } from "vitest";
import { shellOpenErrorMessage, streamOpenErrorMessage } from "./shellOpenError";
import * as m from "../i18n/paraglide/messages";

describe("shellOpenErrorMessage", () => {
  it("names the missing file for the backend's not_found code", () => {
    expect(shellOpenErrorMessage("not_found")).toBe(m.songs_open_not_found());
  });

  it("explains a missing file association for no_assoc", () => {
    expect(shellOpenErrorMessage("no_assoc")).toBe(m.songs_open_no_assoc());
  });

  it("falls back to the generic message for the backend's generic code", () => {
    expect(shellOpenErrorMessage("generic")).toBe(m.songs_open_failed());
  });

  it("falls back to the generic message for anything unrecognized", () => {
    // e.g. a tokio join error, which never reaches map_shell_error.
    expect(shellOpenErrorMessage("task 12 panicked")).toBe(m.songs_open_failed());
    expect(shellOpenErrorMessage(new Error("boom"))).toBe(m.songs_open_failed());
  });
});

describe("streamOpenErrorMessage", () => {
  // A machine with VLC installed cannot reproduce no_assoc, so the wording that
  // tells the user to install a player is only ever checked here.
  it("tells the user to install a media player for no_assoc", () => {
    expect(streamOpenErrorMessage("no_assoc")).toBe(m.stream_open_no_assoc());
  });

  it("names the temp file, not the association, for write_failed", () => {
    const msg = streamOpenErrorMessage("write_failed");
    expect(msg).toBe(m.stream_open_write_failed());
    expect(msg).not.toBe(m.stream_open_no_assoc());
  });

  it("falls back to the generic message for generic and for anything unrecognized", () => {
    expect(streamOpenErrorMessage("generic")).toBe(m.stream_open_failed());
    expect(streamOpenErrorMessage("task 12 panicked")).toBe(m.stream_open_failed());
  });

  it("does not reuse the songs wording — the two code sets are separate", () => {
    expect(streamOpenErrorMessage("no_assoc")).not.toBe(shellOpenErrorMessage("no_assoc"));
  });
});
