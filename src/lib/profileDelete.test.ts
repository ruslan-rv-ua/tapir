import { describe, it, expect } from "vitest";
import { profileDeleteRefusal, profileDeleteErrorMessage } from "./profileDelete";
import * as m from "../i18n/paraglide/messages";

describe("profileDeleteRefusal", () => {
  it("returns null for a profile that may be deleted", () => {
    expect(profileDeleteRefusal("Jazz", "Default")).toBeNull();
  });

  it("names the Default rule for the Default row", () => {
    expect(profileDeleteRefusal("Default", "Jazz")).toBe(m.profile_delete_denied_default());
  });

  it("tells the user to switch away for the active row", () => {
    expect(profileDeleteRefusal("Jazz", "Jazz")).toBe(m.profile_delete_denied_active());
  });

  // Default is normally also the active profile. "Switch to another one first"
  // would be a lie there — switching away does not make Default deletable — so
  // the unconditional rule wins.
  it("prefers the Default rule when Default is also the active profile", () => {
    expect(profileDeleteRefusal("Default", "Default")).toBe(m.profile_delete_denied_default());
  });
});

describe("profileDeleteErrorMessage", () => {
  it("maps the backend's Default refusal onto the same text as the pre-check", () => {
    const err = "Forbidden: Cannot delete 'Default' profile";
    expect(profileDeleteErrorMessage(err, "Default", "Default")).toBe(
      profileDeleteRefusal("Default", "Default"),
    );
    expect(profileDeleteErrorMessage(err, "Default", "Default")).not.toContain("Forbidden");
  });

  it("maps the backend's active refusal onto the same text as the pre-check", () => {
    const err = "Forbidden: Cannot delete the active profile";
    expect(profileDeleteErrorMessage(err, "Jazz", "Jazz")).toBe(m.profile_delete_denied_active());
  });

  // A Forbidden the UI cannot reconstruct — a rule added backend-side later, or
  // a race where the profile became active between the pre-check and the call.
  it("falls back to a localized generic for a Forbidden it cannot reconstruct", () => {
    expect(profileDeleteErrorMessage("Forbidden: something new", "Jazz", "Default")).toBe(
      m.profile_delete_denied_unknown(),
    );
  });

  it("leaves a non-Forbidden failure raw — its detail is the only diagnosis the user gets", () => {
    expect(profileDeleteErrorMessage("IO error: access denied", "Jazz", "Default")).toBe(
      "IO error: access denied",
    );
    expect(profileDeleteErrorMessage(new Error("boom"), "Jazz", "Default")).toBe("Error: boom");
  });
});
