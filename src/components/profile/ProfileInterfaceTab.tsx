import {
  Button,
  Checkbox,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from "react-aria-components";
import type { UiSettings } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  ui: UiSettings;
  onChange: (patch: Partial<UiSettings>) => void;
}

/**
 * «Інтерфейс» — порядок списку потоків і сповіщення в треї. Сповіщення тут
 * свідомий виняток із ОС-межі: «нічний сценарій — тихо» (ADR 2026-08-08).
 */
export function ProfileInterfaceTab({ ui, onChange }: Props) {
  return (
    <div className="space-y-4">
      <Select
        selectedKey={ui.streamSort}
        onSelectionChange={(key) => onChange({ streamSort: key as UiSettings["streamSort"] })}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.streams_sort_group()}
        </Label>
        <Button className="mt-1 flex w-48 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]">
          <SelectValue />
          <span aria-hidden="true">▼</span>
        </Button>
        <Popover className="w-48 rounded border border-slate-600 bg-slate-700 shadow-lg">
          <ListBox className="outline-none">
            <ListBoxItem
              id="name"
              className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
            >
              {m.streams_sort_by_name()}
            </ListBoxItem>
            <ListBoxItem
              id="added"
              className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
            >
              {m.streams_sort_by_added()}
            </ListBoxItem>
          </ListBox>
        </Popover>
      </Select>

      <Checkbox
        isSelected={ui.trayNotifications}
        onChange={(val) => onChange({ trayNotifications: val })}
        className="flex items-center gap-2 text-sm text-slate-300"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700 forced-colors:border-[ButtonText]">
          {ui.trayNotifications && <span aria-hidden="true">✓</span>}
        </div>
        <Label>{m.settings_show_tray_notifications()}</Label>
      </Checkbox>
    </div>
  );
}
