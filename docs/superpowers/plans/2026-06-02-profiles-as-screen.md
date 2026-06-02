# Profiles-as-Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перетворити модальний менеджер профілів `ProfileManager` на повноцінний екран `ProfilesPanel`, інтегрований у зональну навігацію поряд зі Streams/Browser/Wishlist/Songs.

**Architecture:** Новий екран `ProfilesPanel` реєструє 3 зони (тулбар / список / дії) через `onZonesChange`, як `StreamsPanel`. Під-операції — однорівневі діалоги (`ProfileNameDialog` + `ConfirmDialog`) через `createPortal`. `ProfileActions` стає roving-зоною. У `ActivityBar` кнопка профілю піднімається нагору з divider і перемикає `$activeSection`. Стара модалка та стор `$profileManagerOpen` видаляються.

**Tech Stack:** React 19, react-aria-components, nanostores, lucide-react, Tailwind v4, paraglide i18n; тести — Vitest + @testing-library/react + user-event.

**Spec:** [docs/superpowers/specs/2026-06-02-profiles-as-screen-design.md](../specs/2026-06-02-profiles-as-screen-design.md)
**ADR:** [docs/decisions/2026-06-02-profiles-as-screen.md](../../decisions/2026-06-02-profiles-as-screen.md)

---

## File Structure

**Create:**
- `src/components/profile/ProfileNameDialog.tsx` — діалог вводу імені (create/rename/duplicate/import).
- `src/components/profile/ProfilesPanel.tsx` — екран; CRUD-логіка + 3 зони + під-діалоги.
- `src/components/profile/ProfilesPanel.test.tsx` — тести екрана (мігровані з `ProfileManager.test.tsx`).

**Modify:**
- `src/stores/navigation.ts` — `Section` += `"profiles"`.
- `src/i18n/messages/en.json`, `uk.json` — ключ `zone_profiles_toolbar`.
- `src/components/profile/ProfileActions.tsx` — roving-зона (forwardRef `ZoneEntry`), прибрати New/Import.
- `src/components/profile/ProfileActions.test.tsx` — оновити під новий набір кнопок.
- `src/App.tsx` — рендер `ProfilesPanel`, прибрати `<ProfileManager />`.
- `src/components/layout/ActivityBar.tsx` — профіль нагору + divider + `aria-pressed` + `$activeSection` + launch-фокус.
- `src/components/layout/ActivityBar.test.tsx` — новий порядок/семантика.

**Delete:**
- `src/components/profile/ProfileManager.tsx`
- `src/components/profile/ProfileManager.test.tsx`
- `$profileManagerOpen` зі `src/stores/profileManager.ts` (лишити `$profileList`).

**Commands:**
- Один тест-файл: `pnpm exec vitest run <path>`
- Усі тести: `pnpm test`
- Регенерація i18n + збірка фронту: `pnpm vite:build`

---

## Task 1: Section union + i18n key

**Files:**
- Modify: `src/stores/navigation.ts:3`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/uk.json`

- [ ] **Step 1: Add `"profiles"` to the Section union**

У `src/stores/navigation.ts` замінити рядок типу:

```ts
export type Section = "streams" | "browser" | "wishlist" | "schedule" | "songs" | "profiles";
```

- [ ] **Step 2: Add the toolbar zone i18n key (uk)**

У `src/i18n/messages/uk.json` після рядка `"zone_streams_toolbar": "Пошук і фільтри",` додати:

```json
  "zone_profiles_toolbar": "Дії з профілями",
```

(Зона дій перевикористовує наявний ключ `profile_actions_label` = «Дії профілю».)

- [ ] **Step 3: Add the toolbar zone i18n key (en)**

У `src/i18n/messages/en.json` додати аналогічний ключ поряд із `zone_streams_toolbar`:

```json
  "zone_profiles_toolbar": "Profile actions",
```

- [ ] **Step 4: Regenerate paraglide messages and verify the front-end compiles**

Run: `pnpm vite:build`
Expected: збірка проходить; згенерований модуль `src/i18n/paraglide/messages` тепер містить функцію `zone_profiles_toolbar`.

- [ ] **Step 5: Run the full test suite (nothing should break)**

Run: `pnpm test`
Expected: усі наявні тести PASS (зміна типу + новий ключ нічого не ламають).

- [ ] **Step 6: Commit**

```bash
git add src/stores/navigation.ts src/i18n/messages/en.json src/i18n/messages/uk.json
git commit -m "feat(nav): add profiles section type + zone i18n key"
```

---

## Task 2: ProfileNameDialog (extract name-input dialog)

**Files:**
- Create: `src/components/profile/ProfileNameDialog.tsx`
- Test: `src/components/profile/ProfileNameDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Створити `src/components/profile/ProfileNameDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileNameDialog } from "./ProfileNameDialog";

vi.mock("../../i18n/paraglide/messages", () => ({
  profile_new_name_label: () => "New name",
  cancel: () => "Cancel",
  ok: () => "OK",
}));

const baseProps = {
  title: "New profile",
  value: "",
  error: null as string | null,
  busy: false,
  onChange: () => {},
  onConfirm: () => {},
  onCancel: () => {},
};

describe("ProfileNameDialog", () => {
  it("renders the title and a localized OK button", () => {
    render(<ProfileNameDialog {...baseProps} />);
    expect(screen.getByRole("button", { name: /^OK$/ })).toBeInTheDocument();
    expect(screen.getByText("New profile")).toBeInTheDocument();
  });

  it("disables OK when the value is empty", () => {
    render(<ProfileNameDialog {...baseProps} value="   " />);
    expect(screen.getByRole("button", { name: /^OK$/ })).toBeDisabled();
  });

  it("shows the error text with role=alert", () => {
    render(<ProfileNameDialog {...baseProps} value="X" error="Conflict" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Conflict");
  });

  it("calls onConfirm when OK is clicked", async () => {
    const onConfirm = vi.fn();
    render(<ProfileNameDialog {...baseProps} value="Jazz" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: /^OK$/ }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("gives footer buttons a visible focus outline class", () => {
    render(<ProfileNameDialog {...baseProps} />);
    expect(screen.getByRole("button", { name: /Cancel/ }).className).toMatch(/focus-visible:outline/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/profile/ProfileNameDialog.test.tsx`
Expected: FAIL — `Failed to resolve import "./ProfileNameDialog"`.

- [ ] **Step 3: Write the component**

Створити `src/components/profile/ProfileNameDialog.tsx`:

```tsx
import {
  Modal, ModalOverlay, Dialog, Heading, TextField, Input, Label,
} from "react-aria-components";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  title: string;
  value: string;
  error: string | null;
  busy: boolean;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ProfileNameDialog({ title, value, error, busy, onChange, onConfirm, onCancel }: Props) {
  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      isOpen
      onOpenChange={(open) => { if (!open) onCancel(); }}
    >
      <Modal className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog role="alertdialog" className="outline-none flex flex-col gap-4">
          <Heading slot="title" className="text-base font-semibold text-slate-100">{title}</Heading>
          <TextField
            autoFocus
            value={value}
            onChange={onChange}
            isInvalid={!!error}
            className="flex flex-col gap-1"
          >
            <Label className="text-sm text-slate-300">{m.profile_new_name_label()}</Label>
            <Input className="rounded bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
            {error && <span role="alert" className="text-xs text-red-400">{error}</span>}
          </TextField>
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:text-[ButtonText]"
            >
              {m.cancel()}
            </button>
            <button
              onClick={onConfirm}
              disabled={busy || !value.trim()}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
            >
              {m.ok()}
            </button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/profile/ProfileNameDialog.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/ProfileNameDialog.tsx src/components/profile/ProfileNameDialog.test.tsx
git commit -m "feat(profile): extract ProfileNameDialog from modal"
```

---

## Task 3: ProfileActions → roving zone

`ProfileActions` стає зоною `profiles-actions`: roving по вертикалі, `forwardRef` віддає `ZoneEntry`, New/Import прибрані (вони переїжджають у тулбар екрана).

**Files:**
- Modify: `src/components/profile/ProfileActions.tsx`
- Modify: `src/components/profile/ProfileActions.test.tsx`

- [ ] **Step 1: Update the test to the new button set + zone semantics**

Замінити вміст `src/components/profile/ProfileActions.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render } from "@testing-library/react";
import { ProfileActions } from "./ProfileActions";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";

vi.mock("../../i18n/paraglide/messages", () => ({
  profile_switch: () => "Switch",
  profile_rename: () => "Rename",
  profile_delete: () => "Delete",
  profile_duplicate: () => "Duplicate",
  profile_export: () => "Export",
  profile_actions_label: () => "Profile actions",
  profile_group_profile: () => "Profile",
  profile_group_file: () => "File",
}));

const baseProps = {
  selected: "Jazz",
  activeProfile: "Default",
  onSwitch: vi.fn(), onRename: vi.fn(), onDelete: vi.fn(),
  onDuplicate: vi.fn(), onExport: vi.fn(), exitZone: vi.fn(),
};

describe("ProfileActions", () => {
  it("disables Switch when selected is active", () => {
    const { getByRole } = render(
      <ProfileActions {...baseProps} selected="Default" activeProfile="Default" />
    );
    expect(getByRole("button", { name: /switch/i })).toBeDisabled();
  });

  it("enables Switch when selected is not active", () => {
    const { getByRole } = render(
      <ProfileActions {...baseProps} selected="Jazz" activeProfile="Default" />
    );
    expect(getByRole("button", { name: /switch/i })).not.toBeDisabled();
  });

  it("disables Rename when selected is Default", () => {
    const { getByRole } = render(
      <ProfileActions {...baseProps} selected="Default" activeProfile="Jazz" />
    );
    expect(getByRole("button", { name: /rename/i })).toBeDisabled();
  });

  it("disables Delete when selected is Default", () => {
    const { getByRole } = render(
      <ProfileActions {...baseProps} selected="Default" activeProfile="Jazz" />
    );
    expect(getByRole("button", { name: /delete/i })).toBeDisabled();
  });

  it("renders the group captions", () => {
    const { getByText } = render(<ProfileActions {...baseProps} />);
    expect(getByText("Profile")).toBeInTheDocument();
    expect(getByText("File")).toBeInTheDocument();
  });

  it("orders buttons: Switch, Duplicate, Rename, Delete, Export", () => {
    const { getAllByRole } = render(<ProfileActions {...baseProps} />);
    const names = getAllByRole("button").map((b) => b.textContent?.trim());
    expect(names).toEqual(["Switch", "Duplicate", "Rename", "Delete", "Export"]);
  });

  it("exposes a ZoneEntry handle with id 'profiles-actions'", () => {
    const ref = createRef<ZoneEntry>();
    render(<ProfileActions ref={ref} {...baseProps} />);
    expect(ref.current?.id).toBe("profiles-actions");
    expect(typeof ref.current?.focus).toBe("function");
  });

  it("wraps actions in an application zone with data-zone-id", () => {
    const { container } = render(<ProfileActions {...baseProps} />);
    const zone = container.querySelector('[data-zone-id="profiles-actions"]');
    expect(zone).toBeTruthy();
    expect(zone?.getAttribute("role")).toBe("application");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/profile/ProfileActions.test.tsx`
Expected: FAIL (ordering expects old 7-button set; no `data-zone-id`; no ref handle).

- [ ] **Step 3: Rewrite ProfileActions as a zone**

Замінити вміст `src/components/profile/ProfileActions.tsx`:

```tsx
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Button } from "react-aria-components";
import { ArrowRightLeft, Copy, Pencil, Trash2, Upload } from "lucide-react";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  selected: string;
  activeProfile: string;
  busy?: boolean;
  onSwitch: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  exitZone: (forward: boolean) => void;
}

export const ProfileActions = forwardRef<ZoneEntry, Props>(function ProfileActions(
  { selected, activeProfile, busy, onSwitch, onRename, onDelete, onDuplicate, onExport, exitZone },
  ref,
) {
  const isActive = selected === activeProfile;
  const isDefault = selected === "Default";

  const containerRef = useRef<HTMLDivElement | null>(null);
  const switchRef = useRef<HTMLButtonElement | null>(null);
  const duplicateRef = useRef<HTMLButtonElement | null>(null);
  const renameRef = useRef<HTMLButtonElement | null>(null);
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const exportRef = useRef<HTMLButtonElement | null>(null);
  const refs = useMemo(
    () => [switchRef, duplicateRef, renameRef, deleteRef, exportRef],
    [],
  );

  const { onKeyDown, getTabIndex, restoreFocus } = useRovingFocus(refs, "vertical", {
    mode: "mixed-boundary-handoff",
    onTabBoundary: exitZone,
  });

  useImperativeHandle(ref, () => ({
    id: "profiles-actions",
    get el() { return containerRef.current!; },
    focus: restoreFocus,
  }), [restoreFocus]);

  return (
    <div
      ref={containerRef}
      data-zone-id="profiles-actions"
      role="application"
      aria-label={m.profile_actions_label()}
      className="flex flex-col gap-2"
      onKeyDown={onKeyDown}
    >
      <ActionButton btnRef={switchRef} excludeFromTabOrder={getTabIndex(0) === -1} onPress={onSwitch} isDisabled={isActive || busy} variant="primary" icon={ArrowRightLeft}>
        {m.profile_switch()}
      </ActionButton>

      <GroupCaption>{m.profile_group_profile()}</GroupCaption>
      <ActionButton btnRef={duplicateRef} excludeFromTabOrder={getTabIndex(1) === -1} onPress={onDuplicate} isDisabled={busy} icon={Copy}>
        {m.profile_duplicate()}
      </ActionButton>
      <ActionButton btnRef={renameRef} excludeFromTabOrder={getTabIndex(2) === -1} onPress={onRename} isDisabled={isDefault || isActive || busy} icon={Pencil}>
        {m.profile_rename()}
      </ActionButton>
      <ActionButton btnRef={deleteRef} excludeFromTabOrder={getTabIndex(3) === -1} onPress={onDelete} isDisabled={isDefault || isActive || busy} icon={Trash2}>
        {m.profile_delete()}
      </ActionButton>

      <GroupCaption>{m.profile_group_file()}</GroupCaption>
      <ActionButton btnRef={exportRef} excludeFromTabOrder={getTabIndex(4) === -1} onPress={onExport} isDisabled={busy} icon={Upload}>
        {m.profile_export()}
      </ActionButton>
    </div>
  );
});

function GroupCaption({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="mt-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </span>
  );
}

function ActionButton({
  children,
  onPress,
  isDisabled,
  icon: Icon,
  variant = "default",
  btnRef,
  excludeFromTabOrder,
}: {
  children: React.ReactNode;
  onPress: () => void;
  isDisabled?: boolean;
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  variant?: "default" | "primary";
  btnRef: React.RefObject<HTMLButtonElement | null>;
  excludeFromTabOrder: boolean;
}) {
  const base =
    "w-full px-3 py-1.5 text-sm text-left rounded flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight] transition-colors";
  const variantClass =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
      : "bg-white/[.04] text-slate-300 hover:bg-white/[.08] forced-colors:text-[ButtonText] forced-colors:disabled:text-[GrayText]";
  return (
    <Button ref={btnRef} onPress={onPress} isDisabled={isDisabled} excludeFromTabOrder={excludeFromTabOrder} className={`${base} ${variantClass}`}>
      <Icon size={14} aria-hidden className="opacity-70 shrink-0" />
      {children}
    </Button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/profile/ProfileActions.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/ProfileActions.tsx src/components/profile/ProfileActions.test.tsx
git commit -m "feat(profile): make ProfileActions a roving zone, drop New/Import"
```

---

## Task 4: ProfilesPanel (the screen)

Новий екран із CRUD-логікою (перенесеною з `ProfileManager`), 3 зонами та однорівневими під-діалогами.

**Files:**
- Create: `src/components/profile/ProfilesPanel.tsx`
- Create: `src/components/profile/ProfilesPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Створити `src/components/profile/ProfilesPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfilesPanel } from "./ProfilesPanel";
import { $profileList } from "../../stores/profileManager";
import { $settings } from "../../stores/settings";
import { $announcer } from "../../stores/announcer";
import type { ProfileMeta } from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  listProfiles: vi.fn(async () => [
    { name: "Default", streamCount: 2, isActive: true },
    { name: "Jazz", streamCount: 5, isActive: false },
  ] as ProfileMeta[]),
  switchProfile: vi.fn(async () => ({})),
  deleteProfile: vi.fn(async () => {}),
  createProfile: vi.fn(async (name: string) => ({ name, streamCount: 0, isActive: false })),
  getAllStatuses: vi.fn(async () => []),
  exportProfile: vi.fn(async () => {}),
}));

vi.mock("../../i18n/paraglide/runtime", () => ({ getLocale: () => "uk" }));

vi.mock("../../i18n/paraglide/messages", () => ({
  profile_name: () => "Profile",
  zone_profiles_toolbar: () => "Profile actions toolbar",
  command_palette_label: () => "Command palette",
  commands_label: () => "Commands",
  profile_list_label: () => "Profiles",
  profile_active_badge: () => "active",
  profile_stream_count_one: ({ count }: { count: number }) => `${count} потік`,
  profile_stream_count_few: ({ count }: { count: number }) => `${count} потоки`,
  profile_stream_count_many: ({ count }: { count: number }) => `${count} потоків`,
  profile_stream_count_other: ({ count }: { count: number }) => `${count} потоки`,
  profile_switch: () => "Switch",
  profile_rename: () => "Rename",
  profile_delete: () => "Delete",
  profile_duplicate: () => "Duplicate",
  profile_export: () => "Export",
  profile_import: () => "Import",
  profile_create: () => "New profile",
  profile_actions_label: () => "Profile actions",
  profile_group_profile: () => "Profile",
  profile_group_file: () => "File",
  profile_new_name_label: () => "New name",
  profile_conflict_error: () => "Conflict",
  profile_delete_confirm: ({ name }: { name: string }) => `Delete ${name}?`,
  profile_switch_confirm: ({ name }: { name: string }) => `Switch to ${name}?`,
  profile_exported_announcement: ({ name }: { name: string }) => `Exported ${name}`,
  cancel: () => "Cancel",
  ok: () => "OK",
}));

function renderPanel() {
  return render(<ProfilesPanel onZonesChange={() => {}} exitZone={() => {}} />);
}

describe("ProfilesPanel", () => {
  beforeEach(() => {
    $profileList.set([
      { name: "Default", streamCount: 2, isActive: true },
      { name: "Jazz", streamCount: 5, isActive: false },
    ]);
    $settings.set({ activeProfile: "Default" } as Parameters<typeof $settings.set>[0]);
    $announcer.set({ message: "", priority: "polite" });
  });

  it("registers three zones via onZonesChange", () => {
    const onZonesChange = vi.fn();
    render(<ProfilesPanel onZonesChange={onZonesChange} exitZone={() => {}} />);
    const zones = onZonesChange.mock.calls.at(-1)![0] as { id: string }[];
    expect(zones.map((z) => z.id)).toEqual([
      "profiles-toolbar", "profiles-list", "profiles-actions",
    ]);
  });

  it("renders the screen region and both profiles", async () => {
    renderPanel();
    await screen.findByText("Default");
    expect(screen.getByText("Jazz")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Profile" })).toBeInTheDocument();
  });

  it("has New and Import in the toolbar, not in the actions panel", async () => {
    renderPanel();
    await screen.findByText("Jazz");
    const toolbar = document.querySelector('[data-zone-id="profiles-toolbar"]')!;
    expect(toolbar.querySelector("button")).toBeTruthy();
    expect(within(toolbar).getByRole("button", { name: /New profile/ })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: /Import/ })).toBeInTheDocument();
  });

  it("returns focus to the selected profile after Switch", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("option", { name: /Jazz/ }));
    await user.click(screen.getByRole("button", { name: /^Switch$/ }));
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("option", { name: /Jazz/ }));
    });
  });

  it("returns focus to Default after Delete", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("option", { name: /Jazz/ }));
    await user.click(screen.getByRole("button", { name: /^Delete$/ }));
    await screen.findByText("Delete Jazz?");
    await user.click(screen.getAllByRole("button", { name: /^Delete$/ })[0]);
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("option", { name: /Default/ }));
    });
  });

  it("opens the name dialog from the toolbar New button", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("button", { name: /New profile/ }));
    expect(await screen.findByRole("button", { name: /^OK$/ })).toBeInTheDocument();
  });

  it("announces after a successful export", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("option", { name: /Jazz/ }));
    await user.click(screen.getByRole("button", { name: /^Export$/ }));
    await waitFor(() => expect($announcer.get().message).toBe("Exported Jazz"));
  });
});
```

Додати до імпортів тесту `within`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/profile/ProfilesPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./ProfilesPanel"`.

- [ ] **Step 3: Write ProfilesPanel**

Створити `src/components/profile/ProfilesPanel.tsx`:

```tsx
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import { $profileList } from "../../stores/profileManager";
import { $settings } from "../../stores/settings";
import { $commandPaletteOpen } from "../../stores/navigation";
import { ProfileList, type ProfileListHandle } from "./ProfileList";
import { ProfileActions } from "./ProfileActions";
import { ProfileNameDialog } from "./ProfileNameDialog";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { useAnnounce } from "../../hooks/useAnnounce";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as tauri from "../../lib/tauri";
import type { ImportPreview } from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

type SubDialog =
  | null
  | { type: "create" }
  | { type: "rename" }
  | { type: "duplicate" }
  | { type: "delete" }
  | { type: "switch-confirm" }
  | { type: "import"; preview: ImportPreview };

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

export function ProfilesPanel({ onZonesChange, exitZone }: Props) {
  const profiles = useStore($profileList);
  const settings = useStore($settings);
  const activeProfile = settings?.activeProfile ?? "Default";
  const announce = useAnnounce();

  const [selected, setSelected] = useState(activeProfile);
  const [subDialog, setSubDialog] = useState<SubDialog>(null);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const listRef = useRef<ProfileListHandle>(null);
  const listWrapperRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<ZoneEntry | null>(null);

  // ── Load profiles on mount / active-profile change ──
  useEffect(() => {
    setSelected(activeProfile);
    tauri.listProfiles()
      .then((list) => $profileList.set(list))
      .catch((e) => addToast(String(e), "error"));
  }, [activeProfile]);

  const refreshList = async () => {
    const list = await tauri.listProfiles();
    $profileList.set(list);
  };

  // After switch/delete the trigger button becomes disabled; return focus to the
  // list. rAF ensures the disabled state has committed before we move focus.
  const refocusList = () => {
    requestAnimationFrame(() => listRef.current?.focusSelected());
  };

  const handleError = (e: unknown) => {
    const msg = String(e);
    if (msg.startsWith("Conflict:") || msg.startsWith("InvalidName:")) {
      setNameError(msg.replace(/^(Conflict|InvalidName): /, ""));
    } else {
      addToast(msg, "error");
    }
  };

  const handleSwitch = async () => {
    try {
      const statuses = await tauri.getAllStatuses?.() ?? [];
      const hasRecordings = statuses.some((s) => s.state === "recording");
      if (hasRecordings) { setSubDialog({ type: "switch-confirm" }); return; }
      doSwitch();
    } catch (e) { addToast(String(e), "error"); }
  };

  const doSwitch = async () => {
    setBusy(true);
    try {
      await tauri.switchProfile(selected);
      await refreshList();
      announce(m.profile_switch() + ": " + selected);
      setSubDialog(null);
      refocusList();
    } catch (e) { addToast(String(e), "error"); }
    finally { setBusy(false); }
  };

  const handleCreate = async () => {
    setNameError(null); setBusy(true);
    try {
      const meta = await tauri.createProfile(nameInput.trim());
      await refreshList(); setSelected(meta.name);
      announce(m.profile_create() + ": " + meta.name);
      setSubDialog(null); setNameInput("");
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const handleRename = async () => {
    setNameError(null); setBusy(true);
    try {
      const meta = await tauri.renameProfile(selected, nameInput.trim());
      await refreshList(); setSelected(meta.name);
      announce(m.profile_rename() + ": " + meta.name);
      setSubDialog(null); setNameInput("");
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const handleDuplicate = async () => {
    setNameError(null); setBusy(true);
    try {
      const meta = await tauri.duplicateProfile(selected, nameInput.trim());
      await refreshList(); setSelected(meta.name);
      announce(m.profile_duplicate() + ": " + meta.name);
      setSubDialog(null); setNameInput("");
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await tauri.deleteProfile(selected);
      await refreshList(); setSelected("Default");
      announce(m.profile_delete() + ": " + selected);
      setSubDialog(null); refocusList();
    } catch (e) { addToast(String(e), "error"); } finally { setBusy(false); }
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      await tauri.exportProfile(selected);
      announce(m.profile_exported_announcement({ name: selected }));
    } catch (e) { addToast(String(e), "error"); } finally { setBusy(false); }
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const preview = await tauri.beginImport();
      if (!preview) return;
      setNameInput(preview.suggestedName);
      setNameError(preview.hasConflict ? m.profile_conflict_error() : null);
      setSubDialog({ type: "import", preview });
    } catch (e) { addToast(String(e), "error"); } finally { setBusy(false); }
  };

  const handleCommitImport = async () => {
    if (!subDialog || subDialog.type !== "import") return;
    setNameError(null); setBusy(true);
    try {
      const meta = await tauri.commitImport(subDialog.preview.profileJson, nameInput.trim());
      await refreshList(); setSelected(meta.name);
      announce(m.profile_import() + ": " + meta.name);
      setSubDialog(null); setNameInput("");
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  // ── Toolbar zone (3 items) ──
  const toolbarZoneRef = useRef<HTMLDivElement | null>(null);
  const cmdBtn = useRef<HTMLButtonElement | null>(null);
  const newBtn = useRef<HTMLButtonElement | null>(null);
  const importBtn = useRef<HTMLButtonElement | null>(null);
  const toolbarRefs = useMemo(() => [cmdBtn, newBtn, importBtn], []);
  const {
    onKeyDown: toolbarKeyDown,
    getTabIndex: toolbarTabIndex,
    restoreFocus: toolbarRestore,
  } = useRovingFocus(toolbarRefs, "horizontal", {
    mode: "mixed-boundary-handoff",
    onTabBoundary: (forward) => exitZone("profiles-toolbar", forward),
  });

  // ── Zone registration (static: toolbar / list / actions) ──
  useEffect(() => {
    const toolbarZone: ZoneEntry = {
      id: "profiles-toolbar",
      get el() { return toolbarZoneRef.current!; },
      focus: toolbarRestore,
    };
    const listZone: ZoneEntry = {
      id: "profiles-list",
      get el() { return listWrapperRef.current!; },
      focus: () => listRef.current?.focusSelected(),
    };
    const actionsZone: ZoneEntry = {
      id: "profiles-actions",
      get el() { return actionsRef.current!.el; },
      focus: (dir) => actionsRef.current?.focus(dir),
    };
    onZonesChange([toolbarZone, listZone, actionsZone]);
  // onZonesChange must be a stable reference from the caller.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolbarRestore]);

  // List is a single tab-stop zone — any Tab exits to the next/prev zone.
  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      exitZone("profiles-list", !e.shiftKey);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden" role="region" aria-label={m.profile_name()}>
      {/* ── Toolbar zone ── */}
      <div
        ref={toolbarZoneRef}
        data-zone-id="profiles-toolbar"
        role="application"
        aria-label={m.zone_profiles_toolbar()}
        className="border-b border-slate-700 forced-colors:border-[ButtonText]"
        onKeyDown={toolbarKeyDown}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-base font-semibold text-slate-100">{m.profile_name()}</h1>
          <div className="flex items-center gap-2">
            <button
              ref={cmdBtn}
              tabIndex={toolbarTabIndex(0)}
              aria-label={m.command_palette_label()}
              onClick={() => $commandPaletteOpen.set(true)}
              className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.commands_label()}
            </button>
            <button
              ref={newBtn}
              tabIndex={toolbarTabIndex(1)}
              onClick={() => { setNameInput(""); setNameError(null); setSubDialog({ type: "create" }); }}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
            >
              {m.profile_create()}
            </button>
            <button
              ref={importBtn}
              tabIndex={toolbarTabIndex(2)}
              onClick={handleImport}
              className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.profile_import()}
            </button>
          </div>
        </div>
      </div>

      {/* ── List + Actions ── */}
      <div className="flex flex-1 gap-4 overflow-hidden px-4 py-3">
        <div
          ref={listWrapperRef}
          data-zone-id="profiles-list"
          className="flex-1 overflow-y-auto"
          onKeyDown={handleListKeyDown}
        >
          <ProfileList
            ref={listRef}
            profiles={profiles}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
        <div className="w-56 flex-shrink-0 overflow-y-auto">
          <ProfileActions
            ref={actionsRef}
            selected={selected}
            activeProfile={activeProfile}
            busy={busy}
            onSwitch={handleSwitch}
            onRename={() => { setNameInput(selected); setNameError(null); setSubDialog({ type: "rename" }); }}
            onDelete={() => setSubDialog({ type: "delete" })}
            onDuplicate={() => { setNameInput(""); setNameError(null); setSubDialog({ type: "duplicate" }); }}
            onExport={handleExport}
            exitZone={(forward) => exitZone("profiles-actions", forward)}
          />
        </div>
      </div>

      {/* ── Sub-dialogs (single level, portalled) ── */}
      {(subDialog?.type === "create" || subDialog?.type === "rename" ||
        subDialog?.type === "duplicate" || subDialog?.type === "import") && createPortal(
        <ProfileNameDialog
          title={
            subDialog.type === "create" ? m.profile_create()
            : subDialog.type === "rename" ? m.profile_rename()
            : subDialog.type === "duplicate" ? m.profile_duplicate()
            : m.profile_import()
          }
          value={nameInput}
          error={nameError}
          busy={busy}
          onChange={(v) => { setNameInput(v); setNameError(null); }}
          onConfirm={() => {
            if (subDialog.type === "create") handleCreate();
            else if (subDialog.type === "rename") handleRename();
            else if (subDialog.type === "duplicate") handleDuplicate();
            else handleCommitImport();
          }}
          onCancel={() => { setSubDialog(null); setNameInput(""); }}
        />,
        document.body,
      )}

      {subDialog?.type === "delete" && createPortal(
        <ConfirmDialog
          title={m.profile_delete()}
          message={m.profile_delete_confirm({ name: selected })}
          confirmLabel={m.profile_delete()}
          onConfirm={handleDelete}
          onCancel={() => setSubDialog(null)}
        />,
        document.body,
      )}

      {subDialog?.type === "switch-confirm" && createPortal(
        <ConfirmDialog
          title={m.profile_switch()}
          message={m.profile_switch_confirm({ name: selected })}
          confirmLabel={m.profile_switch()}
          onConfirm={doSwitch}
          onCancel={() => setSubDialog(null)}
        />,
        document.body,
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/profile/ProfilesPanel.test.tsx`
Expected: PASS (7 tests). Якщо «register three zones» падає через незаповнені child-refs — переконатися, що ефект реєстрації має deps `[toolbarRestore]` і читає `actionsRef`/`listRef` лише в гетерах `el`/`focus` (lazy), як у коді вище.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/ProfilesPanel.tsx src/components/profile/ProfilesPanel.test.tsx
git commit -m "feat(profile): add ProfilesPanel screen with 3 zones"
```

---

## Task 5: Wire ProfilesPanel into App, remove modal render

**Files:**
- Modify: `src/App.tsx:10` (import), `src/App.tsx:300-303` (render), `src/App.tsx:317` (modal)

- [ ] **Step 1: Replace the ProfileManager import with ProfilesPanel**

У `src/App.tsx` замінити рядок 10:

```tsx
import { ProfilesPanel } from "./components/profile/ProfilesPanel";
```

- [ ] **Step 2: Render the panel in `<main>`**

У `src/App.tsx` після рядка з `SongsPanel` (≈303) додати:

```tsx
        {activeSection === "profiles" && <ProfilesPanel onZonesChange={onZonesChange} exitZone={exitZone} />}
```

- [ ] **Step 3: Remove the modal from the App tree**

У `src/App.tsx` видалити рядок `<ProfileManager />` (≈317) у компоненті `App`.

- [ ] **Step 4: Run the affected suites**

Run: `pnpm exec vitest run src/components/profile/ProfilesPanel.test.tsx`
Expected: PASS.
Run: `pnpm vite:build`
Expected: збірка проходить (типи `App.tsx` валідні; `ProfileManager` ще існує, але більше не імпортується в App).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): render ProfilesPanel as a section, drop modal mount"
```

---

## Task 6: ActivityBar — profile on top, divider, aria-pressed, section switch, launch focus

**Files:**
- Modify: `src/components/layout/ActivityBar.tsx`
- Modify: `src/components/layout/ActivityBar.test.tsx`

- [ ] **Step 1: Update ActivityBar tests to the new model**

Замінити вміст `src/components/layout/ActivityBar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { createRef } from "react";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { ActivityBar } from "./ActivityBar";
import { $activeSection } from "../../stores/navigation";
import { $settings } from "../../stores/settings";

beforeEach(() => {
  $activeSection.set("streams");
  $settings.set(null);
});

function renderBar() {
  const ref = createRef<ZoneEntry>();
  const utils = render(<ActivityBar ref={ref} exitZone={() => {}} />);
  return { ...utils, ref };
}

const tabIndices = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLButtonElement>("button")).map((b) =>
    b.getAttribute("tabindex"),
  );

describe("ActivityBar — structure", () => {
  it("keeps the navigation landmark and nests an application wrapper", () => {
    const { container } = renderBar();
    const nav = container.querySelector("nav")!;
    expect(nav.getAttribute("role")).toBeNull();
    const app = nav.querySelector('[role="application"]')!;
    expect(app).toBeTruthy();
    expect(nav.querySelectorAll('[role="application"] button').length).toBe(
      nav.querySelectorAll("button").length,
    );
  });

  it("renders 7 buttons with the profile button first", () => {
    const { container } = renderBar();
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(7);
    // Profile button is first and carries the active profile name in its label.
    expect(buttons[0].getAttribute("aria-label")).toMatch(/default/i);
  });

  it("renders a separator under the profile button", () => {
    const { container } = renderBar();
    expect(container.querySelector('[role="separator"]')).toBeTruthy();
  });
});

describe("ActivityBar — profile section behaviour", () => {
  it("sets aria-pressed on the profile button when profiles is active", () => {
    $activeSection.set("profiles");
    const { container } = renderBar();
    const profileBtn = container.querySelectorAll("button")[0];
    expect(profileBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("switches activeSection to profiles when the profile button is pressed", () => {
    const { container } = renderBar();
    const profileBtn = container.querySelectorAll("button")[0];
    fireEvent.click(profileBtn);
    expect($activeSection.get()).toBe("profiles");
  });

  it("profile button is the first roving item (tabindex 0 at start)", () => {
    const { container } = renderBar();
    const nav = container.querySelector("nav")!;
    expect(tabIndices(nav)[0]).toBe("0");
  });
});

describe("ActivityBar — launch focus (P3)", () => {
  it("focuses the active section button on zone entry, not the first item", () => {
    $activeSection.set("browser"); // index 2 (profile=0, streams=1, browser=2)
    const { container, ref } = renderBar();
    act(() => ref.current!.focus("forward"));
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    expect(document.activeElement).toBe(buttons[2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/layout/ActivityBar.test.tsx`
Expected: FAIL (profile still last; no separator; no aria-pressed; focus lands on index 0).

- [ ] **Step 3: Rewrite ActivityBar**

Замінити вміст `src/components/layout/ActivityBar.tsx`:

```tsx
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Button } from "react-aria-components";
import { Radio, Globe, Heart, Calendar, Music, Settings, Layers } from "lucide-react";
import { useStore } from "@nanostores/react";
import { $activeSection } from "../../stores/navigation";
import { $settingsDialogOpen, $settings } from "../../stores/settings";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { Section } from "../../stores/navigation";
import * as m from "../../i18n/paraglide/messages";

interface SectionConfig {
  id: Section;
  label: () => string;
  Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  disabled?: boolean;
  phase?: string;
}

const SECTIONS: SectionConfig[] = [
  { id: "streams", label: m.streams_section, Icon: Radio },
  { id: "browser", label: m.browser_section, Icon: Globe },
  { id: "wishlist", label: m.wishlist_section, Icon: Heart },
  { id: "schedule", label: m.schedule_section, Icon: Calendar, disabled: true, phase: "3" },
  { id: "songs", label: m.songs_section, Icon: Music },
];

interface Props {
  exitZone: (forward: boolean) => void;
}

export const ActivityBar = forwardRef<ZoneEntry, Props>(({ exitZone }, ref) => {
  const activeSection = useStore($activeSection);
  const settings = useStore($settings);
  const navRef = useRef<HTMLElement | null>(null);

  // Roving order: [profile, streams, browser, wishlist, schedule, songs, settings]
  const profileRef = useRef<HTMLButtonElement | null>(null);
  const ref0 = useRef<HTMLButtonElement | null>(null);
  const ref1 = useRef<HTMLButtonElement | null>(null);
  const ref2 = useRef<HTMLButtonElement | null>(null);
  const ref3 = useRef<HTMLButtonElement | null>(null);
  const ref4 = useRef<HTMLButtonElement | null>(null);
  const settingsRef = useRef<HTMLButtonElement | null>(null);
  const sectionRefs = useMemo(() => [ref0, ref1, ref2, ref3, ref4], []);
  const allRefs = useMemo(
    () => [profileRef, ref0, ref1, ref2, ref3, ref4, settingsRef],
    [sectionRefs],
  );

  const { onKeyDown, getTabIndex, restoreFocus, moveTo } = useRovingFocus(
    allRefs,
    "both",
    { mode: "composite-exit", onTabOut: exitZone },
  );

  // P3: entering the activity bar lands on the active section button (profile = 0,
  // sections offset by +1, Settings is footer-only and never the launch anchor).
  const activeNavIndex = useMemo(() => {
    if (activeSection === "profiles") return 0;
    const si = SECTIONS.findIndex((s) => s.id === activeSection);
    return si >= 0 ? si + 1 : 1;
  }, [activeSection]);

  useImperativeHandle(ref, () => ({
    id: "activity-bar",
    get el() { return navRef.current!; },
    focus: () => moveTo(activeNavIndex),
  }), [moveTo, activeNavIndex]);

  void restoreFocus; // superseded by active-section launch focus

  return (
    <nav
      ref={navRef}
      aria-label={m.main_navigation()}
      data-zone-id="activity-bar"
      className="flex w-56 flex-col gap-1 border-r border-slate-700 bg-slate-900 py-2 px-2"
      onKeyDown={onKeyDown}
    >
      <div role="application" aria-label={m.main_navigation()} className="contents">
        {/* Profile — top of the menu (P2/P4) */}
        <Button
          ref={profileRef}
          aria-label={`${m.profile_manager_open()} — ${settings?.activeProfile ?? "Default"}`}
          aria-pressed={activeSection === "profiles"}
          excludeFromTabOrder={getTabIndex(0) === -1}
          onPress={() => $activeSection.set("profiles")}
          className={[
            "flex items-center gap-3 w-full min-h-[58px] px-[14px] py-3 rounded-[18px] border transition-colors outline-none",
            "focus-visible:ring-2 focus-visible:ring-blue-400",
            activeSection === "profiles"
              ? "bg-gradient-to-b from-sky-400/[.18] to-blue-700/[.16] border-sky-300/[.28] text-sky-300 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:border-[Highlight]"
              : "bg-white/[.02] border-slate-700/30 text-slate-400 hover:bg-white/[.05] hover:border-slate-600/50 hover:text-slate-200 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]",
          ].join(" ")}
        >
          <span className="flex items-center justify-center w-[42px] h-[42px] flex-none rounded-[14px] bg-sky-400/[.12] text-sky-200">
            <Layers size={20} aria-hidden={true} />
          </span>
          <div className="flex flex-col gap-0.5 min-w-0">
            <strong className="text-sm font-bold text-slate-300 truncate leading-tight">{m.profile_name()}</strong>
            <span className="text-xs text-slate-500 truncate">{settings?.activeProfile ?? "Default"}</span>
          </div>
        </Button>

        {/* Divider under the profile header (P2) */}
        <div role="separator" className="my-1 h-px w-full bg-slate-700/60 forced-colors:bg-[ButtonText]" />

        {/* Section group */}
        {SECTIONS.map((sec, i) => (
          <Button
            key={sec.id}
            ref={sectionRefs[i]}
            aria-label={sec.label()}
            aria-pressed={activeSection === sec.id}
            aria-disabled={sec.disabled ? "true" : undefined}
            aria-describedby={sec.disabled ? `nav-${sec.id}-desc` : undefined}
            excludeFromTabOrder={getTabIndex(i + 1) === -1}
            onPress={() => {
              if (sec.disabled) return;
              $activeSection.set(sec.id);
            }}
            className={[
              "flex items-center gap-3 w-full min-h-[58px] px-[14px] py-3 rounded-[18px] border transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-blue-400",
              activeSection === sec.id
                ? "bg-gradient-to-b from-sky-400/[.18] to-blue-700/[.16] border-sky-300/[.28] text-sky-300 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:border-[Highlight]"
                : sec.disabled
                ? "bg-white/[.02] border-transparent cursor-not-allowed text-slate-600 forced-colors:text-[GrayText]"
                : "bg-white/[.02] border-slate-700/30 text-slate-400 hover:bg-white/[.05] hover:border-slate-600/50 hover:text-slate-200 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]",
            ].join(" ")}
          >
            <span className={[
              "relative flex items-center justify-center w-[42px] h-[42px] flex-none rounded-[14px]",
              activeSection === sec.id
                ? "bg-white/[.08] text-sky-300 forced-colors:text-[HighlightText]"
                : sec.disabled
                ? "bg-white/[.02] text-slate-600 forced-colors:text-[GrayText]"
                : "bg-white/[.04] text-slate-400 hover:text-slate-200",
            ].join(" ")}>
              <sec.Icon size={20} aria-hidden={true} />
            </span>
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-bold leading-tight">{sec.label()}</span>
            </span>
            {sec.disabled && (
              <span id={`nav-${sec.id}-desc`} className="sr-only">
                {m.phase_not_available({ phase: sec.phase ?? "" })}
              </span>
            )}
          </Button>
        ))}

        {/* Footer: Settings stays a dialog (P6) */}
        <div className="mt-auto flex flex-col gap-1">
          <Button
            ref={settingsRef}
            aria-label={m.settings_title()}
            excludeFromTabOrder={getTabIndex(SECTIONS.length + 1) === -1}
            onPress={() => $settingsDialogOpen.set(true)}
            className="flex items-center gap-3 w-full min-h-[58px] px-[14px] py-3 rounded-[18px] border border-slate-700/30 bg-white/[.02] text-slate-400 hover:bg-white/[.05] hover:border-slate-600/50 hover:text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText] transition-colors"
          >
            <span className="relative flex items-center justify-center w-[42px] h-[42px] flex-none rounded-[14px] bg-white/[.04] text-slate-400 hover:text-slate-200">
              <Settings size={20} aria-hidden={true} />
            </span>
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-bold leading-tight">{m.settings_title()}</span>
            </span>
          </Button>
        </div>
      </div>
    </nav>
  );
});
ActivityBar.displayName = "ActivityBar";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/layout/ActivityBar.test.tsx`
Expected: PASS. Якщо launch-focus тест падає (activeElement не той), переконатися, що `focus` у `useImperativeHandle` викликає `moveTo(activeNavIndex)`, а тест обгортає виклик у `act(...)` (layout-ефект хука фокусує елемент синхронно в межах `act`).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/ActivityBar.tsx src/components/layout/ActivityBar.test.tsx
git commit -m "feat(nav): profile button on top with divider, aria-pressed, section switch, launch focus"
```

---

## Task 7: Remove the old modal + dead store, final verification

**Files:**
- Delete: `src/components/profile/ProfileManager.tsx`, `src/components/profile/ProfileManager.test.tsx`
- Modify: `src/stores/profileManager.ts`

- [ ] **Step 1: Delete the modal and its test**

```bash
git rm src/components/profile/ProfileManager.tsx src/components/profile/ProfileManager.test.tsx
```

- [ ] **Step 2: Remove the dead store**

У `src/stores/profileManager.ts` видалити рядок `export const $profileManagerOpen = atom<boolean>(false);`. Підсумковий вміст файлу:

```ts
import { atom } from "nanostores";
import type { ProfileMeta } from "../lib/tauri";

export const $profileList = atom<ProfileMeta[]>([]);
```

- [ ] **Step 3: Confirm nothing references the removed symbols**

Run: `pnpm exec grep -rn "profileManagerOpen\|ProfileManager" src` (або через Grep tool)
Expected: жодного збігу (усі посилання прибрані в Tasks 4–6).

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test`
Expected: усі тести PASS, відсутні файли `ProfileManager*` не згадуються.

- [ ] **Step 5: Verify the production front-end build**

Run: `pnpm vite:build`
Expected: збірка проходить без помилок типів/імпортів.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(profile): remove ProfileManager modal and dead store"
```

---

## Self-Review notes

- **Spec coverage:** §1 компоненти → Tasks 2–4,7; §2 зони → Task 4; §3 під-діалоги → Tasks 2,4; §4 ActivityBar (P2/P3/P4) → Task 6; §5 App/навігація → Tasks 1,5; §6 refocus → Task 4 (`refocusList` через rAF); §7 тести → у кожному таску; §8 i18n → Task 1 (+ reuse `profile_actions_label`). Усі пункти покриті.
- **Reuse note:** зона дій використовує наявний ключ `profile_actions_label`; новий ключ лише `zone_profiles_toolbar`.
- **ConfirmDialog для switch-confirm** має червону кнопку підтвердження (стиль delete). Це прийнятно для дії, що зупиняє активні записи; якщо потрібен нейтральний колір — окремий тюнінг поза цим планом.
- **Roving + disabled:** react-aria `Button isDisabled` лишається фокусованою для стрілок; `restoreFocus` пропускає disabled при вході в зону. Стрілка може зупинитись на disabled-кнопці (як у тулбарі Streams зі «Stop all») — прийнятний наявний патерн.
- **Type consistency:** `ZoneEntry` (id/el/focus) однаковий у `ProfileActions`, `ProfilesPanel`, `ActivityBar`; `ProfileListHandle.focusSelected` незмінний; `ProfileActions` більше не має `onNew`/`onImport` (перенесені в тулбар `ProfilesPanel`).
```
