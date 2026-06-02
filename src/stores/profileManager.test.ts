import { describe, it, expect, beforeEach } from "vitest";
import { $profileList } from "./profileManager";

beforeEach(() => {
  $profileList.set([]);
});

describe("$profileList", () => {
  it("defaults to empty", () => {
    expect($profileList.get()).toHaveLength(0);
  });
});
