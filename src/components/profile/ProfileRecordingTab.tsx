import {
  TextField,
  Label,
  Input,
  Checkbox,
  NumberField,
  Group,
} from "react-aria-components";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import { addToast } from "../../stores/toasts";
import type { RecordingSettings, ReconnectConfig } from "../../lib/tauri";

interface Props {
  recording: RecordingSettings;
  onChange: (patch: Partial<RecordingSettings>) => void;
}

/**
 * «Запис» — перша вкладка діалогу профілю. Керована: власного стану немає,
 * значення і запис належать діалогу, який дебаунсить збереження.
 *
 * Вибір теки викликає `open_directory_picker` → `blocking_pick_folder`, тобто
 * нативний системний діалог, а не webview-модалку. Саме тому рендерити його
 * всередині `TabPanel` безпечно: небезпечний бік відомої проблеми — модалка
 * через портал усередині колекції (`WishlistPanel`, фікс ba87641).
 */
export function ProfileRecordingTab({ recording, onChange }: Props) {
  function update(patch: Partial<RecordingSettings>) {
    onChange(patch);
  }

  function updateReconnect(patch: Partial<ReconnectConfig>) {
    onChange({ reconnect: { ...recording.reconnect, ...patch } });
  }

  async function handleBrowse() {
    try {
      const dir = await tauri.openDirectoryPicker(recording.outputDir);
      if (dir) update({ outputDir: dir });
    } catch (err) {
      console.error("Failed to open directory picker:", err);
      addToast(m.settings_recording_dir_error(), "error");
    }
  }

  return (
    <div className="space-y-6">

      {/* Section: Output & templates */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">{m.settings_section_output()}</h3>

      {/* Output directory */}
      <div className="flex gap-2 items-end">
        <TextField
          value={recording.outputDir}
          onChange={(val) => update({ outputDir: val })}
          className="flex-1"
        >
          <Label className="block text-sm font-medium text-slate-300">
            {m.settings_output_dir()}
          </Label>
          <Input className="mt-1 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]" />
        </TextField>
        <button
          onClick={handleBrowse}
          aria-label={m.settings_output_dir_browse()}
          className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
        >
          {m.settings_output_dir_browse()}
        </button>
      </div>

      <p className="text-xs text-slate-500">{m.settings_template_help()}</p>

      {/* File templates */}
      <TextField
        value={recording.fileNameTemplate}
        onChange={(val) => update({ fileNameTemplate: val })}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_file_template()}
        </Label>
        <Input className="mt-1 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]" />
      </TextField>

      <TextField
        value={recording.incompleteFileNameTemplate}
        onChange={(val) => update({ incompleteFileNameTemplate: val })}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_incomplete_template()}
        </Label>
        <Input className="mt-1 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]" />
      </TextField>

      <TextField
        value={recording.streamFileNameTemplate}
        onChange={(val) => update({ streamFileNameTemplate: val })}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_stream_template()}
        </Label>
        <Input className="mt-1 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]" />
      </TextField>
      </div>

      {/* Section: Stream file */}
      <div className="space-y-3 border-t border-slate-700 pt-4">
        <h3 className="text-sm font-semibold text-slate-200">{m.settings_section_stream_file()}</h3>

      <Checkbox
        isSelected={recording.saveStreamFile}
        onChange={(val) => update({ saveStreamFile: val })}
        className="flex items-center gap-2 text-sm text-slate-300"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">
          {recording.saveStreamFile && <span>✓</span>}
        </div>
        <Label>{m.settings_save_stream_file()}</Label>
      </Checkbox>
      </div>

      {/* Section: Track filters */}
      <div className="space-y-3 border-t border-slate-700 pt-4">
        <h3 className="text-sm font-semibold text-slate-200">{m.settings_section_track_filters()}</h3>

      <Checkbox
        isSelected={recording.skipFirstIncompleteTrack}
        onChange={(val) => update({ skipFirstIncompleteTrack: val })}
        className="flex items-center gap-2 text-sm text-slate-300"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">
          {recording.skipFirstIncompleteTrack && <span>✓</span>}
        </div>
        <Label>{m.settings_skip_first_incomplete()}</Label>
      </Checkbox>

      {/* Min track duration (display in seconds, store as ms) */}
      <NumberField
        value={recording.skipShortTracksMs / 1000}
        onChange={(val) => { if (!Number.isNaN(val)) update({ skipShortTracksMs: val * 1000 }); }}
        minValue={0}
        step={1}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_min_track_duration()}
        </Label>
        <Group className="mt-1 flex w-32">
          <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]" />
        </Group>
      </NumberField>

      <Checkbox
        isSelected={recording.autoCorrectCase}
        onChange={(val) => update({ autoCorrectCase: val })}
        className="flex items-center gap-2 text-sm text-slate-300"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">
          {recording.autoCorrectCase && <span>✓</span>}
        </div>
        <Label>{m.settings_auto_correct_case()}</Label>
      </Checkbox>

      {/* Disk threshold — профільний: охороняє профільну теку запису */}
      <NumberField
        value={recording.diskSpaceThresholdGb}
        onChange={(val) => { if (!Number.isNaN(val)) update({ diskSpaceThresholdGb: val }); }}
        minValue={0}
        maxValue={100}
        step={1}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_disk_threshold()}
        </Label>
        <Group className="mt-1 flex w-32">
          <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]" />
        </Group>
        <p className="mt-1 text-xs text-slate-500">{m.settings_disk_threshold_desc()}</p>
      </NumberField>
      </div>

      {/* Section: Scheduler padding (Phase 3D §5.4); межі клампить і backend */}
      <div className="space-y-3 border-t border-slate-700 pt-4">
        <h3 className="text-sm font-semibold text-slate-200">{m.settings_section_scheduler()}</h3>

        <NumberField
          value={recording.schedulePadBeforeMin}
          onChange={(val) => { if (!Number.isNaN(val)) update({ schedulePadBeforeMin: val }); }}
          minValue={0}
          maxValue={30}
          step={1}
        >
          <Label className="block text-sm font-medium text-slate-300">
            {m.settings_schedule_pad_before()}
          </Label>
          <Group className="mt-1 flex w-32">
            <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]" />
          </Group>
        </NumberField>

        <NumberField
          value={recording.schedulePadAfterMin}
          onChange={(val) => { if (!Number.isNaN(val)) update({ schedulePadAfterMin: val }); }}
          minValue={0}
          maxValue={60}
          step={1}
        >
          <Label className="block text-sm font-medium text-slate-300">
            {m.settings_schedule_pad_after()}
          </Label>
          <Group className="mt-1 flex w-32">
            <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]" />
          </Group>
        </NumberField>
      </div>

      {/* Section: Reconnection (collapsed) */}
      <details className="rounded border border-slate-700">
        <summary className="cursor-pointer px-3 py-2 text-sm text-slate-300 outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
          {m.settings_tab_reconnection()}
        </summary>
        <div className="space-y-4 px-3 pb-3 pt-1">
          <NumberField
            value={recording.reconnect.maxRetries}
            onChange={(val) => { if (!Number.isNaN(val)) updateReconnect({ maxRetries: val }); }}
            minValue={0}
            maxValue={10000}
          >
            <Label className="block text-sm font-medium text-slate-300">{m.settings_max_retries()}</Label>
            <Group className="mt-1 flex w-32">
              <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]" />
            </Group>
            <p className="mt-1 text-xs text-slate-500">{m.settings_max_retries_desc()}</p>
          </NumberField>

          <NumberField
            value={recording.reconnect.retryIntervalSecs}
            onChange={(val) => { if (!Number.isNaN(val)) updateReconnect({ retryIntervalSecs: val }); }}
            minValue={1}
          >
            <Label className="block text-sm font-medium text-slate-300">{m.settings_retry_interval()}</Label>
            <Group className="mt-1 flex w-32">
              <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]" />
            </Group>
            <p className="mt-1 text-xs text-slate-500">{m.settings_retry_interval_desc()}</p>
          </NumberField>

          <NumberField
            value={recording.reconnect.backoffMultiplier}
            onChange={(val) => { if (!Number.isNaN(val)) updateReconnect({ backoffMultiplier: val }); }}
            minValue={1}
            step={0.1}
          >
            <Label className="block text-sm font-medium text-slate-300">{m.settings_backoff_multiplier()}</Label>
            <Group className="mt-1 flex w-32">
              <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]" />
            </Group>
            <p className="mt-1 text-xs text-slate-500">{m.settings_backoff_multiplier_desc()}</p>
          </NumberField>

          <NumberField
            value={recording.reconnect.maxIntervalSecs}
            onChange={(val) => { if (!Number.isNaN(val)) updateReconnect({ maxIntervalSecs: val }); }}
            minValue={1}
          >
            <Label className="block text-sm font-medium text-slate-300">{m.settings_max_interval()}</Label>
            <Group className="mt-1 flex w-32">
              <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]" />
            </Group>
            <p className="mt-1 text-xs text-slate-500">{m.settings_max_interval_desc()}</p>
          </NumberField>
        </div>
      </details>
    </div>
  );
}
