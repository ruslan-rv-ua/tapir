import { describe, it, expect } from "vitest";
import { resultSetKey } from "./resultSetKey";

describe("resultSetKey", () => {
  it("is the same string for the same criteria", () => {
    expect(resultSetKey(["jazz", "PL", 128])).toBe(resultSetKey(["jazz", "PL", 128]));
  });

  it("keeps neighbouring criteria apart — text cannot spill from one into the next", () => {
    // The trap a joined string walks into: "ab" + "c" and "a" + "bc" are two
    // different result sets, and a key that cannot tell them apart would leave
    // the current stop on a row from the other one.
    expect(resultSetKey(["ab", "c"])).not.toBe(resultSetKey(["a", "bc"]));
  });

  it("reads an unset criterion the same whether it is null or undefined", () => {
    // Stores spell "no station chosen" both ways; the person did the same thing.
    expect(resultSetKey(["q", null])).toBe(resultSetKey(["q", undefined]));
  });

  it("tells an unset criterion apart from an empty string", () => {
    expect(resultSetKey([null])).not.toBe(resultSetKey([""]));
  });

  it("tells a number apart from the same digits typed as text", () => {
    expect(resultSetKey([128])).not.toBe(resultSetKey(["128"]));
  });
});
