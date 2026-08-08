import { useEffect, useState } from "react";
import {
  Select,
  SelectValue,
  Label,
  Button,
  Popover,
  ListBox,
  ListBoxItem,
  Checkbox,
  NumberField,
  Input,
  Group,
} from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $settings } from "../../stores/settings";
import { addToast } from "../../stores/toasts";
import { useSettingsAutoSave } from "../../hooks/useSettingsAutoSave";
import * as tauri from "../../lib/tauri";
import type { AudioDevice, GlobalSettings } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

export function AudioTab() {
  const settings = useStore($settings);
  const [devices, setDevices] = useState<AudioDevice[]>([]);

  const loadDevices = async () => {
    try {
      const devs = await tauri.listOutputDevices();
      setDevices(devs);
    } catch (err) {
      addToast(m.settings_output_device_load_error(), "error");
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const save = useSettingsAutoSave();

  function update(patch: Partial<GlobalSettings>) {
    const current = $settings.get();
    if (!current) return;
    $settings.set({ ...current, ...patch });
    save();
  }

  if (!settings) return null;

  async function handleDeviceChange(deviceName: string) {
    const name = deviceName === "__default__" ? null : deviceName;
    try {
      await tauri.setOutputDevice(name);
    } catch (err) {
      addToast(m.settings_output_device_error(), "error");
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
      {/* Device selector + Refresh inline */}
      <div className="flex gap-2 items-end">
        <Select
          selectedKey={selectedKey}
          onSelectionChange={(key) => handleDeviceChange(key as string)}
          className="flex-1"
        >
          <Label className="block text-sm font-medium text-slate-300">
            {m.settings_output_device()}
          </Label>
          <Button className="mt-1 flex w-full items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]">
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
          className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
          aria-label={m.settings_output_device_refresh()}
        >
          {m.settings_output_device_refresh()}
        </Button>
      </div>

      {/* Section: Media integration */}
      <div className="space-y-3 border-t border-slate-700 pt-4">
        <h3 className="text-sm font-semibold text-slate-200">{m.settings_section_media()}</h3>

        <Checkbox
          isSelected={settings.smtcEnabled}
          onChange={(val) => update({ smtcEnabled: val })}
          className="flex items-center gap-2 text-sm text-slate-300"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">
            {settings.smtcEnabled && <span>✓</span>}
          </div>
          <Label>{m.settings_smtc_enabled()}</Label>
        </Checkbox>
      </div>

      <div className="space-y-4 border-t border-slate-700 pt-4">
        <h3 className="text-sm font-semibold text-slate-200">
          {m.player_controls()}
        </h3>

        {/* Prev-restart threshold (shown in seconds; stored as ms) */}
        <NumberField
          value={Math.round((settings.prevRestartThresholdMs ?? 0) / 1000)}
          onChange={(val) => {
            if (!Number.isNaN(val)) update({ prevRestartThresholdMs: Math.max(0, val) * 1000 });
          }}
          minValue={0}
          maxValue={30}
          step={1}
        >
          <Label className="block text-sm font-medium text-slate-300">
            {m.settings_prev_restart_threshold()}
          </Label>
          <Group className="mt-1 flex w-32">
            <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
          </Group>
        </NumberField>

        {/* Volume step */}
        <NumberField
          value={settings.volumeStepPercent}
          onChange={(val) => {
            if (!Number.isNaN(val)) update({ volumeStepPercent: Math.min(10, Math.max(1, val)) });
          }}
          minValue={1}
          maxValue={10}
          step={1}
        >
          <Label className="block text-sm font-medium text-slate-300">
            {m.settings_volume_step()}
          </Label>
          <Group className="mt-1 flex w-24">
            <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
          </Group>
        </NumberField>
      </div>
    </div>
  );
}
