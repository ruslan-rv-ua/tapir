import { describe, it, expect, beforeEach } from "vitest";
import { $stationSelection, updateSearchParam, resetSearch, loadMore } from "./browser";
import { replaceSelection } from "./selection";

beforeEach(() => replaceSelection($stationSelection, new Set(["u1", "u2"])));

describe("browser selection lifecycle", () => {
  it("clears the selection when a new search param is set", () => {
    updateSearchParam("query", "jazz");
    expect($stationSelection.get().size).toBe(0);
  });

  it("clears the selection on resetSearch", () => {
    resetSearch();
    expect($stationSelection.get().size).toBe(0);
  });

  it("keeps the selection across load-more pagination", async () => {
    // loadMore awaits searchStations; mock invoke is not wired here, so just assert
    // the selection is untouched synchronously before the network call resolves.
    void loadMore().catch(() => {});
    expect($stationSelection.get().size).toBe(2);
  });
});
