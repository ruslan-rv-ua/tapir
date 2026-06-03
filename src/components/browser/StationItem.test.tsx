import { describe, it, expect } from "vitest";
import type { StationResult } from "../../lib/tauri";
import { getStationSegments } from "./StationItem";

const mkStation = (over: Partial<StationResult> = {}): StationResult => ({
  stationuuid: "u1",
  name: "Radio Bayraktar",
  url: "http://host/s",
  urlResolved: "http://host/s/resolved",
  codec: "MP3",
  bitrate: 128,
  country: "Ukraine",
  countrycode: "UA",
  tags: "jazz,news",
  language: "ukrainian",
  votes: 10,
  clickcount: 1200,
  hasExtendedInfo: null,
  homepage: "",
  lastcheckok: 1,
  ...over,
});

describe("getStationSegments", () => {
  it("emits one stop per present value, in order, then the two actions", () => {
    expect(getStationSegments(mkStation())).toEqual([
      "country", "language", "codec", "bitrate", "genre", "popularity",
      "action-play", "action-add",
    ]);
  });

  it("omits country when empty", () => {
    expect(getStationSegments(mkStation({ country: "" }))).not.toContain("country");
  });

  it("omits language when empty", () => {
    expect(getStationSegments(mkStation({ language: "" }))).not.toContain("language");
  });

  it("omits genre when tags is empty", () => {
    expect(getStationSegments(mkStation({ tags: "" }))).not.toContain("genre");
  });

  it("omits bitrate when 0 and popularity when clickcount is 0", () => {
    const segs = getStationSegments(mkStation({ bitrate: 0, clickcount: 0 }));
    expect(segs).not.toContain("bitrate");
    expect(segs).not.toContain("popularity");
  });

  it("always ends with both action stops", () => {
    const segs = getStationSegments(mkStation({ country: "", language: "", codec: "", bitrate: 0, tags: "", clickcount: 0 }));
    expect(segs).toEqual(["action-play", "action-add"]);
  });
});
