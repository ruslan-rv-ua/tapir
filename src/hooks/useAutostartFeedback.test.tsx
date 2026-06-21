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
  return { ...actual, autostart_deactivated_moved: () => "moved-msg" };
});

import { useAutostartFeedback } from "./useAutostartFeedback";

function Host() {
  useAutostartFeedback();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  $announcer.set(null);
  $toasts.set([]);
});

describe("useAutostartFeedback", () => {
  it("autostart-deactivated → polite announce + info toast", async () => {
    render(<Host />);
    await vi.waitFor(() => expect(handlers.has("autostart-deactivated")).toBe(true));
    handlers.get("autostart-deactivated")!({ payload: undefined });
    expect($announcer.get()).toEqual({ message: "moved-msg", priority: "polite" });
    expect(
      $toasts.get().some((t) => t.message === "moved-msg" && t.type === "info"),
    ).toBe(true);
  });
});
