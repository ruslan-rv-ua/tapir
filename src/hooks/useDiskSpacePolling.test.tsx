import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import * as tauri from "../lib/tauri";
import { $freeSpace } from "../stores/system";
import { useDiskSpacePolling } from "./useDiskSpacePolling";

// Stub the Tauri IPC layer — there is no backend in jsdom.
vi.mock("../lib/tauri", () => ({
  getFreeSpace: vi.fn(),
}));

function Harness() {
  useDiskSpacePolling();
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  $freeSpace.set(null);
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useDiskSpacePolling", () => {
  it("fetches once on mount and writes the store", async () => {
    vi.mocked(tauri.getFreeSpace).mockResolvedValue(1234);
    render(<Harness />);
    await vi.waitFor(() => expect($freeSpace.get()).toBe(1234));
    expect(tauri.getFreeSpace).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after 30s", async () => {
    vi.mocked(tauri.getFreeSpace).mockResolvedValue(1);
    render(<Harness />);
    await vi.waitFor(() => expect(tauri.getFreeSpace).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(tauri.getFreeSpace).toHaveBeenCalledTimes(2);
  });

  it("sets store to null on error", async () => {
    $freeSpace.set(999);
    vi.mocked(tauri.getFreeSpace).mockRejectedValue(new Error("boom"));
    render(<Harness />);
    await vi.waitFor(() => expect($freeSpace.get()).toBeNull());
  });

  it("stops polling after unmount", async () => {
    vi.mocked(tauri.getFreeSpace).mockResolvedValue(1);
    const { unmount } = render(<Harness />);
    await vi.waitFor(() => expect(tauri.getFreeSpace).toHaveBeenCalledTimes(1));
    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tauri.getFreeSpace).toHaveBeenCalledTimes(1);
  });
});
