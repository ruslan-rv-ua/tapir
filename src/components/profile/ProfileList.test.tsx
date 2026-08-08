import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act, waitFor } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $profileList, $profilesSelection } from "../../stores/profileManager";
import { $announcer } from "../../stores/announcer";
import { replaceSelection } from "../../stores/selection";
import type { ProfileMeta } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { ProfileList, type ProfileListHandle } from "./ProfileList";

vi.mock("../../i18n/paraglide/runtime", () => ({ getLocale: () => "uk" }));
vi.mock("../../i18n/paraglide/messages", () => ({
  zone_profiles_list: () => "Список профілів",
  item_role_profile: () => "профіль",
  profile_active_badge: () => "активний",
  profile_row_actions: ({ name }: { name: string }) => `Дії для профілю ${name}`,
  profile_actions: ({ name }: { name: string }) => `Дії для ${name}`,
  profile_context_menu: () => "Контекстне меню профілю",
  profile_switch: () => "Перемкнутися",
  profile_duplicate: () => "Дублювати",
  profile_rename: () => "Перейменувати",
  profile_delete: () => "Видалити",
  profile_export: () => "Експортувати",
  profile_settings: () => "Налаштування профілю…",
  profile_switch_named: ({ name }: { name: string }) => `Перемкнутися на ${name}`,
  profile_duplicate_named: ({ name }: { name: string }) => `Дублювати ${name}`,
  profile_rename_named: ({ name }: { name: string }) => `Перейменувати ${name}`,
  profile_delete_named: ({ name }: { name: string }) => `Видалити ${name}`,
  profile_export_named: ({ name }: { name: string }) => `Експортувати ${name}`,
  profile_stream_count_one: ({ count }: { count: number }) => `${count} потік`,
  profile_stream_count_few: ({ count }: { count: number }) => `${count} потоки`,
  profile_stream_count_many: ({ count }: { count: number }) => `${count} потоків`,
  profile_stream_count_other: ({ count }: { count: number }) => `${count} потоки`,
  // Bulk-delete keys (Task 16)
  confirm_delete_selected_profiles: ({ count }: { count: number }) => `Видалити вибрані профілі (${count})?`,
  profiles_removed_bulk: ({ count }: { count: number }) => `Видалено профілів: ${count}`,
  bulk_skipped_active: () => "активний профіль пропущено",
  delete_selected: ({ count }: { count: number }) => `Видалити вибрані (${count})`,
  selection_suffix: () => "виділено",
  cancel: () => "Скасувати",
  selection_count: ({ count }: { count: number }) => `Вибрано: ${count}`,
  selection_cleared: () => "Виділення знято",
  item_selected: ({ name }: { name: string }) => `${name}, виділено`,
  item_deselected: ({ name }: { name: string }) => `${name}, знято`,
}));

vi.mock("../../lib/tauri", () => ({
  deleteProfiles: vi.fn().mockResolvedValue({ deleted: ["Jazz"], skippedActive: true }),
}));

const profiles: ProfileMeta[] = [
  { name: "Default", streamCount: 2, isActive: true },
  { name: "Jazz", streamCount: 5, isActive: false },
  { name: "Rock", streamCount: 3, isActive: false },
];

function renderList(activeProfile = "Default", handlers = {}) {
  const ref = createRef<ProfileListHandle>();
  const h = {
    onSwitch: vi.fn(), onDuplicate: vi.fn(), onRename: vi.fn(),
    onDelete: vi.fn(), onExport: vi.fn(), onSettings: vi.fn(), exitZone: vi.fn(), ...handlers,
  };
  const utils = render(
    <ProfileList ref={ref} profiles={profiles} activeProfile={activeProfile} {...h} />,
  );
  return { ref, ...h, ...utils };
}

const activeAttrs = () => ({
  id: document.activeElement?.getAttribute("data-item-id") ?? null,
  seg: document.activeElement?.getAttribute("data-segment") ?? null,
});

beforeEach(() => {
  vi.clearAllMocks();
  $profileList.set(profiles);
  replaceSelection($profilesSelection, new Set());
});

describe("ProfileList — composite navigation", () => {
  it("renders one row per profile, each described as a profile", () => {
    const { container } = renderList();
    const rows = container.querySelectorAll('li[data-segment="summary"]');
    expect(rows).toHaveLength(3);
    rows.forEach((li) => expect(li.getAttribute("aria-roledescription")).toBe("профіль"));
  });

  it("exposes the list as an application region", () => {
    const { container } = renderList();
    const ul = container.querySelector("ul")!;
    expect(ul.getAttribute("role")).toBe("application");
    expect(ul.getAttribute("data-zone-id")).toBe("profiles-list");
    expect(ul.getAttribute("aria-label")).toBe("Список профілів");
  });

  it("focuses the first row on entry; ArrowDown moves to the next row", () => {
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    expect(activeAttrs()).toEqual({ id: "Default", seg: "summary" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(activeAttrs()).toEqual({ id: "Jazz", seg: "summary" });
  });

  it("Right drills into enabled segments, skipping disabled actions on the active row", () => {
    const { ref } = renderList();
    act(() => ref.current!.focus("forward")); // Default (active) summary
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    // Default is active → no switch; first stop is duplicate.
    expect(activeAttrs()).toEqual({ id: "Default", seg: "action-duplicate" });
  });

  it("Enter on a row summary triggers onSwitch with the row name", () => {
    const { ref, onSwitch } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" }); // Jazz
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onSwitch).toHaveBeenCalledWith("Jazz");
  });

  it("Delete key triggers onDelete with the row name", () => {
    const { ref, onDelete } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" }); // Jazz
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    expect(onDelete).toHaveBeenCalledWith("Jazz");
  });

  it("Tab exits the zone forward", () => {
    const { ref, exitZone } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(exitZone).toHaveBeenCalledWith(true);
  });

  it("focusProfile(name) moves focus to that row's summary", () => {
    const { ref } = renderList();
    act(() => ref.current!.focusProfile("Rock"));
    expect(activeAttrs()).toEqual({ id: "Rock", seg: "summary" });
  });
});

describe("ProfileList — bulk delete", () => {
  it("skips the active profile and announces the partial-success tail", async () => {
    replaceSelection($profilesSelection, new Set(["Default", "Jazz"]));
    const { ref, getByRole } = renderList();
    act(() => ref.current!.requestBulkDelete());
    fireEvent.click(getByRole("button", { name: m.profile_delete() }));
    await waitFor(() => expect(tauri.deleteProfiles).toHaveBeenCalledWith(["Default", "Jazz"]));
    await waitFor(() => expect($profileList.get().map((p) => p.name)).toEqual(["Default", "Rock"]));
    expect($announcer.get()?.message).toBe(
      `${m.profiles_removed_bulk({ count: 1 })}, ${m.bulk_skipped_active()}`,
    );
  });

  it("full-skip (only active selected) announces without mutating the store", async () => {
    vi.mocked(tauri.deleteProfiles).mockResolvedValueOnce({ deleted: [], skippedActive: true });
    replaceSelection($profilesSelection, new Set(["Default"]));
    const { ref, getByRole } = renderList();
    act(() => ref.current!.requestBulkDelete());
    fireEvent.click(getByRole("button", { name: m.profile_delete() }));
    await waitFor(() => expect(tauri.deleteProfiles).toHaveBeenCalledWith(["Default"]));
    // Store unchanged — active "Default" was skipped, so only Default+Rock+Jazz still present...
    // Actually store was set to all 3 profiles in beforeEach, so it remains 3 after full-skip.
    await waitFor(() => expect($profileList.get().map((p) => p.name)).toEqual(["Default", "Jazz", "Rock"]));
    expect($announcer.get()?.message).toBe(
      `${m.profiles_removed_bulk({ count: 0 })}, ${m.bulk_skipped_active()}`,
    );
  });
});
