import { useState } from "react";
import {
  Dialog, Modal, ModalOverlay, Heading,
  Select, SelectValue, Label, ListBox, ListBoxItem, Popover, Button,
} from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $streams } from "../../stores/streams";
import { useAnnounce } from "../../hooks/useAnnounce";
import * as tauri from "../../lib/tauri";
import type { ScheduleDto, ScheduleType, ScheduledRecording } from "../../lib/tauri";
import { endTime } from "../../lib/scheduleFormat";
import {
  validateForm, toInput, type FormErrorCode, type FormErrors,
} from "./formModel";
import * as m from "../../i18n/paraglide/messages";

const DAY_LABELS = [
  m.day_short_0, m.day_short_1, m.day_short_2, m.day_short_3,
  m.day_short_4, m.day_short_5, m.day_short_6,
] as const;

const ERROR_MESSAGES: Record<FormErrorCode, () => string> = {
  nameRequired: m.schedule_error_name_required,
  streamRequired: m.schedule_error_stream_required,
  daysRequired: m.schedule_error_days_required,
  dateRequired: m.schedule_error_date_required,
  timeRequired: m.schedule_error_time_required,
  timeEqual: m.schedule_error_time_equal,
};

const INPUT_CLS =
  "rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:border-blue-500 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText] forced-colors:focus:border-[Highlight]";

interface Props {
  /** null — створення; інакше — редагування. */
  schedule: ScheduleDto | null;
  onSaved: (saved: ScheduledRecording, isNew: boolean) => void;
  onClose: () => void;
}

export function ScheduleForm({ schedule, onSaved, onClose }: Props) {
  const streams = useStore($streams);
  const announce = useAnnounce();
  const isEdit = schedule !== null;

  const [name, setName] = useState(schedule?.name ?? "");
  const [streamId, setStreamId] = useState(schedule?.streamId ?? "");
  const [type, setType] = useState<ScheduleType>(schedule?.type ?? "recurring");
  const [days, setDays] = useState<number[]>(schedule?.days ?? []);
  const [date, setDate] = useState(schedule?.date ?? "");
  const [timeStart, setTimeStart] = useState(schedule?.time ?? "");
  const [timeEnd, setTimeEnd] = useState(
    schedule ? endTime(schedule.time, schedule.durationMinutes) : "",
  );
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const errorText = (field: keyof FormErrors): string | null => {
    const code = errors[field];
    return code ? ERROR_MESSAGES[code]() : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const values = { name, streamId, type, days, date, timeStart, timeEnd };
    const errs = validateForm(values);
    setErrors(errs);
    const firstField = (Object.keys(errs) as (keyof FormErrors)[])[0];
    if (firstField) {
      // §5.3: озвучення помилки — live region працює в модалці
      // (data-live-announcer у LiveAnnouncer).
      announce(ERROR_MESSAGES[errs[firstField]!](), "assertive");
      return;
    }
    setBusy(true);
    try {
      let saved: ScheduledRecording;
      if (isEdit && schedule) {
        saved = await tauri.updateSchedule({
          id: schedule.id,
          // §2: createdAt/lastResult пише лише backend — ці значення він ігнорує.
          createdAt: schedule.createdAt,
          lastResult: schedule.lastResult,
          ...toInput(values, enabled),
        });
      } else {
        saved = await tauri.addSchedule(toInput(values, enabled));
      }
      onSaved(saved, !isEdit);
    } catch (err) {
      // Backend-валідація (oneshot у минулому, неіснуючий потік тощо).
      setSubmitError(String(err));
      announce(String(err), "assertive");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <Modal className="max-h-[90vh] w-[28rem] overflow-y-auto rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog className="outline-none">
          <Heading slot="title" className="mb-4 text-lg font-semibold text-slate-100">
            {isEdit ? m.schedule_form_edit_title() : m.schedule_form_add_title()}
          </Heading>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
            {/* 1. Назва */}
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {m.schedule_form_name()}
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                disabled={busy}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "schedule-name-error" : undefined}
                className={INPUT_CLS}
              />
              {errorText("name") && (
                <span id="schedule-name-error" role="alert" className="text-xs text-red-400">
                  {errorText("name")}
                </span>
              )}
            </label>

            {/* 2. Потік */}
            <Select
              selectedKey={streamId || null}
              onSelectionChange={(k) => setStreamId(String(k))}
              isDisabled={busy}
              className="flex flex-col gap-1"
            >
              <Label className="text-sm text-slate-300">{m.schedule_form_stream()}</Label>
              <Button className={`flex items-center justify-between text-left text-sm ${INPUT_CLS}`}>
                <SelectValue />
                <span aria-hidden>▾</span>
              </Button>
              <Popover className="w-80 rounded border border-slate-600 bg-slate-700 shadow-lg">
                <ListBox className="max-h-64 overflow-y-auto outline-none">
                  {streams.map((s) => (
                    <ListBoxItem
                      key={s.id}
                      id={s.id}
                      className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none data-[focused]:bg-slate-600 forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]"
                    >
                      {s.name}
                    </ListBoxItem>
                  ))}
                </ListBox>
              </Popover>
            </Select>
            {errorText("streamId") && (
              <span role="alert" className="text-xs text-red-400">{errorText("streamId")}</span>
            )}

            {/* 3. Тип */}
            <fieldset className="text-sm text-slate-300">
              <legend className="mb-1">{m.schedule_form_type()}</legend>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="schedule-type"
                    checked={type === "recurring"}
                    onChange={() => setType("recurring")}
                    disabled={busy}
                  />
                  {m.schedule_form_type_recurring()}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="schedule-type"
                    checked={type === "oneshot"}
                    onChange={() => setType("oneshot")}
                    disabled={busy}
                  />
                  {m.schedule_form_type_oneshot()}
                </label>
              </div>
            </fieldset>

            {/* 4. Дні (recurring) або дата (oneshot) */}
            {type === "recurring" ? (
              <fieldset className="text-sm text-slate-300">
                <legend className="mb-1">{m.schedule_form_days_legend()}</legend>
                <div className="flex flex-wrap gap-3">
                  {DAY_LABELS.map((label, i) => (
                    <label key={i} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={days.includes(i)}
                        disabled={busy}
                        onChange={(e) =>
                          setDays(e.target.checked
                            ? [...days, i]
                            : days.filter((d) => d !== i))
                        }
                      />
                      {label()}
                    </label>
                  ))}
                </div>
                {errorText("days") && (
                  <span role="alert" className="text-xs text-red-400">{errorText("days")}</span>
                )}
              </fieldset>
            ) : (
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                {m.schedule_form_date()}
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={busy}
                  aria-invalid={errors.date ? true : undefined}
                  aria-describedby={errors.date ? "schedule-date-error" : undefined}
                  className={INPUT_CLS}
                />
                {errorText("date") && (
                  <span id="schedule-date-error" role="alert" className="text-xs text-red-400">
                    {errorText("date")}
                  </span>
                )}
              </label>
            )}

            {/* 5. Час початку / кінця (+ hint про північ, §5.3) */}
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
                {m.schedule_form_time_start()}
                <input
                  type="time"
                  value={timeStart}
                  onChange={(e) => setTimeStart(e.target.value)}
                  disabled={busy}
                  aria-invalid={errors.time ? true : undefined}
                  aria-describedby={
                    errors.time ? "schedule-time-hint schedule-time-error" : "schedule-time-hint"
                  }
                  className={INPUT_CLS}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
                {m.schedule_form_time_end()}
                <input
                  type="time"
                  value={timeEnd}
                  onChange={(e) => setTimeEnd(e.target.value)}
                  disabled={busy}
                  aria-invalid={errors.time ? true : undefined}
                  aria-describedby={
                    errors.time ? "schedule-time-hint schedule-time-error" : "schedule-time-hint"
                  }
                  className={INPUT_CLS}
                />
              </label>
            </div>
            <p id="schedule-time-hint" className="text-xs text-slate-500">
              {m.schedule_form_midnight_hint()}
            </p>
            {errorText("time") && (
              <span id="schedule-time-error" role="alert" className="text-xs text-red-400">
                {errorText("time")}
              </span>
            )}

            {/* 6. Увімкнено */}
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={busy}
              />
              {m.schedule_form_enabled()}
            </label>

            {submitError && (
              <p role="alert" className="text-sm text-red-400 forced-colors:text-[CanvasText]">
                {submitError}
              </p>
            )}

            {/* 7. OK / Скасувати */}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                {m.cancel()}
              </button>
              <button
                type="submit"
                disabled={busy}
                aria-busy={busy || undefined}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                {busy ? m.saving() : m.save()}
              </button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
