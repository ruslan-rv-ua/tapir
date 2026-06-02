import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { ProfileMeta } from "../../lib/tauri";
import { ProfileItem, getProfileSegments } from "./ProfileItem";

vi.mock("../../i18n/paraglide/runtime", () => ({ getLocale: () => "uk" }));
vi.mock("../../i18n/paraglide/messages", () => ({
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
  profile_switch_named: ({ name }: { name: string }) => `Перемкнутися на ${name}`,
  profile_duplicate_named: ({ name }: { name: string }) => `Дублювати ${name}`,
  profile_rename_named: ({ name }: { name: string }) => `Перейменувати ${name}`,
  profile_delete_named: ({ name }: { name: string }) => `Видалити ${name}`,
  profile_export_named: ({ name }: { name: string }) => `Експортувати ${name}`,
  profile_stream_count_one: ({ count }: { count: number }) => `${count} потік`,
  profile_stream_count_few: ({ count }: { count: number }) => `${count} потоки`,
  profile_stream_count_many: ({ count }: { count: number }) => `${count} потоків`,
  profile_stream_count_other: ({ count }: { count: number }) => `${count} потоки`,
}));

const mk = (over: Partial<ProfileMeta> = {}): ProfileMeta => ({
  name: "Jazz", streamCount: 5, isActive: false, ...over,
});

function renderItem(profile: ProfileMeta, activeProfile: string, handlers = {}) {
  const h = {
    onSwitch: vi.fn(), onDuplicate: vi.fn(), onRename: vi.fn(),
    onDelete: vi.fn(), onExport: vi.fn(), ...handlers,
  };
  const utils = render(
    <ul>
      <ProfileItem
        profile={profile}
        activeProfile={activeProfile}
        isActiveRow
        isFocused={(seg) => seg === "summary"}
        {...h}
      />
    </ul>,
  );
  return { ...utils, ...h };
}

describe("getProfileSegments", () => {
  it("omits switch on the active row", () => {
    expect(getProfileSegments(mk({ name: "Jazz" }), "Jazz")).toEqual([
      "action-duplicate", "action-export", "action-menu",
    ]);
  });
  it("omits rename+delete for Default", () => {
    expect(getProfileSegments(mk({ name: "Default" }), "Jazz")).toEqual([
      "action-switch", "action-duplicate", "action-export", "action-menu",
    ]);
  });
  it("includes all actions for a non-active, non-Default row", () => {
    expect(getProfileSegments(mk({ name: "Jazz" }), "Default")).toEqual([
      "action-switch", "action-duplicate", "action-rename",
      "action-delete", "action-export", "action-menu",
    ]);
  });
});

describe("ProfileItem — row structure & a11y", () => {
  it("renders the row as a listitem described as a profile, labelled with name + count", () => {
    const { container } = renderItem(mk(), "Default");
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("role")).toBe("listitem");
    expect(li.getAttribute("aria-roledescription")).toBe("профіль");
    expect(li.getAttribute("aria-label")).toBe("Jazz, 5 потоків");
    expect(li.tabIndex).toBe(0);
  });

  it("folds the active state into the row label and shows a check icon", () => {
    const { container } = renderItem(mk({ name: "Default", streamCount: 2, isActive: true }), "Default");
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toBe("Default, активний, 2 потоки");
    // The check icon is decorative.
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders only the enabled actions as button focus stops (active row)", () => {
    const { container } = renderItem(mk({ name: "Jazz", isActive: true }), "Jazz");
    const segs = Array.from(container.querySelectorAll("button[data-segment]"))
      .map((b) => b.getAttribute("data-segment"));
    expect(segs).toEqual(["action-duplicate", "action-export", "action-menu"]);
  });

  it("inline buttons call their handlers with the profile name", () => {
    const { container, onDuplicate, onExport } = renderItem(mk({ name: "Jazz" }), "Jazz");
    fireEvent.click(container.querySelector('button[data-segment="action-duplicate"]')!);
    expect(onDuplicate).toHaveBeenCalledWith("Jazz");
    fireEvent.click(container.querySelector('button[data-segment="action-export"]')!);
    expect(onExport).toHaveBeenCalledWith("Jazz");
  });

  it("wraps actions in a labelled group", () => {
    const { container } = renderItem(mk({ name: "Jazz" }), "Default");
    const group = container.querySelector('[role="group"]')!;
    expect(group.getAttribute("aria-label")).toBe("Дії для профілю Jazz");
  });
});
