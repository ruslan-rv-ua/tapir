import { describe, it, expect, beforeEach } from "vitest";
import { $profileManagerOpen, $profileList } from "./profileManager";

beforeEach(() => {
  $profileManagerOpen.set(false);
  $profileList.set([]);
});

describe("$profileManagerOpen", () => {
  it("defaults to false", () => {
    expect($profileManagerOpen.get()).toBe(false);
  });
  it("can be set to true", () => {
    $profileManagerOpen.set(true);
    expect($profileManagerOpen.get()).toBe(true);
  });
});

describe("$profileList", () => {
  it("defaults to empty", () => {
    expect($profileList.get()).toHaveLength(0);
  });
});
