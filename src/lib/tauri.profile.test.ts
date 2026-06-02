import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { listProfiles, switchProfile, createProfile, deleteProfile, commitImport } from "./tauri";

beforeEach(() => { vi.clearAllMocks(); });

describe("Profile IPC wrappers", () => {
  it("listProfiles calls list_profiles with no args", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    await listProfiles();
    expect(invoke).toHaveBeenCalledWith("list_profiles");
  });

  it("switchProfile calls switch_profile with name arg", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({});
    await switchProfile("Jazz");
    expect(invoke).toHaveBeenCalledWith("switch_profile", { name: "Jazz" });
  });

  it("createProfile calls create_profile with name arg", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ name: "Jazz", streamCount: 0, isActive: false });
    await createProfile("Jazz");
    expect(invoke).toHaveBeenCalledWith("create_profile", { name: "Jazz" });
  });

  it("deleteProfile calls delete_profile with name arg", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await deleteProfile("Jazz");
    expect(invoke).toHaveBeenCalledWith("delete_profile", { name: "Jazz" });
  });

  it("commitImport calls commit_import with profileJson and name", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ name: "Imported", streamCount: 0, isActive: false });
    await commitImport("{}", "Imported");
    expect(invoke).toHaveBeenCalledWith("commit_import", { profileJson: "{}", name: "Imported" });
  });
});
