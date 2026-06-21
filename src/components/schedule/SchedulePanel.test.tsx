import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SchedulePanel } from "./SchedulePanel";
import { $schedules, $scheduleSelection, $schedulesLoading, $schedulesError } from "../../stores/schedule";
import { replaceSelection } from "../../stores/selection";
import { $streams } from "../../stores/streams";
import { $announcer } from "../../stores/announcer";
import * as tauri from "../../lib/tauri";
import type { ScheduleDto, StreamInfo } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

vi.mock("../../lib/tauri", () => ({
  getSchedules: vi.fn(async () => []),
  addSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(async () => {}),
  toggleSchedule: vi.fn(),
}));

vi.mock("../../i18n/paraglide/runtime", () => ({ getLocale: () => "uk" }));

vi.mock("../../i18n/paraglide/messages", () => ({
  schedule_section: () => "Розклад",
  zone_schedule_toolbar: () => "Панель дій розкладу",
  zone_schedule_list: () => "Список розкладів",
  item_role_schedule: () => "розклад",
  schedule_add: () => "Додати розклад",
  schedule_loading: () => "Завантаження розкладів…",
  schedule_error: ({ error }: { error: string }) => `Помилка: ${error}`,
  schedule_empty: () => "Поки що немає розкладів",
  schedule_row_summary: ({ name }: { name: string }) => `row ${name}`,
  schedule_state_enabled: () => "Увімкнено",
  schedule_state_disabled: () => "Вимкнено",
  schedule_next_run_label: ({ when }: { when: string }) => `наступний запуск: ${when}`,
  schedule_stream_missing: () => "потік видалено",
  schedule_days_daily: () => "Щодня",
  day_short_0: () => "Пн", day_short_1: () => "Вт", day_short_2: () => "Ср",
  day_short_3: () => "Чт", day_short_4: () => "Пт", day_short_5: () => "Сб",
  day_short_6: () => "Нд",
  schedule_action_menu: () => "Дії",
  schedule_context_menu: () => "Дії з розкладом",
  schedule_action_edit: () => "Редагувати",
  schedule_action_enable: () => "Увімкнути",
  schedule_action_disable: () => "Вимкнути",
  schedule_action_delete: () => "Видалити",
  schedule_confirm_delete_title: () => "Видалити розклад",
  schedule_confirm_delete_body: ({ name }: { name: string }) => `Видалити «${name}»?`,
  schedule_deleted: ({ name }: { name: string }) => `Розклад «${name}» видалено`,
  schedule_added: ({ name }: { name: string }) => `Розклад «${name}» створено`,
  schedule_saved: ({ name }: { name: string }) => `Розклад «${name}» збережено`,
  schedule_toggled_on: ({ name }: { name: string }) => `Розклад «${name}» увімкнено`,
  schedule_toggled_off: ({ name }: { name: string }) => `Розклад «${name}» вимкнено`,
  schedule_form_add_title: () => "Додати розклад",
  schedule_form_edit_title: () => "Редагувати розклад",
  schedule_form_name: () => "Назва",
  schedule_form_stream: () => "Потік",
  schedule_form_type: () => "Тип",
  schedule_form_type_oneshot: () => "Одноразовий",
  schedule_form_type_recurring: () => "Повторюваний",
  schedule_form_days_legend: () => "Дні тижня",
  schedule_form_date: () => "Дата",
  schedule_form_time_start: () => "Час початку",
  schedule_form_time_end: () => "Час кінця",
  schedule_form_midnight_hint: () => "через північ",
  schedule_form_enabled: () => "Увімкнено",
  schedule_error_name_required: () => "Вкажіть назву",
  schedule_error_stream_required: () => "Оберіть потік",
  schedule_error_days_required: () => "Оберіть хоча б один день",
  schedule_error_date_required: () => "Вкажіть дату",
  schedule_error_time_required: () => "Вкажіть час у форматі ГГ:ХХ",
  schedule_error_time_equal: () => "Час кінця не може дорівнювати часу початку",
  schedule_result_none: () => "—",
  schedule_result_completed: ({ minutes }: { minutes: string }) => `✓ записано ${minutes} хв`,
  schedule_result_started_late: ({ minutes }: { minutes: string }) => `пізно ${minutes}`,
  schedule_result_missed: ({ reason }: { reason: string }) => `✗ (${reason})`,
  schedule_result_stopped_manual: () => "зупинено вручну",
  schedule_result_stopped_profile_switch: () => "зупинено: профіль",
  schedule_result_stopped_app_closing: () => "зупинено: закриття",
  schedule_result_stopped_edited: () => "зупинено: змінено",
  schedule_result_skipped: () => "потік уже записувався",
  schedule_reason_app_not_running: () => "Tapir не працював",
  schedule_reason_start_failed: () => "не вдалося стартувати запис",
  schedule_reason_clock_change: () => "переведення годинника",
  cancel: () => "Скасувати",
  save: () => "Зберегти",
  saving: () => "Збереження…",
  delete: () => "Видалити",
  selection_suffix: () => ", виділено",
  confirm_delete_selected_schedules: ({ count }: { count: number }) => `Видалити вибрані розклади (${count})?`,
  delete_selected: ({ count }: { count: number }) => `Видалити вибране (${count})`,
  schedules_removed_bulk: ({ count }: { count: number }) => `Видалено розкладів: ${count}`,
  select_all: () => "Вибрати все",
  clear_selection: () => "Зняти вибір",
  selection_count: ({ count }: { count: number }) => `Вибрано: ${count}`,
  selection_cleared: () => "Вибір знято",
  selected_count_label: ({ count }: { count: number }) => `${count} вибрано`,
}));

const stream: StreamInfo = {
  id: "st1", url: "http://x", name: "Radio Jazz UA", format: null, bitrate: null,
  icyName: null, icyGenre: null, icyUrl: null, ignorelist: [],
  username: null, password: null, addedAt: "2026-01-01",
} as unknown as StreamInfo;

const dto = (over: Partial<ScheduleDto> = {}): ScheduleDto => ({
  id: "s1", streamId: "st1", name: "Evening Jazz", type: "recurring",
  days: [0, 1, 2, 3, 4], date: null, time: "20:00", durationMinutes: 120,
  enabled: true, createdAt: "2026-06-12T10:00:00+03:00", lastResult: null,
  nextRun: "2026-06-12T20:00", ...over,
});

/** Seed both the store (immediate sync render) and the mount-load source. */
function seed(list: ScheduleDto[]) {
  $schedules.set(list);
  vi.mocked(tauri.getSchedules).mockResolvedValue(list);
}

function renderPanel() {
  return render(<SchedulePanel onZonesChange={() => {}} exitZone={() => {}} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  $schedules.set([]);
  $schedulesLoading.set(false);
  $schedulesError.set(null);
  $streams.set([stream]);
  $announcer.set(null);
  replaceSelection($scheduleSelection, new Set());
});

describe("SchedulePanel", () => {
  it("порожній стан із підказкою", async () => {
    renderPanel();
    expect(await screen.findByText("Поки що немає розкладів")).toBeTruthy();
  });

  it("рендерить рядок розкладу з назвою потоку", async () => {
    seed([dto()]);
    renderPanel();
    expect(await screen.findByText("Evening Jazz")).toBeTruthy();
    expect(screen.getByText(/Radio Jazz UA/)).toBeTruthy();
  });

  it("кнопка стану викликає toggle_schedule і озвучує", async () => {
    seed([dto()]);
    vi.mocked(tauri.toggleSchedule).mockResolvedValueOnce(
      { ...dto(), enabled: false } as never,
    );
    renderPanel();
    // A11y-ім'я кнопки — дієслово дії: для увімкненого розкладу це «Вимкнути».
    fireEvent.click(await screen.findByRole("button", { name: "Вимкнути" }));
    await waitFor(() =>
      expect(tauri.toggleSchedule).toHaveBeenCalledWith("s1", false));
    await waitFor(() =>
      expect($announcer.get()?.message).toBe("Розклад «Evening Jazz» вимкнено"));
  });

  it("«Додати розклад» відкриває форму", async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Додати розклад" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Додати розклад" })).toBeTruthy();
  });

  it("видалення — через confirm", async () => {
    seed([dto()]);
    renderPanel();
    // контекстне меню рядка
    fireEvent.click(await screen.findByRole("button", { name: "Дії" }));
    fireEvent.click(await screen.findByText("Видалити"));
    expect(await screen.findByText("Видалити «Evening Jazz»?")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Видалити" }).at(-1)!);
    await waitFor(() => expect(tauri.deleteSchedule).toHaveBeenCalledWith("s1"));
  });

  it("осиротілий розклад показує «потік видалено»", async () => {
    seed([dto({ streamId: "ghost" })]);
    renderPanel();
    expect(await screen.findByText(/потік видалено/)).toBeTruthy();
  });
});

describe("SchedulePanel — selection cluster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    $schedulesLoading.set(false);
    $schedulesError.set(null);
    $streams.set([stream]);
    $announcer.set(null);
    replaceSelection($scheduleSelection, new Set());
  });

  it("renders a select-all control that selects every schedule", async () => {
    const user = userEvent.setup();
    const s1 = dto({ id: "sched-1", name: "Morning Jazz" });
    const s2 = dto({ id: "sched-2", name: "Evening News" });
    seed([s1, s2]);
    renderPanel();
    // Wait for schedules to render
    await screen.findByText("Morning Jazz");
    // Click the select-all button
    await user.click(screen.getByRole("button", { name: m.select_all() }));
    // All schedule ids must be selected
    expect($scheduleSelection.get().size).toBe(2);
    expect([...$scheduleSelection.get()].sort()).toEqual(["sched-1", "sched-2"].sort());
    // Announce must report the count
    await waitFor(() =>
      expect($announcer.get()?.message).toBe(m.selection_count({ count: 2 })),
    );
  });

  it("clicking select-all twice clears the selection and announces cleared", async () => {
    const user = userEvent.setup();
    const s1 = dto({ id: "sched-1", name: "Morning Jazz" });
    seed([s1]);
    seed([s1]);
    renderPanel();
    await screen.findByText("Morning Jazz");
    // Select all
    await user.click(screen.getByRole("button", { name: m.select_all() }));
    expect($scheduleSelection.get().size).toBe(1);
    // Deselect all (button label flips to clear_selection when all selected)
    await user.click(screen.getByRole("button", { name: m.clear_selection() }));
    expect($scheduleSelection.get().size).toBe(0);
    await waitFor(() =>
      expect($announcer.get()?.message).toBe(m.selection_cleared()),
    );
  });

  it("clears selection on unmount", async () => {
    const s1 = dto({ id: "sched-1", name: "Morning Jazz" });
    seed([s1]);
    const { unmount } = renderPanel();
    await screen.findByText("Morning Jazz");
    // Manually select something
    act(() => { replaceSelection($scheduleSelection, new Set(["sched-1"])); });
    expect($scheduleSelection.get().size).toBe(1);
    unmount();
    expect($scheduleSelection.get().size).toBe(0);
  });
});
