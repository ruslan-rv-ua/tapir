import { describe, it, expect, vi } from "vitest";
import { playRefusalMessage } from "./playRefusal";

vi.mock("../i18n/paraglide/messages", () => ({
  stream_play_unsupported: () => "Tapir не відтворює кодек цього потоку",
  stream_not_found_in_profile: () => "Потік не знайдено в активному профілі",
  stream_play_failed: () => "Не вдалося відтворити потік",
  failure_station_unreachable: () => "Станція не відповідає",
  stream_play_output_unavailable: () => "Не вдалося відкрити пристрій виведення",
}));

describe("playRefusalMessage", () => {
  it("translates the refusal code", () => {
    expect(playRefusalMessage("unsupported_codec")).toBe("Tapir не відтворює кодек цього потоку");
  });

  it("names a stream that is no longer in the active profile — the same wording as the recording side", () => {
    expect(playRefusalMessage("stream_not_found")).toBe("Потік не знайдено в активному профілі");
  });

  it("says the stream would not play — probe timeout, undecodable format, decoder panic", () => {
    expect(playRefusalMessage("play_failed")).toBe("Не вдалося відтворити потік");
  });

  it("says the station did not answer — the same wording as the browser's health check", () => {
    expect(playRefusalMessage("connect_failed")).toBe("Станція не відповідає");
  });

  it("names the output device when it would not open", () => {
    expect(playRefusalMessage("output_unavailable")).toBe("Не вдалося відкрити пристрій виведення");
  });

  it("passes an unknown value through untouched", () => {
    expect(playRefusalMessage(new Error("boom"))).toBe("Error: boom");
  });
});
