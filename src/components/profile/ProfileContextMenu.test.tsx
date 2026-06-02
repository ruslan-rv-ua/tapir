import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import type { ProfileMeta } from "../../lib/tauri";
import { ProfileContextMenu } from "./ProfileContextMenu";

vi.mock("../../i18n/paraglide/messages", () => ({
  profile_actions: ({ name }: { name: string }) => `Дії для ${name}`,
  profile_context_menu: () => "Контекстне меню профілю",
  profile_switch: () => "Перемкнутися",
  profile_duplicate: () => "Дублювати",
  profile_rename: () => "Перейменувати",
  profile_delete: () => "Видалити",
  profile_export: () => "Експортувати",
}));

const mk = (over: Partial<ProfileMeta> = {}): ProfileMeta => ({
  name: "Jazz", streamCount: 5, isActive: false, ...over,
});

function renderMenu(profile: ProfileMeta, isActive: boolean, isDefault: boolean) {
  const h = {
    onSwitch: vi.fn(), onDuplicate: vi.fn(), onRename: vi.fn(),
    onDelete: vi.fn(), onExport: vi.fn(),
  };
  const utils = render(
    <ProfileContextMenu profile={profile} isActive={isActive} isDefault={isDefault} menuFocused {...h} />,
  );
  return { ...utils, ...h };
}

describe("ProfileContextMenu", () => {
  it("renders a trigger labelled for the profile and tagged as the menu segment", () => {
    const { container } = renderMenu(mk(), false, false);
    const trigger = container.querySelector('button[data-segment="action-menu"]')!;
    expect(trigger.getAttribute("aria-label")).toBe("Дії для Jazz");
    expect(trigger.hasAttribute("data-context-menu-trigger")).toBe(true);
  });

  it("opens to show all five actions; clicking one calls its handler", async () => {
    const { container, onRename } = renderMenu(mk(), false, false);
    fireEvent.click(container.querySelector('button[data-segment="action-menu"]')!);
    const items = await screen.findAllByRole("menuitem");
    expect(items).toHaveLength(5);
    fireEvent.click(screen.getByRole("menuitem", { name: "Перейменувати" }));
    expect(onRename).toHaveBeenCalled();
  });

  it("disables switch on the active profile", async () => {
    const { container } = renderMenu(mk({ name: "Jazz", isActive: true }), true, false);
    fireEvent.click(container.querySelector('button[data-segment="action-menu"]')!);
    const switchItem = await screen.findByRole("menuitem", { name: "Перемкнутися" });
    expect(switchItem.getAttribute("aria-disabled")).toBe("true");
  });

  it("disables rename and delete for Default", async () => {
    const { container } = renderMenu(mk({ name: "Default" }), false, true);
    fireEvent.click(container.querySelector('button[data-segment="action-menu"]')!);
    expect((await screen.findByRole("menuitem", { name: "Перейменувати" })).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Видалити" }).getAttribute("aria-disabled")).toBe("true");
  });
});
