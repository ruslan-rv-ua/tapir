import { useEffect, useState } from "react";
import {
  Select,
  SelectValue,
  Label,
  Button,
  Popover,
  ListBox,
  ListBoxItem,
} from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $settings } from "../../stores/settings";
import { useAutoSave } from "../../hooks/useAutoSave";
import * as tauri from "../../lib/tauri";
import type { AudioDevice } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

export function AudioTab() {
  const settings = useStore($settings);
  const [devices, setDevices] = useState<AudioDevice[]>([]);

  const loadDevices = async () => {
    try {
      const devs = await tauri.listOutputDevices();
      setDevices(devs);
    } catch (err) {
      console.error("Failed to load audio devices:", err);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const save = useAutoSave(async () => {
    const current = $settings.get();
    if (current) await tauri.saveSettings(current);
  });

  if (!settings) return null;

  async function handleDeviceChange(deviceName: string) {
    const name = deviceName === "__default__" ? null : deviceName;
    try {
      await tauri.setOutputDevice(name);
    } catch (err) {
      console.error("Failed to set output device:", err);
      return;
    }
    const current = $settings.get();
    if (current) {
      $settings.set({ ...current, outputDevice: name });
      save();
    }
  }

  const selectedKey = settings.outputDevice ?? "__default__";

  return (
    <div className="space-y-6">
      <Select
        selectedKey={selectedKey}
        onSelectionChange={(key) => handleDeviceChange(key as string)}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_output_device()}
        </Label>
        <Button className="mt-1 flex w-80 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400">
          <SelectValue />
          <span aria-hidden="true">▼</span>
        </Button>
        <Popover className="w-80 rounded border border-slate-600 bg-slate-700 shadow-lg">
          <ListBox className="max-h-60 overflow-y-auto outline-none">
            <ListBoxItem
              id="__default__"
              className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
            >
              {m.settings_output_device_default()}
            </ListBoxItem>
            {devices.map((dev) => (
              <ListBoxItem
                key={dev.name}
                id={dev.name}
                className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
              >
                {dev.name}
              </ListBoxItem>
            ))}
          </ListBox>
        </Popover>
      </Select>

      <Button
        onPress={loadDevices}
        className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600 outline-none focus:ring-2 focus:ring-blue-400"
        aria-label={m.settings_output_device_refresh()}
      >
        {m.settings_output_device_refresh()}
      </Button>
    </div>
  );
}
