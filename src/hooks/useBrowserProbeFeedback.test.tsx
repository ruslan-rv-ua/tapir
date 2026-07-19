import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { $announcer } from "../stores/announcer";
import { $toasts } from "../stores/toasts";

type Handler = (e: { payload: unknown }) => void;
const handlers = new Map<string, Handler>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: Handler) => {
    handlers.set(event, cb);
    return () => handlers.delete(event);
  }),
}));

vi.mock("../i18n/paraglide/messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../i18n/paraglide/messages")>();
  return {
    ...actual,
    browser_probe_failed_one: ({ name }: { name: string }) => `one-${name}`,
    browser_probe_failed_many: ({ count, checked }: { count: string; checked: string }) =>
      `many-${count}-of-${checked}`,
  };
});

import { useBrowserProbeFeedback } from "./useBrowserProbeFeedback";

const EVENT = "browser-station-probe-result";

function Host() {
  useBrowserProbeFeedback();
  return null;
}

async function emit(payload: unknown) {
  await vi.waitFor(() => expect(handlers.has(EVENT)).toBe(true));
  handlers.get(EVENT)!({ payload });
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  $announcer.set(null);
  $toasts.set([]);
});

describe("useBrowserProbeFeedback", () => {
  it("одна невдача → називає станцію, polite announce + info toast", async () => {
    render(<Host />);
    await emit({ checked: 1, failed: ["Dead FM"] });
    expect($announcer.get()).toEqual({ message: "one-Dead FM", priority: "polite" });
    expect($toasts.get().some((t) => t.message === "one-Dead FM" && t.type === "info")).toBe(true);
  });

  it("кілька невдач → згортає у підсумок «N з M», а не перелік", async () => {
    render(<Host />);
    await emit({ checked: 10, failed: ["A", "B", "C"] });
    expect($announcer.get()).toEqual({ message: "many-3-of-10", priority: "polite" });
  });

  it("порожній failed → тиша (успіхи не озвучуються)", async () => {
    render(<Host />);
    await emit({ checked: 5, failed: [] });
    expect($announcer.get()).toBeNull();
    expect($toasts.get()).toEqual([]);
  });
});
