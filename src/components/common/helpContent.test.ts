import { describe, it, expect } from "vitest";
import { getHelpHtml } from "./helpContent";

describe("getHelpHtml", () => {
  it("compiles the uk overview markdown to sanitized HTML through the plugin", () => {
    const html = getHelpHtml("uk", "overview");
    expect(html).toContain("<h2");
    expect(html).toContain("Ласкаво просимо");
    // Authored at ## — must NOT emit an <h1> (would break the dialog's heading scale).
    expect(html).not.toContain("<h1");
  });

  it("returns locale-specific content for en", () => {
    expect(getHelpHtml("en", "overview")).toContain("Welcome to Tapir");
  });

  it("resolves the stub sections", () => {
    expect(getHelpHtml("en", "recording")).toContain("coming soon");
  });

  it("falls back to uk for an unknown locale", () => {
    expect(getHelpHtml("de", "overview")).toContain("Ласкаво просимо");
  });
});
