import { describe, it, expect, vi } from "vitest";
import { playRefusalMessage } from "./playRefusal";

vi.mock("../i18n/paraglide/messages", () => ({
  stream_play_unsupported: () => "Tapir не відтворює кодек цього потоку",
}));

describe("playRefusalMessage", () => {
  it("translates the refusal code", () => {
    expect(playRefusalMessage("unsupported_codec")).toBe("Tapir не відтворює кодек цього потоку");
  });

  it("passes anything else through untouched", () => {
    // Причина обриву — єдина деталь, яку має користувач; узагальнювати її
    // означало б забрати її.
    expect(playRefusalMessage("failed to connect to stream")).toBe("failed to connect to stream");
    expect(playRefusalMessage(new Error("boom"))).toBe("Error: boom");
  });
});
