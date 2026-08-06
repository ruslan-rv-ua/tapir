import { describe, it, expect } from "vitest";
import { shellOpenErrorMessage } from "./shellOpenError";
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
