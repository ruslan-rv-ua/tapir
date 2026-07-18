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
    crash_resume_all_one: ({ count }: { count: string }) => `all-one-${count}`,
    crash_resume_all_few: ({ count }: { count: string }) => `all-few-${count}`,
    crash_resume_all_many: ({ count }: { count: string }) => `all-many-${count}`,
    crash_resume_partial: ({ resumed, total }: { resumed: string; total: string }) =>
      `partial-${resumed}-of-${total}`,
  };
});

import { useCrashResumeFeedback } from "./useCrashResumeFeedback";

function Host() {
  useCrashResumeFeedback();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  $announcer.set(null);
  $toasts.set([]);
});

describe("useCrashResumeFeedback", () => {
  it("усі підняті → polite announce (плюральна форма) + info toast", async () => {
    render(<Host />);
    await vi.waitFor(() => expect(handlers.has("crash-resume")).toBe(true));
    handlers.get("crash-resume")!({ payload: { resumed: 2, total: 2 } });
    // lang за замовчуванням "uk": 2 → few
    expect($announcer.get()).toEqual({ message: "all-few-2", priority: "polite" });
    expect($toasts.get().some((t) => t.message === "all-few-2" && t.type === "info")).toBe(true);
  });

  it("частково → повідомлення «N з M»", async () => {
    render(<Host />);
    await vi.waitFor(() => expect(handlers.has("crash-resume")).toBe(true));
    handlers.get("crash-resume")!({ payload: { resumed: 1, total: 3 } });
    expect($announcer.get()).toEqual({ message: "partial-1-of-3", priority: "polite" });
  });
});
