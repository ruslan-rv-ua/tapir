import { describe, it, expect, vi } from "vitest";
import { playRefusalMessage } from "./playRefusal";

vi.mock("../i18n/paraglide/messages", () => ({
  stream_play_unsupported: () => "Tapir не відтворює кодек цього потоку",
  stream_not_found_in_profile: () => "Потік не знайдено в активному профілі",
}));

describe("playRefusalMessage", () => {
  it("translates the refusal code", () => {
    expect(playRefusalMessage("unsupported_codec")).toBe("Tapir не відтворює кодек цього потоку");
  });

  it("names a stream that is no longer in the active profile — the same wording as the recording side", () => {
    expect(playRefusalMessage("stream_not_found")).toBe("Потік не знайдено в активному профілі");
  });

  it("passes anything else through untouched", () => {
    // Причина обриву — єдина деталь, яку має користувач; узагальнювати її
    // означало б забрати її.
    expect(playRefusalMessage("failed to connect to stream")).toBe("failed to connect to stream");
    expect(playRefusalMessage(new Error("boom"))).toBe("Error: boom");
  });
});
