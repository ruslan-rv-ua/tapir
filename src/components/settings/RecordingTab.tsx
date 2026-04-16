import { useStore } from "@nanostores/react";
import {
  TextField,
  Label,
  Input,
  Checkbox,
  NumberField,
  Group,
} from "react-aria-components";
import { $recordingSettings } from "../../stores/settings";
import { useAutoSave } from "../../hooks/useAutoSave";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import type { RecordingSettings } from "../../lib/tauri";

export function RecordingTab() {
  const recording = useStore($recordingSettings);

  const save = useAutoSave(async () => {
    const current = $recordingSettings.get();
    if (current) await tauri.saveRecordingSettings(current);
  });

  if (!recording)
    return <div className="text-sm text-slate-500">Loading...</div>;

  function update(patch: Partial<RecordingSettings>) {
    const current = $recordingSettings.get();
    if (!current) return;
    $recordingSettings.set({ ...current, ...patch });
    save();
  }

  async function handleBrowse() {
    const dir = await tauri.openDirectoryPicker(recording?.outputDir);
    if (dir) update({ outputDir: dir });
  }

  return (
    <div className="space-y-6">
      {/* Output directory */}
      <div>
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_output_dir()}
        </Label>
        <div className="mt-1 flex gap-2">
          <TextField
            value={recording.outputDir}
            onChange={(val) => update({ outputDir: val })}
            className="flex-1"
          >
            <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
          </TextField>
          <button
            onClick={handleBrowse}
            className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600"
          >
            {m.settings_output_dir_browse()}
          </button>
        </div>
      </div>

      {/* File templates */}
      <TextField
        value={recording.fileNameTemplate}
        onChange={(val) => update({ fileNameTemplate: val })}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_file_template()}
        </Label>
        <Input className="mt-1 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
        <p className="mt-1 text-xs text-slate-500">
          {m.settings_template_help()}
        </p>
      </TextField>

      <TextField
        value={recording.incompleteFileNameTemplate}
        onChange={(val) => update({ incompleteFileNameTemplate: val })}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_incomplete_template()}
        </Label>
        <Input className="mt-1 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
      </TextField>

      <TextField
        value={recording.streamFileNameTemplate}
        onChange={(val) => update({ streamFileNameTemplate: val })}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_stream_template()}
        </Label>
        <Input className="mt-1 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
      </TextField>

      {/* Checkboxes */}
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

      <Checkbox
        isSelected={recording.deleteStreamFileOnStop}
        onChange={(val) => update({ deleteStreamFileOnStop: val })}
        className="flex items-center gap-2 text-sm text-slate-300"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">
          {recording.deleteStreamFileOnStop && <span>✓</span>}
        </div>
        <Label>{m.settings_delete_stream_on_stop()}</Label>
      </Checkbox>

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
        onChange={(val) => update({ skipShortTracksMs: val * 1000 })}
        minValue={0}
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_min_track_duration()}
        </Label>
        <Group className="mt-1 flex w-32">
          <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
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
    </div>
  );
}
