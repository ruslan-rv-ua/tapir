import { useStore } from "@nanostores/react";
import { NumberField, Label, Input, Group } from "react-aria-components";
import { $recordingSettings } from "../../stores/settings";
import { useAutoSave } from "../../hooks/useAutoSave";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import type { ReconnectConfig } from "../../lib/tauri";

export function ReconnectionTab() {
  const recording = useStore($recordingSettings);

  const save = useAutoSave(async () => {
    const current = $recordingSettings.get();
    if (current) await tauri.saveRecordingSettings(current);
  });

  if (!recording) return null;

  function update(patch: Partial<ReconnectConfig>) {
    const current = $recordingSettings.get();
    if (!current) return;
    $recordingSettings.set({
      ...current,
      reconnect: { ...current.reconnect, ...patch },
    });
    save();
  }

  const r = recording.reconnect;

  return (
    <div className="space-y-6">
      <NumberField
        value={r.maxRetries}
        onChange={(val) => { if (!Number.isNaN(val)) update({ maxRetries: val }); }}
        minValue={0}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_max_retries()}
        </Label>
        <Group className="mt-1 flex w-32">
          <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
        </Group>
        <p className="mt-1 text-xs text-slate-500">
          {m.settings_max_retries_desc()}
        </p>
      </NumberField>

      <NumberField
        value={r.retryIntervalSecs}
        onChange={(val) => { if (!Number.isNaN(val)) update({ retryIntervalSecs: val }); }}
        minValue={1}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_retry_interval()}
        </Label>
        <Group className="mt-1 flex w-32">
          <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
        </Group>
        <p className="mt-1 text-xs text-slate-500">
          {m.settings_retry_interval_desc()}
        </p>
      </NumberField>

      <NumberField
        value={r.backoffMultiplier}
        onChange={(val) => { if (!Number.isNaN(val)) update({ backoffMultiplier: val }); }}
        minValue={1}
        step={0.1}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_backoff_multiplier()}
        </Label>
        <Group className="mt-1 flex w-32">
          <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
        </Group>
        <p className="mt-1 text-xs text-slate-500">
          {m.settings_backoff_multiplier_desc()}
        </p>
      </NumberField>

      <NumberField
        value={r.maxIntervalSecs}
        onChange={(val) => { if (!Number.isNaN(val)) update({ maxIntervalSecs: val }); }}
        minValue={1}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_max_interval()}
        </Label>
        <Group className="mt-1 flex w-32">
          <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
        </Group>
        <p className="mt-1 text-xs text-slate-500">
          {m.settings_max_interval_desc()}
        </p>
      </NumberField>
    </div>
  );
}
