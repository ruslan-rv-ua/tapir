import { describe, it, expect, beforeEach } from "vitest";
import { $streamSelection, $streams, $statuses, $streamFilter, $visibleStreams, replaceSelection, pruneSelection, updateStreamStatus } from "./streams";
import { $settings, $profileSettings } from "./settings";
import type { GlobalSettings, ProfileSettings, StreamInfo } from "../lib/tauri";

beforeEach(() => {
  $streamSelection.set(new Set());
  $streams.set([]);
  $settings.set(null);
  $profileSettings.set(null);
});

const mkStream = (id: string, name: string, addedAt: string): StreamInfo => ({
  id,
  name,
  url: `http://${id}`,
  addedAt,
  ignorelist: [],
  format: null,
  unsupportedCodec: null,
  bitrate: null,
  icyName: null,
  icyGenre: null,
  icyUrl: null,
  username: null,
  password: null,
});

const setSort = (streamSort: "name" | "added") => {
  $settings.set({ language: "uk" } as GlobalSettings);
  $profileSettings.set({ ui: { streamSort, trayNotificationsTrackChange: true, trayNotificationsScheduled: true } } as ProfileSettings);
};

describe("$streamSelection + replaceSelection", () => {
  it("defaults to an empty set", () => {
    expect($streamSelection.get().size).toBe(0);
  });

  it("replaceSelection stores a brand-new Set (new identity for useStore)", () => {
    const before = $streamSelection.get();
    replaceSelection(new Set(["a", "b"]));
    const after = $streamSelection.get();
    expect(after).not.toBe(before);
    expect([...after].sort()).toEqual(["a", "b"]);
  });
});

describe("pruneSelection", () => {
  it("drops ids that no longer exist", () => {
    replaceSelection(new Set(["a", "b", "c"]));
    pruneSelection(new Set(["a", "c"])); // b is gone
    expect([...$streamSelection.get()].sort()).toEqual(["a", "c"]);
  });

  it("is a no-op (same Set identity) when nothing changed — avoids extra rerenders", () => {
    replaceSelection(new Set(["a", "b"]));
    const before = $streamSelection.get();
    pruneSelection(new Set(["a", "b", "x"])); // all selected ids still exist
    expect($streamSelection.get()).toBe(before);
  });
});

describe("$visibleStreams — sort order is profile-scoped", () => {
  const streams = [
    mkStream("mid", "Bravo", "2026-02-01T00:00:00Z"),
    mkStream("new", "Charlie", "2026-03-01T00:00:00Z"),
    mkStream("old", "Alpha", "2026-01-01T00:00:00Z"),
  ];

  it("falls back to name order while the profile slice is still null", () => {
    $streams.set(streams);
    expect($visibleStreams.get().map((s) => s.id)).toEqual(["old", "mid", "new"]);
  });

  it("reads the order from the profile, not from global settings", () => {
    setSort("added");
    $streams.set(streams);
    expect($visibleStreams.get().map((s) => s.id)).toEqual(["new", "mid", "old"]);
  });

  it("switching the profile slice re-sorts without touching $streams", () => {
    setSort("added");
    $streams.set(streams);
    setSort("name");
    expect($visibleStreams.get().map((s) => s.id)).toEqual(["old", "mid", "new"]);
  });
});

describe("$visibleStreams — the «Потребує уваги» filter", () => {
  const streams = [
    mkStream("broken", "Alpha", "2026-01-01T00:00:00Z"),
    mkStream("retrying", "Bravo", "2026-02-01T00:00:00Z"),
    mkStream("healthy", "Charlie", "2026-03-01T00:00:00Z"),
  ];

  beforeEach(() => {
    $statuses.set({});
    $streamFilter.set("all");
  });

  it("shows the stream that gave up next to the one still reconnecting", () => {
    // The bucket is one predicate (ADR 2026-09-06 §2) — a stream mid-retry is
    // what the user wants surfaced long before it finally gives up.
    $streams.set(streams);
    updateStreamStatus("broken", { state: "error", error: "station_unreachable" });
    updateStreamStatus("retrying", { state: "reconnecting" });
    updateStreamStatus("healthy", { state: "recording" });

    $streamFilter.set("attention");
    expect($visibleStreams.get().map((s) => s.id)).toEqual(["broken", "retrying"]);
  });

  it("keeps a stream Tapir refuses to record out of the bucket", () => {
    // Refusal is not a failure: the task ends `stopped`, and the carrier is the
    // codec mark on the stream itself (ADR 2026-09-06 §7).
    $streams.set(streams);
    updateStreamStatus("broken", { state: "stopped" });

    $streamFilter.set("attention");
    expect($visibleStreams.get()).toEqual([]);
  });
});
