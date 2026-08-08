import { useId } from "react";
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
import type { ProfileSettings } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

/** Три поля `playerSession`, якими володіє UI. Решта секції — бекендова. */
export type PlaybackSettings = Pick<
  ProfileSettings,
  "autoplayOnStartup" | "autoAdvance" | "resumeFileFrom"
>;

interface Props {
  value: PlaybackSettings;
  onChange: (patch: Partial<PlaybackSettings>) => void;
}

/**
 * «Відтворення» — «чи відновлювати», «звідки відновлювати» і автоперехід в
 * одному місці: одна фіча холодного старту, одна поверхня редагування
 * (ADR 2026-08-08).
 */
export function ProfilePlaybackTab({ value, onChange }: Props) {
  const hintId = useId();

  return (
    <div className="space-y-4">
      <Checkbox
        isSelected={value.autoplayOnStartup}
        onChange={(val) => onChange({ autoplayOnStartup: val })}
        aria-describedby={hintId}
        className="group flex items-start gap-2 text-sm text-slate-300"
      >
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-600 bg-slate-700 forced-colors:border-[ButtonText]">
          {value.autoplayOnStartup && <span aria-hidden="true">✓</span>}
        </div>
        <Label className="cursor-pointer select-none">{m.profile_autoplay_label()}</Label>
      </Checkbox>
      <p id={hintId} className="text-xs text-slate-400 forced-colors:text-[GrayText]">
        {m.profile_autoplay_hint()}
      </p>

      {/* Resume file: from last position vs from the beginning.
          Cold-start Ctrl+Shift+K only — in-session pause/resume is untouched. */}
      <Select
        selectedKey={value.resumeFileFrom}
        onSelectionChange={(key) =>
          onChange({ resumeFileFrom: key as ProfileSettings["resumeFileFrom"] })
        }
      >
        <Label className="block text-sm font-medium text-slate-300">
          {m.settings_resume_file_from()}
        </Label>
        <Button className="mt-1 flex w-48 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]">
          <SelectValue />
          <span aria-hidden="true">▼</span>
        </Button>
        <Popover className="w-48 rounded border border-slate-600 bg-slate-700 shadow-lg">
          <ListBox className="outline-none">
            <ListBoxItem
              id="position"
              className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
            >
              {m.settings_resume_from_position()}
            </ListBoxItem>
            <ListBoxItem
              id="start"
              className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
            >
              {m.settings_resume_from_start()}
            </ListBoxItem>
          </ListBox>
        </Popover>
      </Select>

      <Checkbox
        isSelected={value.autoAdvance}
        onChange={(val) => onChange({ autoAdvance: val })}
        className="flex items-center gap-2 text-sm text-slate-300"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700 forced-colors:border-[ButtonText]">
          {value.autoAdvance && <span aria-hidden="true">✓</span>}
        </div>
        <Label>{m.settings_auto_advance()}</Label>
      </Checkbox>
    </div>
  );
}
