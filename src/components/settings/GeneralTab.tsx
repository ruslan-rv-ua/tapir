import { useStore } from "@nanostores/react";
import {
  Checkbox,
  Label,
  Select,
  SelectValue,
  ListBox,
  ListBoxItem,
  Popover,
  Button,
  NumberField,
  Input,
  Group,
} from "react-aria-components";
import { $settings } from "../../stores/settings";
import { useAutoSave } from "../../hooks/useAutoSave";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
// @ts-expect-error — paraglide runtime has no .d.ts
import { setLocale } from "../../i18n/paraglide/runtime";
import type { GlobalSettings } from "../../lib/tauri";

export function GeneralTab() {
  const settings = useStore($settings);
  if (!settings) return null;

  const save = useAutoSave(async () => {
    const current = $settings.get();
    if (current) await tauri.saveSettings(current);
  });

  function update(patch: Partial<GlobalSettings>) {
    const current = $settings.get();
    if (!current) return;
    const updated = { ...current, ...patch };
    $settings.set(updated);
    if (patch.language) {
      const locale = patch.language === "uk-UA" ? "uk" : "en";
      document.documentElement.lang = locale;
      setLocale(locale, { reload: false });
    }
    if (patch.theme) {
      applyTheme(patch.theme);
    }
    save();
  }

  return (
    <div className="space-y-6">
      {/* Language */}
      <Select
        selectedKey={settings.language}
        onSelectionChange={(key) => update({ language: key as string })}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_language()}
        </Label>
        <Button className="mt-1 flex w-48 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400">
          <SelectValue />
          <span aria-hidden="true">▼</span>
        </Button>
        <Popover className="w-48 rounded border border-slate-600 bg-slate-700 shadow-lg">
          <ListBox className="outline-none">
            <ListBoxItem
              id="uk-UA"
              className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
            >
              Українська
            </ListBoxItem>
            <ListBoxItem
              id="en-US"
              className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
            >
              English
            </ListBoxItem>
          </ListBox>
        </Popover>
      </Select>

      {/* Theme */}
      <Select
        selectedKey={settings.theme}
        onSelectionChange={(key) =>
          update({ theme: key as GlobalSettings["theme"] })
        }
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_theme()}
        </Label>
        <Button className="mt-1 flex w-48 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400">
          <SelectValue />
          <span aria-hidden="true">▼</span>
        </Button>
        <Popover className="w-48 rounded border border-slate-600 bg-slate-700 shadow-lg">
          <ListBox className="outline-none">
            <ListBoxItem
              id="auto"
              className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
            >
              {m.settings_theme_auto()}
            </ListBoxItem>
            <ListBoxItem
              id="dark"
              className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
            >
              {m.settings_theme_dark()}
            </ListBoxItem>
            <ListBoxItem
              id="light"
              className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
            >
              {m.settings_theme_light()}
            </ListBoxItem>
          </ListBox>
        </Popover>
      </Select>

      {/* Minimize to tray */}
      <Checkbox
        isSelected={settings.minimizeToTray}
        onChange={(val) => update({ minimizeToTray: val })}
        className="flex items-center gap-2 text-sm text-slate-300"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">
          {settings.minimizeToTray && <span>✓</span>}
        </div>
        <Label>{m.settings_minimize_to_tray()}</Label>
      </Checkbox>

      {/* Show tray notifications */}
      <Checkbox
        isSelected={settings.showTrayNotifications}
        onChange={(val) => update({ showTrayNotifications: val })}
        className="flex items-center gap-2 text-sm text-slate-300"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">
          {settings.showTrayNotifications && <span>✓</span>}
        </div>
        <Label>{m.settings_show_tray_notifications()}</Label>
      </Checkbox>

      {/* Show track in title */}
      <Checkbox
        isSelected={settings.showTrackInTitle}
        onChange={(val) => update({ showTrackInTitle: val })}
        className="flex items-center gap-2 text-sm text-slate-300"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">
          {settings.showTrackInTitle && <span>✓</span>}
        </div>
        <Label>{m.settings_show_track_in_title()}</Label>
      </Checkbox>

      {/* Double click action */}
      <Select
        selectedKey={settings.doubleClickAction}
        onSelectionChange={(key) =>
          update({ doubleClickAction: key as GlobalSettings["doubleClickAction"] })
        }
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_double_click_action()}
        </Label>
        <Button className="mt-1 flex w-48 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400">
          <SelectValue />
          <span aria-hidden="true">▼</span>
        </Button>
        <Popover className="w-48 rounded border border-slate-600 bg-slate-700 shadow-lg">
          <ListBox className="outline-none">
            <ListBoxItem
              id="record"
              className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
            >
              {m.settings_double_click_record()}
            </ListBoxItem>
            <ListBoxItem
              id="play"
              className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
            >
              {m.settings_double_click_play()}
            </ListBoxItem>
          </ListBox>
        </Popover>
      </Select>

      {/* Disk threshold */}
      <NumberField
        value={settings.diskSpaceThresholdGb}
        onChange={(val) => { if (!Number.isNaN(val)) update({ diskSpaceThresholdGb: val }); }}
        minValue={0}
        maxValue={100}
        step={1}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_disk_threshold()}
        </Label>
        <Group className="mt-1 flex w-32">
          <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
        </Group>
        <p className="mt-1 text-xs text-slate-500">
          {m.settings_disk_threshold_desc()}
        </p>
      </NumberField>
    </div>
  );
}

function applyTheme(theme: string) {
  const html = document.documentElement;
  html.removeAttribute("data-theme");
  if (theme === "dark" || theme === "light") {
    html.setAttribute("data-theme", theme);
  }
}
