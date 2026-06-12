# Scheduler Фаза 3 — UI, доступність, i18n: план імплементації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реалізувати §5 спеки Phase 3D повністю: store `src/stores/schedule.ts`, SchedulePanel/ScheduleTable/ScheduleForm, група «Планувальник» у Settings, confirm-діалоги (переключення профілю, закриття додатка), live region, balloon tips, Paraglide-рядки. Закриває критерії Done (§6); завершення фази — ручний NVDA-сценарій §7.

**Architecture:** Frontend — презентаційний шар над готовим Phase 2 backend: nanostores-store зі списком розкладів (`get_schedules`), composite-list екран за патернами Saved Songs / Profiles (зони F6 через stable proxy), модальна форма react-aria, глобальний хук подій `scheduled-*` (refetch store + assertive live region). Backend отримує три аддитивні зміни: команда `get_active_scheduled` (дані для confirm-діалогів), розширене тіло native quit-confirm і balloon-дублікати подій у `tray/notify.rs`.

**Tech Stack:** React 19 + react-aria-components + nanostores + Paraglide.js; Rust (Tauri v2, chrono, tauri-plugin-notification); тести — vitest (@testing-library/react) + `cargo test`.

**Спека:** [2026-06-12-scheduler-design.md](../specs/2026-06-12-scheduler-design.md) (§5, §4, §3.5, §6, §7, §9 «Фаза 3»). Контракти (модель §2, IPC §4) фіксовані — зміна спершу вноситься у спеку (Task 4 додає команду в §4).

**Гілка:** продовжуємо `feature/phase-3d-scheduler` (Фази 1–2 уже в ній).

**Gates (усі зелені перед мерджем):**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
pnpm test
pnpm vite:build
```

Увага: `npx tsc --noEmit` має ~51 старих помилок (нетипізований paraglide) — він НЕ gate. Paraglide-повідомлення перекомпільовуються автоматично: і vitest, і vite build вантажать `vite.config.ts` із paraglide-плагіном, тож після редагування `src/i18n/messages/*.json` нічого вручну генерувати не треба.

---

## Зафіксовані рішення (поза буквою спеки — обґрунтування)

1. **«ScheduleTable» — це composite-list, а не `<table>`.** Спека §5.2 прямо каже «Composite-list за патернами Saved Songs». Колонки спеки стають сегментами рядка: рядок 1 — назва + стан-іконка + кнопки (toggle, меню), рядок 2 — потік · коли · наступний запуск · останній результат. Повна «таблична» інформація озвучується через summary-label рядка (як `songs_row_summary`).
2. **Confirm закриття додатка лишається native MessageBox.** Шляхи закриття (Alt+F4 / хрестик при `minimize_to_tray = false`, tray-меню Quit) уже проходять через `confirm_quit_if_recording`; tray Quit працює і зі схованим вікном, де webview-діалог неможливий. Розширюємо **тіло** MessageBox переліком активних планових записів («Триває плановий запис «X» до 22:05»). Native-рядки україномовні — як усі існуючі рядки в `tray/notify.rs`.
3. **Balloon tips гейтяться `showTrayNotifications`** (це і є «механізм Фази 3A», §5.5), без тротлінгу — події рідкісні. `StoppedByUser` balloon не дублюється (ручну зупинку вже озвучує існуючий recording-флоу) — симетрично правилу live region із §4.
4. **`get_active_scheduled` — нова IPC-команда.** §3.5 вимагає confirm із назвою і часом кінця планового запису; цих даних у frontend немає. Команда аддитивна; Task 4 вносить її в таблицю §4 спеки (правило «контракти фіксовані — зміна спершу в спеку»).
5. **Loading-стан показується лише коли store порожній.** Рефетч після кожної події `scheduled-*` не повинен демонтувати CompositeList (інакше — втрата фокуса посеред навігації NVDA). Послідовність відповідей гарантує лічильник `loadSeq`.
6. **Взаємодія з рядком:** Enter (primary) = редагувати, Space (toggle) = увімкнути/вимкнути, Delete = видалити з confirm. Кнопка-стоп `action-toggle` (новий `SegmentKind`) та контекстне меню дублюють ці дії.
7. **Назви днів — i18n-ключі `day_short_0..6`** (Пн..Нд, індекси = модель §2), спільні для чекбоксів форми і форматування колонок. Дати — `Intl.DateTimeFormat(getLocale())`; час «HH:MM» береться з моделі як є.
8. **Помилки форми** — коди з чистого `formModel.ts`, компонент мапить їх на Paraglide-рядки: `role="alert"` біля поля + `aria-describedby` + assertive announce першої помилки (працює в модалці завдяки `data-live-announcer`, див. LiveAnnouncer). Помилки backend-валідації (oneshot у минулому тощо) — form-level `role="alert"` + announce.
9. **`useProfileSync` додатково рефетчить розклади** на `profile-changed` — інакше після переключення профілю відкритий SchedulePanel показував би чужі розклади.

## Структура файлів

| Файл | Дія | Відповідальність |
|------|-----|------------------|
| `src/i18n/messages/uk.json`, `en.json` | modify | Усі нові рядки (§5.6), українська першою |
| `src/lib/scheduleFormat.ts` (+`.test.ts`) | create | Чисте форматування: дні, «Коли», nextRun, останній результат, текст confirm |
| `src/stores/schedule.ts` (+`.test.ts`) | create | `$schedules` + `loadSchedules()` із guard послідовності |
| `src/hooks/useProfileSync.ts` | modify | Рефетч розкладів на `profile-changed` |
| `src-tauri/src/scheduler/core.rs` | modify | `active_overview()` — знімок активних входжень |
| `src-tauri/src/commands/schedule_commands.rs` | modify | Команда `get_active_scheduled` + DTO |
| `src-tauri/src/lib.rs` | modify | Реєстрація команди |
| `src-tauri/src/tray/notify.rs` | modify | Тіло quit-confirm зі списком планових; balloon-хелпери `scheduled_*` |
| `src-tauri/src/scheduler/timer.rs` | modify | Виклики balloon-хелперів поруч з emit подій |
| `src/lib/tauri.ts` | modify | `getActiveScheduled` + тип `ActiveScheduled` + типи payload-ів `scheduled-*` |
| `src/hooks/useScheduleEvents.ts` (+`.test.tsx`) | create | Підписка на 4 події: refetch + assertive announce |
| `src/hooks/useCompositeList.ts` | modify | `SegmentKind` += `'action-toggle'` |
| `src/components/schedule/ScheduleContextMenu.tsx` | create | Меню рядка: Редагувати / Увімкнути-Вимкнути / Видалити |
| `src/components/schedule/ScheduleItem.tsx` | create | Рядок composite-list (сегменти track/tech/action-toggle/action-menu) |
| `src/components/schedule/ScheduleTable.tsx` | create | CompositeList + `focusSchedule(id)` |
| `src/components/schedule/formModel.ts` (+`.test.ts`) | create | Чиста валідація форми, тривалість, збирання `ScheduledRecordingInput` |
| `src/components/schedule/ScheduleForm.tsx` | create | Модальний діалог add/edit (§5.3) |
| `src/components/schedule/SchedulePanel.tsx` (+`.test.tsx`) | create | Екран: toolbar-зона + таблиця + діалоги |
| `src/App.tsx` | modify | Рендер SchedulePanel, монтування `useScheduleEvents` |
| `src/lib/sections.ts`, `src/components/layout/ActivityBar.tsx` | modify | Увімкнути секцію Schedule (Alt+4) |
| `src/components/settings/RecordingTab.tsx` (+`.test.tsx`) | modify/create | Група «Планувальник»: padding 0–30 / 0–60 |
| `src/components/profile/ProfilesPanel.tsx` (+`.test.tsx`) | modify | Schedule-специфічний confirm переключення профілю |
| `docs/superpowers/specs/2026-06-12-scheduler-design.md` | modify | §4: рядок `get_active_scheduled`; §9: лінк на цей план; §6: чекбокси Done |
| `AGENTS.md`, `docs/implementation-phases.md` | modify | Статус Phase 3D |

---

### Task 1: i18n-рядки (uk + en)

Усі нові рядки фази — одним комітом, щоб подальші таски компілювались. Конфігураційний таск — без TDD-кроків; «тестом» є компіляція paraglide у `pnpm vite:build`.

**Files:**
- Modify: `src/i18n/messages/uk.json`
- Modify: `src/i18n/messages/en.json`

- [ ] **Step 1: Додати ключі в `uk.json`** (у кінець об'єкта, зберігаючи валідний JSON):

```json
  "schedule_add": "Додати розклад",
  "zone_schedule_toolbar": "Панель дій розкладу",
  "zone_schedule_list": "Список розкладів",
  "item_role_schedule": "розклад",
  "schedule_loading": "Завантаження розкладів…",
  "schedule_error": "Не вдалось завантажити розклади: {error}",
  "schedule_empty": "Поки що немає розкладів. Натисніть «Додати розклад», щоб запланувати запис.",
  "schedule_row_summary": "{name}, {state}, {stream}, {when}, наступний запуск: {next}, останній результат: {result}",
  "schedule_state_enabled": "Увімкнено",
  "schedule_state_disabled": "Вимкнено",
  "schedule_next_run_label": "наступний запуск: {when}",
  "schedule_stream_missing": "потік видалено",
  "schedule_days_daily": "Щодня",
  "day_short_0": "Пн",
  "day_short_1": "Вт",
  "day_short_2": "Ср",
  "day_short_3": "Чт",
  "day_short_4": "Пт",
  "day_short_5": "Сб",
  "day_short_6": "Нд",
  "schedule_action_menu": "Дії",
  "schedule_context_menu": "Дії з розкладом",
  "schedule_action_edit": "Редагувати",
  "schedule_action_enable": "Увімкнути",
  "schedule_action_disable": "Вимкнути",
  "schedule_action_delete": "Видалити",
  "schedule_confirm_delete_title": "Видалити розклад",
  "schedule_confirm_delete_body": "Видалити розклад «{name}»?",
  "schedule_deleted": "Розклад «{name}» видалено",
  "schedule_added": "Розклад «{name}» створено",
  "schedule_saved": "Розклад «{name}» збережено",
  "schedule_toggled_on": "Розклад «{name}» увімкнено",
  "schedule_toggled_off": "Розклад «{name}» вимкнено",
  "schedule_form_add_title": "Додати розклад",
  "schedule_form_edit_title": "Редагувати розклад",
  "schedule_form_name": "Назва",
  "schedule_form_stream": "Потік",
  "schedule_form_type": "Тип",
  "schedule_form_type_oneshot": "Одноразовий",
  "schedule_form_type_recurring": "Повторюваний",
  "schedule_form_days_legend": "Дні тижня",
  "schedule_form_date": "Дата",
  "schedule_form_time_start": "Час початку",
  "schedule_form_time_end": "Час кінця",
  "schedule_form_midnight_hint": "Кінець, менший за початок, — запис через північ: 22:30 → 00:30",
  "schedule_form_enabled": "Увімкнено",
  "schedule_error_name_required": "Вкажіть назву",
  "schedule_error_stream_required": "Оберіть потік",
  "schedule_error_days_required": "Оберіть хоча б один день",
  "schedule_error_date_required": "Вкажіть дату",
  "schedule_error_time_required": "Вкажіть час у форматі ГГ:ХХ",
  "schedule_error_time_equal": "Час кінця не може дорівнювати часу початку",
  "schedule_result_none": "—",
  "schedule_result_completed": "✓ записано {minutes} хв",
  "schedule_result_started_late": "почато із запізненням, {minutes} хв",
  "schedule_result_missed": "✗ пропущено ({reason})",
  "schedule_result_stopped_manual": "зупинено вручну",
  "schedule_result_stopped_profile_switch": "зупинено: переключення профілю",
  "schedule_result_stopped_app_closing": "зупинено: закриття додатка",
  "schedule_result_stopped_edited": "зупинено: розклад змінено",
  "schedule_result_skipped": "потік уже записувався",
  "schedule_reason_app_not_running": "Tapir не працював",
  "schedule_reason_start_failed": "не вдалося стартувати запис",
  "schedule_reason_clock_change": "переведення годинника",
  "scheduled_announce_started": "Плановий запис «{name}» розпочато",
  "scheduled_announce_completed": "Плановий запис «{name}» завершено, записано {minutes} хв",
  "scheduled_announce_missed": "Плановий запис «{name}» пропущено: {reason}",
  "scheduled_announce_skipped": "Плановий запис «{name}» не стартував: потік уже записується",
  "profile_switch_scheduled_one": "Триває плановий запис «{name}» до {end}. Переключити профіль і зупинити його?",
  "profile_switch_scheduled_item": "«{name}» до {end}",
  "profile_switch_scheduled_many": "Тривають планові записи: {list}. Переключити профіль і зупинити їх?",
  "settings_section_scheduler": "Планувальник",
  "settings_schedule_pad_before": "Починати раніше, хв",
  "settings_schedule_pad_after": "Закінчувати пізніше, хв"
```

- [ ] **Step 2: Додати ті самі ключі в `en.json`:**

```json
  "schedule_add": "Add schedule",
  "zone_schedule_toolbar": "Schedule actions toolbar",
  "zone_schedule_list": "Schedules list",
  "item_role_schedule": "schedule",
  "schedule_loading": "Loading schedules…",
  "schedule_error": "Failed to load schedules: {error}",
  "schedule_empty": "No schedules yet. Press \"Add schedule\" to plan a recording.",
  "schedule_row_summary": "{name}, {state}, {stream}, {when}, next run: {next}, last result: {result}",
  "schedule_state_enabled": "Enabled",
  "schedule_state_disabled": "Disabled",
  "schedule_next_run_label": "next run: {when}",
  "schedule_stream_missing": "stream removed",
  "schedule_days_daily": "Daily",
  "day_short_0": "Mon",
  "day_short_1": "Tue",
  "day_short_2": "Wed",
  "day_short_3": "Thu",
  "day_short_4": "Fri",
  "day_short_5": "Sat",
  "day_short_6": "Sun",
  "schedule_action_menu": "Actions",
  "schedule_context_menu": "Schedule actions",
  "schedule_action_edit": "Edit",
  "schedule_action_enable": "Enable",
  "schedule_action_disable": "Disable",
  "schedule_action_delete": "Delete",
  "schedule_confirm_delete_title": "Delete schedule",
  "schedule_confirm_delete_body": "Delete schedule \"{name}\"?",
  "schedule_deleted": "Schedule \"{name}\" deleted",
  "schedule_added": "Schedule \"{name}\" created",
  "schedule_saved": "Schedule \"{name}\" saved",
  "schedule_toggled_on": "Schedule \"{name}\" enabled",
  "schedule_toggled_off": "Schedule \"{name}\" disabled",
  "schedule_form_add_title": "Add schedule",
  "schedule_form_edit_title": "Edit schedule",
  "schedule_form_name": "Name",
  "schedule_form_stream": "Stream",
  "schedule_form_type": "Type",
  "schedule_form_type_oneshot": "One-time",
  "schedule_form_type_recurring": "Recurring",
  "schedule_form_days_legend": "Days of week",
  "schedule_form_date": "Date",
  "schedule_form_time_start": "Start time",
  "schedule_form_time_end": "End time",
  "schedule_form_midnight_hint": "End earlier than start means recording across midnight: 22:30 → 00:30",
  "schedule_form_enabled": "Enabled",
  "schedule_error_name_required": "Enter a name",
  "schedule_error_stream_required": "Select a stream",
  "schedule_error_days_required": "Select at least one day",
  "schedule_error_date_required": "Enter a date",
  "schedule_error_time_required": "Enter time as HH:MM",
  "schedule_error_time_equal": "End time must differ from start time",
  "schedule_result_none": "—",
  "schedule_result_completed": "✓ recorded {minutes} min",
  "schedule_result_started_late": "started late, {minutes} min",
  "schedule_result_missed": "✗ missed ({reason})",
  "schedule_result_stopped_manual": "stopped manually",
  "schedule_result_stopped_profile_switch": "stopped: profile switch",
  "schedule_result_stopped_app_closing": "stopped: app closing",
  "schedule_result_stopped_edited": "stopped: schedule edited",
  "schedule_result_skipped": "stream was already recording",
  "schedule_reason_app_not_running": "Tapir was not running",
  "schedule_reason_start_failed": "recording failed to start",
  "schedule_reason_clock_change": "clock change",
  "scheduled_announce_started": "Scheduled recording \"{name}\" started",
  "scheduled_announce_completed": "Scheduled recording \"{name}\" finished, recorded {minutes} min",
  "scheduled_announce_missed": "Scheduled recording \"{name}\" missed: {reason}",
  "scheduled_announce_skipped": "Scheduled recording \"{name}\" did not start: stream is already recording",
  "profile_switch_scheduled_one": "Scheduled recording \"{name}\" is running until {end}. Switch profile and stop it?",
  "profile_switch_scheduled_item": "\"{name}\" until {end}",
  "profile_switch_scheduled_many": "Scheduled recordings are running: {list}. Switch profile and stop them?",
  "settings_section_scheduler": "Scheduler",
  "settings_schedule_pad_before": "Start earlier, min",
  "settings_schedule_pad_after": "Stop later, min"
```

- [ ] **Step 3: Перевірити компіляцію**

Run: `pnpm vite:build`
Expected: build без помилок (paraglide перегенерував `src/i18n/paraglide/messages`).

- [ ] **Step 4: Commit**

```powershell
git add src/i18n/messages/uk.json src/i18n/messages/en.json
git commit -m "feat(scheduler): i18n strings for scheduler UI (uk/en)"
```

---

### Task 2: `src/lib/scheduleFormat.ts` — чисте форматування

**Files:**
- Create: `src/lib/scheduleFormat.ts`
- Test: `src/lib/scheduleFormat.test.ts`

- [ ] **Step 1: Написати failing-тести**

Створити `src/lib/scheduleFormat.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../i18n/paraglide/runtime", () => ({ getLocale: () => "uk" }));
vi.mock("../i18n/paraglide/messages", () => ({
  day_short_0: () => "Пн", day_short_1: () => "Вт", day_short_2: () => "Ср",
  day_short_3: () => "Чт", day_short_4: () => "Пт", day_short_5: () => "Сб",
  day_short_6: () => "Нд",
  schedule_days_daily: () => "Щодня",
  schedule_state_enabled: () => "Увімкнено",
  schedule_state_disabled: () => "Вимкнено",
  schedule_result_none: () => "—",
  schedule_result_completed: ({ minutes }: { minutes: string }) => `✓ записано ${minutes} хв`,
  schedule_result_started_late: ({ minutes }: { minutes: string }) => `почато із запізненням, ${minutes} хв`,
  schedule_result_missed: ({ reason }: { reason: string }) => `✗ пропущено (${reason})`,
  schedule_result_stopped_manual: () => "зупинено вручну",
  schedule_result_stopped_profile_switch: () => "зупинено: переключення профілю",
  schedule_result_stopped_app_closing: () => "зупинено: закриття додатка",
  schedule_result_stopped_edited: () => "зупинено: розклад змінено",
  schedule_result_skipped: () => "потік уже записувався",
  schedule_reason_app_not_running: () => "Tapir не працював",
  schedule_reason_start_failed: () => "не вдалося стартувати запис",
  schedule_reason_clock_change: () => "переведення годинника",
  profile_switch_scheduled_one: ({ name, end }: { name: string; end: string }) =>
    `Триває плановий запис «${name}» до ${end}. Переключити профіль і зупинити його?`,
  profile_switch_scheduled_item: ({ name, end }: { name: string; end: string }) => `«${name}» до ${end}`,
  profile_switch_scheduled_many: ({ list }: { list: string }) =>
    `Тривають планові записи: ${list}. Переключити профіль і зупинити їх?`,
}));

import {
  endTime, formatDays, formatWhen, formatNextRun,
  lastResultText, missedReasonText, stateText, activeScheduledMessage,
} from "./scheduleFormat";
import type { ScheduleDto, ScheduleResult } from "./tauri";

function dto(over: Partial<ScheduleDto>): ScheduleDto {
  return {
    id: "s1", streamId: "st1", name: "Evening Jazz", type: "recurring",
    days: [0, 1, 2, 3, 4], date: null, time: "20:00", durationMinutes: 120,
    enabled: true, createdAt: "2026-06-12T10:00:00+03:00", lastResult: null,
    nextRun: null, ...over,
  };
}

describe("endTime", () => {
  it("додає тривалість", () => expect(endTime("20:00", 120)).toBe("22:00"));
  it("перехід через північ — за модулем доби", () => expect(endTime("23:30", 60)).toBe("00:30"));
});

describe("formatDays", () => {
  it("колапсить послідовні дні від трьох у діапазон", () =>
    expect(formatDays([0, 1, 2, 3, 4])).toBe("Пн–Пт"));
  it("несуміжні — через кому", () => expect(formatDays([0, 2, 4])).toBe("Пн, Ср, Пт"));
  it("пара днів не колапситься", () => expect(formatDays([5, 6])).toBe("Сб, Нд"));
  it("усі сім — «Щодня»", () => expect(formatDays([0, 1, 2, 3, 4, 5, 6])).toBe("Щодня"));
});

describe("formatWhen", () => {
  it("recurring: дні + діапазон часу", () =>
    expect(formatWhen(dto({}))).toBe("Пн–Пт 20:00–22:00"));
  it("oneshot: локалізована дата + діапазон", () =>
    expect(formatWhen(dto({ type: "oneshot", days: [], date: "2026-06-14" })))
      .toBe("14.06.2026 20:00–22:00"));
});

describe("formatNextRun", () => {
  it("null → «—»", () => expect(formatNextRun(null)).toBe("—"));
  it("день тижня + дата + час", () =>
    // 2026-06-13 — субота
    expect(formatNextRun("2026-06-13T20:00")).toBe("Сб 13.06 20:00"));
});

describe("lastResultText", () => {
  const res = (over: Partial<ScheduleResult>): ScheduleResult => ({
    occurrence: "2026-06-12T20:00", status: "completed", reason: null,
    recordedMinutes: 119, finishedAt: "2026-06-12T22:00:00", ...over,
  });
  it("null → «—»", () => expect(lastResultText(null)).toBe("—"));
  it("completed", () => expect(lastResultText(res({}))).toBe("✓ записано 119 хв"));
  it("startedLate", () =>
    expect(lastResultText(res({ status: "startedLate", recordedMinutes: 80 })))
      .toBe("почато із запізненням, 80 хв"));
  it("missed + reason", () =>
    expect(lastResultText(res({ status: "missed", reason: "appNotRunning", recordedMinutes: 0 })))
      .toBe("✗ пропущено (Tapir не працював)"));
  it("stoppedByUser за кодом причини", () => {
    expect(lastResultText(res({ status: "stoppedByUser", reason: "manualStop" }))).toBe("зупинено вручну");
    expect(lastResultText(res({ status: "stoppedByUser", reason: "profileSwitch" }))).toBe("зупинено: переключення профілю");
    expect(lastResultText(res({ status: "stoppedByUser", reason: "appClosing" }))).toBe("зупинено: закриття додатка");
    expect(lastResultText(res({ status: "stoppedByUser", reason: "scheduleEdited" }))).toBe("зупинено: розклад змінено");
  });
  it("skippedAlreadyRecording", () =>
    expect(lastResultText(res({ status: "skippedAlreadyRecording" }))).toBe("потік уже записувався"));
});

describe("missedReasonText", () => {
  it("мапить коди", () => {
    expect(missedReasonText("appNotRunning")).toBe("Tapir не працював");
    expect(missedReasonText("startFailed")).toBe("не вдалося стартувати запис");
    expect(missedReasonText("clockChange")).toBe("переведення годинника");
    expect(missedReasonText(null)).toBe("—");
  });
});

describe("stateText", () => {
  it("enabled/disabled", () => {
    expect(stateText(true)).toBe("Увімкнено");
    expect(stateText(false)).toBe("Вимкнено");
  });
});

describe("activeScheduledMessage", () => {
  const a = (name: string, windowEnd: string) =>
    ({ recordingId: "r1", name, streamId: "st1", windowEnd });
  it("однина: назва + кінець вікна HH:MM", () =>
    expect(activeScheduledMessage([a("Evening Jazz", "2026-06-12T22:05")]))
      .toBe("Триває плановий запис «Evening Jazz» до 22:05. Переключити профіль і зупинити його?"));
  it("множина: перелік", () =>
    expect(activeScheduledMessage([a("A", "2026-06-12T22:05"), a("B", "2026-06-12T23:10")]))
      .toBe("Тривають планові записи: «A» до 22:05, «B» до 23:10. Переключити профіль і зупинити їх?"));
});
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `pnpm test src/lib/scheduleFormat.test.ts`
Expected: FAIL — `Cannot find module './scheduleFormat'`.

- [ ] **Step 3: Реалізувати `src/lib/scheduleFormat.ts`**

```ts
import { getLocale } from "../i18n/paraglide/runtime";
import * as m from "../i18n/paraglide/messages";
import type {
  ActiveScheduled, ScheduleDto, ScheduleResult, ScheduleResultReason,
} from "./tauri";

// Індекси днів — модель §2: 0=Пн..6=Нд.
const DAY_LABELS = [
  m.day_short_0, m.day_short_1, m.day_short_2, m.day_short_3,
  m.day_short_4, m.day_short_5, m.day_short_6,
] as const;

function day(i: number): string {
  return DAY_LABELS[i]?.() ?? String(i);
}

/** Час кінця вікна: початок + тривалість за модулем доби ("23:30"+60 → "00:30"). */
export function endTime(time: string, durationMinutes: number): string {
  const [h, min] = time.split(":").map(Number);
  const total = (h * 60 + min + durationMinutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** «Пн–Пт» / «Пн, Ср, Пт» / «Щодня». Колапс лише для пробігів від 3 днів. */
export function formatDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return m.schedule_days_daily();
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (j - i >= 2) parts.push(`${day(sorted[i])}–${day(sorted[j])}`);
    else for (let k = i; k <= j; k++) parts.push(day(sorted[k]));
    i = j + 1;
  }
  return parts.join(", ");
}

function formatIsoDate(iso: string): string {
  // "2026-06-14" → локалізована коротка дата ("14.06.2026" для uk)
  const d = new Date(`${iso}T00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(getLocale(), {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d);
}

/** Колонка «Коли» (§5.2): «Пн–Пт 20:00–22:00» / «14.06.2026 20:00–22:00». */
export function formatWhen(s: ScheduleDto): string {
  const range = `${s.time}–${endTime(s.time, s.durationMinutes)}`;
  if (s.type === "recurring") return `${formatDays(s.days)} ${range}`;
  return `${s.date ? formatIsoDate(s.date) : "—"} ${range}`;
}

/** Колонка «Наступний запуск»: «Сб 13.06 20:00»; null → «—». */
export function formatNextRun(nextRun: string | null): string {
  if (!nextRun) return "—";
  const d = new Date(nextRun); // без TZ-суфікса → локальний час
  if (Number.isNaN(d.getTime())) return nextRun;
  const dayIdx = (d.getDay() + 6) % 7; // JS: 0=Нд..6=Сб → модель: 0=Пн..6=Нд
  const dm = new Intl.DateTimeFormat(getLocale(), { day: "2-digit", month: "2-digit" }).format(d);
  return `${day(dayIdx)} ${dm} ${nextRun.slice(11, 16)}`;
}

export function missedReasonText(reason: ScheduleResultReason | null): string {
  switch (reason) {
    case "appNotRunning": return m.schedule_reason_app_not_running();
    case "startFailed": return m.schedule_reason_start_failed();
    case "clockChange": return m.schedule_reason_clock_change();
    default: return m.schedule_result_none();
  }
}

/** Колонка «Останній результат» — рендериться з пари status + reason (§5.2). */
export function lastResultText(r: ScheduleResult | null): string {
  if (!r) return m.schedule_result_none();
  switch (r.status) {
    case "completed":
      return m.schedule_result_completed({ minutes: String(r.recordedMinutes) });
    case "startedLate":
      return m.schedule_result_started_late({ minutes: String(r.recordedMinutes) });
    case "missed":
      return m.schedule_result_missed({ reason: missedReasonText(r.reason) });
    case "stoppedByUser":
      switch (r.reason) {
        case "profileSwitch": return m.schedule_result_stopped_profile_switch();
        case "appClosing": return m.schedule_result_stopped_app_closing();
        case "scheduleEdited": return m.schedule_result_stopped_edited();
        default: return m.schedule_result_stopped_manual();
      }
    case "skippedAlreadyRecording":
      return m.schedule_result_skipped();
  }
}

export function stateText(enabled: boolean): string {
  return enabled ? m.schedule_state_enabled() : m.schedule_state_disabled();
}

/** Текст confirm переключення профілю (§3.5): однина/перелік. */
export function activeScheduledMessage(active: ActiveScheduled[]): string {
  const end = (a: ActiveScheduled) => a.windowEnd.slice(11, 16); // "YYYY-MM-DDTHH:MM" → "HH:MM"
  if (active.length === 1) {
    return m.profile_switch_scheduled_one({ name: active[0].name, end: end(active[0]) });
  }
  const list = active
    .map((a) => m.profile_switch_scheduled_item({ name: a.name, end: end(a) }))
    .join(", ");
  return m.profile_switch_scheduled_many({ list });
}
```

Тип `ActiveScheduled` з'явиться у `src/lib/tauri.ts` у Task 4 — щоб Task 2 компілювався самостійно, додати його в `tauri.ts` уже зараз (це чистий тип, без команди):

```ts
// --- Scheduler (Phase 3D, Фаза 3) ---

/** Активний плановий запис (для confirm-діалогів §3.5). */
export interface ActiveScheduled {
  recordingId: string;
  name: string;
  streamId: string;
  /** Локальний кінець вікна "YYYY-MM-DDTHH:MM". */
  windowEnd: string;
}
```

- [ ] **Step 4: Тести зелені**

Run: `pnpm test src/lib/scheduleFormat.test.ts`
Expected: PASS (усі describe-блоки).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/scheduleFormat.ts src/lib/scheduleFormat.test.ts src/lib/tauri.ts
git commit -m "feat(scheduler): pure formatting helpers for schedule UI"
```

---

### Task 3: store `src/stores/schedule.ts` + рефетч у `useProfileSync`

**Files:**
- Create: `src/stores/schedule.ts`
- Test: `src/stores/schedule.test.ts`
- Modify: `src/hooks/useProfileSync.ts`

- [ ] **Step 1: Написати failing-тести** — `src/stores/schedule.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as tauri from "../lib/tauri";
import { $schedules, $schedulesLoading, $schedulesError, loadSchedules } from "./schedule";
import type { ScheduleDto } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({ getSchedules: vi.fn(async () => []) }));

const dto = (id: string): ScheduleDto => ({
  id, streamId: "st1", name: id, type: "recurring", days: [0], date: null,
  time: "20:00", durationMinutes: 60, enabled: true,
  createdAt: "2026-06-12T10:00:00+03:00", lastResult: null, nextRun: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  $schedules.set([]);
  $schedulesError.set(null);
  $schedulesLoading.set(false);
});

describe("loadSchedules", () => {
  it("кладе список у $schedules", async () => {
    vi.mocked(tauri.getSchedules).mockResolvedValueOnce([dto("a"), dto("b")]);
    await loadSchedules();
    expect($schedules.get().map((s) => s.id)).toEqual(["a", "b"]);
    expect($schedulesLoading.get()).toBe(false);
  });

  it("помилка → $schedulesError, список не чіпається", async () => {
    $schedules.set([dto("old")]);
    vi.mocked(tauri.getSchedules).mockRejectedValueOnce(new Error("boom"));
    await loadSchedules();
    expect($schedulesError.get()).toContain("boom");
    expect($schedules.get().map((s) => s.id)).toEqual(["old"]);
  });

  it("loading вмикається лише коли store порожній (рефетч не демонтує список)", async () => {
    $schedules.set([dto("a")]);
    let seenLoading = false;
    const unsub = $schedulesLoading.listen((v) => { if (v) seenLoading = true; });
    vi.mocked(tauri.getSchedules).mockResolvedValueOnce([dto("a")]);
    await loadSchedules();
    unsub();
    expect(seenLoading).toBe(false);
  });

  it("пізніша відповідь не перетирається ранішою (guard послідовності)", async () => {
    let resolveFirst!: (v: ScheduleDto[]) => void;
    vi.mocked(tauri.getSchedules)
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce([dto("new")]);
    const first = loadSchedules();
    const second = loadSchedules();
    await second;
    resolveFirst([dto("stale")]);
    await first;
    expect($schedules.get().map((s) => s.id)).toEqual(["new"]);
  });
});
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `pnpm test src/stores/schedule.test.ts`
Expected: FAIL — `Cannot find module './schedule'`.

- [ ] **Step 3: Реалізувати `src/stores/schedule.ts`**

```ts
import { atom } from "nanostores";
import * as tauri from "../lib/tauri";
import type { ScheduleDto } from "../lib/tauri";

/** Розклади активного профілю (ScheduleDto = ScheduledRecording + nextRun). */
export const $schedules = atom<ScheduleDto[]>([]);
export const $schedulesLoading = atom(false);
export const $schedulesError = atom<string | null>(null);

let loadSeq = 0;

/**
 * Рефетч списку (відкриття панелі, події scheduled-*, CRUD).
 * loading вмикається лише для першого завантаження (store порожній):
 * рефетч по події не повинен демонтувати CompositeList — це втрата фокуса
 * посеред навігації. Конкурентні виклики впорядковує loadSeq.
 */
export async function loadSchedules(): Promise<void> {
  const seq = ++loadSeq;
  if ($schedules.get().length === 0) $schedulesLoading.set(true);
  try {
    const list = await tauri.getSchedules();
    if (seq !== loadSeq) return;
    $schedules.set(list);
    $schedulesError.set(null);
  } catch (e) {
    if (seq !== loadSeq) return;
    $schedulesError.set(String(e));
  } finally {
    if (seq === loadSeq) $schedulesLoading.set(false);
  }
}
```

- [ ] **Step 4: Тести зелені**

Run: `pnpm test src/stores/schedule.test.ts`
Expected: PASS.

- [ ] **Step 5: Рефетч на переключення профілю** — у `src/hooks/useProfileSync.ts` додати імпорт і виклик поруч із `loadSongs()`:

```ts
import { loadSchedules } from "../stores/schedule";
```

```ts
        // Songs — re-fetch for new profile's outputDir
        if (!cancelled) loadSongs();

        // Schedules — розклади нового активного профілю (Phase 3D)
        if (!cancelled) loadSchedules();
```

- [ ] **Step 6: Повні тести + commit**

Run: `pnpm test`
Expected: PASS (регресій немає).

```powershell
git add src/stores/schedule.ts src/stores/schedule.test.ts src/hooks/useProfileSync.ts
git commit -m "feat(scheduler): schedules nanostore with sequence-guarded refetch"
```

---

### Task 4: Rust `get_active_scheduled` + типи payload-ів у TS

Спека §3.5: confirm переключення профілю потребує назв і часу кінця активних планових записів. Команда аддитивна → вноситься в §4 спеки тут же.

**Files:**
- Modify: `src-tauri/src/scheduler/core.rs` (після `owned_sessions`, ~рядок 156)
- Modify: `src-tauri/src/commands/schedule_commands.rs`
- Modify: `src-tauri/src/lib.rs` (~рядок 215, після `toggle_schedule`)
- Modify: `src/lib/tauri.ts`
- Modify: `docs/superpowers/specs/2026-06-12-scheduler-design.md` (§4)

- [ ] **Step 1: Failing-тест core** — у `mod tests` файлу `core.rs` (використати наявні тест-хелпери цього модуля для створення core; якщо хелпера старту немає — конструювати через `confirm_start`):

```rust
    #[test]
    fn active_overview_returns_confirmed_starts() {
        let mut core = SchedulerCore::default();
        let key: OccKey = ("sch1".into(), "2026-06-12T20:00".into());
        let end = Utc::now() + Duration::hours(2);
        core.confirm_start(key.clone(), "st1".into(), 7, end, false, Utc::now());
        let overview = core.active_overview();
        assert_eq!(overview.len(), 1);
        assert_eq!(overview[0].key, key);
        assert_eq!(overview[0].stream_id, "st1");
        assert_eq!(overview[0].window_end_utc, end);
    }
```

- [ ] **Step 2: Тест падає**

Run: `cargo test --manifest-path src-tauri/Cargo.toml scheduler::core::tests::active_overview`
Expected: помилка компіляції — `active_overview` не існує.

- [ ] **Step 3: Реалізувати accessor у `core.rs`** (під `owned_sessions`):

```rust
    /// Знімок активних входжень для UI (confirm-діалоги §3.5).
    pub fn active_overview(&self) -> Vec<ActiveOccurrence> {
        self.active.clone()
    }
```

- [ ] **Step 4: Failing-тест команди** — у `mod tests` файлу `schedule_commands.rs`:

```rust
    #[test]
    fn active_scheduled_impl_maps_names_and_local_end() {
        use crate::scheduler::core::ActiveOccurrence;
        let mut p = profile_with_stream();
        let added = add_schedule_impl(&mut p, valid_input()).unwrap();
        let end_utc = chrono::Utc::now() + chrono::Duration::hours(2);
        let occ = ActiveOccurrence {
            key: (added.id.clone(), "2026-06-12T20:00".into()),
            stream_id: "st1".into(),
            session_id: 1,
            window_end_utc: end_utc,
            started_late: false,
            started_at_utc: chrono::Utc::now(),
        };
        let dtos = active_scheduled_impl(&[occ], &p.scheduled_recordings);
        assert_eq!(dtos.len(), 1);
        assert_eq!(dtos[0].recording_id, added.id);
        assert_eq!(dtos[0].name, "Evening Jazz");
        assert_eq!(dtos[0].stream_id, "st1");
        // Формат §4: локальний "YYYY-MM-DDTHH:MM"
        assert!(
            NaiveDateTime::parse_from_str(&dtos[0].window_end, "%Y-%m-%dT%H:%M").is_ok(),
            "got: {}", dtos[0].window_end
        );
    }

    #[test]
    fn active_scheduled_dto_serializes_camel_case() {
        let dto = ActiveScheduledDto {
            recording_id: "r".into(), name: "N".into(),
            stream_id: "s".into(), window_end: "2026-06-12T22:05".into(),
        };
        let json = serde_json::to_string(&dto).unwrap();
        assert!(json.contains("\"recordingId\""), "got: {json}");
        assert!(json.contains("\"windowEnd\""), "got: {json}");
    }
```

- [ ] **Step 5: Тести падають**

Run: `cargo test --manifest-path src-tauri/Cargo.toml schedule_commands`
Expected: помилка компіляції — `active_scheduled_impl`, `ActiveScheduledDto` не існують.

- [ ] **Step 6: Реалізувати в `schedule_commands.rs`** (після `ScheduledRecordingInput`):

```rust
/// Активний плановий запис — дані для confirm-діалогів §3.5.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveScheduledDto {
    pub recording_id: String,
    pub name: String,
    pub stream_id: String,
    /// Локальний кінець вікна "YYYY-MM-DDTHH:MM" — frontend форматує «до HH:MM».
    pub window_end: String,
}

fn active_scheduled_impl(
    active: &[crate::scheduler::core::ActiveOccurrence],
    schedules: &[ScheduledRecording],
) -> Vec<ActiveScheduledDto> {
    active
        .iter()
        .map(|occ| ActiveScheduledDto {
            recording_id: occ.key.0.clone(),
            name: schedules
                .iter()
                .find(|s| s.id == occ.key.0)
                .map(|s| s.name.clone())
                .unwrap_or_default(),
            stream_id: occ.stream_id.clone(),
            window_end: occ
                .window_end_utc
                .with_timezone(&chrono::Local)
                .format("%Y-%m-%dT%H:%M")
                .to_string(),
        })
        .collect()
}
```

І команду (після `toggle_schedule`):

```rust
#[tauri::command]
pub async fn get_active_scheduled(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ActiveScheduledDto>, String> {
    let schedules = state.active_profile.read().await.scheduled_recordings.clone();
    let active = state.scheduler.core.lock().await.active_overview();
    Ok(active_scheduled_impl(&active, &schedules))
}
```

У `src-tauri/src/lib.rs` додати в `generate_handler!` після `commands::schedule_commands::toggle_schedule,`:

```rust
            commands::schedule_commands::get_active_scheduled,
```

- [ ] **Step 7: Rust-тести зелені**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (усі).

- [ ] **Step 8: TS-обгортка і типи payload-ів** — у `src/lib/tauri.ts`. До секції команд `// --- Scheduler (Phase 3D) ---` (після `toggleSchedule`):

```ts
/** Активні планові записи — для confirm-діалогів (§3.5). */
export async function getActiveScheduled(): Promise<ActiveScheduled[]> {
  return invoke("get_active_scheduled");
}
```

До секції типів (після `ScheduledRecordingInput`) — типи payload-ів подій `scheduled-*` (формат — data-models.md §5):

```ts
/** Спільні поля payload-ів scheduled-* (§4). */
export interface ScheduledEventPayload {
  recordingId: string;
  streamId: string;
  name: string;
}

export interface ScheduledCompletedPayload extends ScheduledEventPayload {
  status: "completed" | "startedLate" | "stoppedByUser";
  recordedMinutes: number;
}

export interface ScheduledMissedPayload extends ScheduledEventPayload {
  reason: ScheduleResultReason | null;
}
```

- [ ] **Step 9: Оновити спеку §4** — у таблицю IPC `docs/superpowers/specs/2026-06-12-scheduler-design.md` додати рядок після `toggle_schedule`:

```markdown
| `get_active_scheduled` | `() → Vec<ActiveScheduledDto>` — активні планові записи (`recordingId`, `name`, `streamId`, `windowEnd` — локальний `"YYYY-MM-DDTHH:MM"`); дані для confirm-діалогів §3.5 (додано у Фазі 3) |
```

- [ ] **Step 10: Gates + commit**

Run: `pnpm test` і `pnpm vite:build`
Expected: PASS.

```powershell
git add src-tauri/src/scheduler/core.rs src-tauri/src/commands/schedule_commands.rs src-tauri/src/lib.rs src/lib/tauri.ts docs/superpowers/specs/2026-06-12-scheduler-design.md
git commit -m "feat(scheduler): get_active_scheduled IPC for confirm dialogs"
```

---

### Task 5: Quit-confirm зі списком планових записів

Спека §3.5: «Закриття додатка під час планового запису → той самий confirm». MessageBox уже існує (`tray/notify.rs`); розширюємо тіло (рішення 2).

**Files:**
- Modify: `src-tauri/src/tray/notify.rs`

- [ ] **Step 1: Failing-тести** — у `mod tests` файлу `notify.rs`:

```rust
    #[test]
    fn quit_confirm_body_without_scheduled() {
        assert_eq!(
            quit_confirm_body(2, &[]),
            "Активних записів: 2.\nВийти з програми і зупинити їх?"
        );
    }

    #[test]
    fn quit_confirm_body_with_one_scheduled() {
        let lines = vec![("Evening Jazz".to_string(), "22:05".to_string())];
        assert_eq!(
            quit_confirm_body(1, &lines),
            "Активних записів: 1.\nТриває плановий запис «Evening Jazz» до 22:05.\nВийти з програми і зупинити їх?"
        );
    }

    #[test]
    fn quit_confirm_body_with_many_scheduled() {
        let lines = vec![
            ("A".to_string(), "22:05".to_string()),
            ("B".to_string(), "23:10".to_string()),
        ];
        assert_eq!(
            quit_confirm_body(3, &lines),
            "Активних записів: 3.\nТривають планові записи: «A» до 22:05, «B» до 23:10.\nВийти з програми і зупинити їх?"
        );
    }
```

- [ ] **Step 2: Тести падають**

Run: `cargo test --manifest-path src-tauri/Cargo.toml tray::notify`
Expected: помилка компіляції — `quit_confirm_body` не існує.

- [ ] **Step 3: Реалізувати.** У `notify.rs`:

```rust
/// (назва розкладу, локальний кінець вікна "HH:MM") активного планового запису.
type ScheduledLine = (String, String);

/// Тіло quit-confirm. Планові записи перелічуються окремим рядком (§3.5):
/// користувач має знати, що зупиняє не просто запис, а запланований.
fn quit_confirm_body(active_count: usize, scheduled: &[ScheduledLine]) -> String {
    let mut body = format!("Активних записів: {active_count}.");
    if !scheduled.is_empty() {
        let list = scheduled
            .iter()
            .map(|(name, end)| format!("«{name}» до {end}"))
            .collect::<Vec<_>>()
            .join(", ");
        if scheduled.len() == 1 {
            body.push_str(&format!("\nТриває плановий запис {list}."));
        } else {
            body.push_str(&format!("\nТривають планові записи: {list}."));
        }
    }
    body.push_str("\nВийти з програми і зупинити їх?");
    body
}
```

Змінити `show_quit_confirm`, щоб приймав готове тіло:

```rust
/// Show a native Yes/No MessageBox asking whether to quit the app while
/// recordings are active. Returns true if the user confirmed (clicked Yes).
///
/// Uses `MB_DEFBUTTON2` so "No" is the default — pressing Enter dismisses safely.
pub fn show_quit_confirm(body: &str) -> bool {
    let title = HSTRING::from("Tapir — підтвердження");
    let body = HSTRING::from(body);
    let result = unsafe {
        MessageBoxW(
            None,
            &body,
            &title,
            MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2 | MB_SETFOREGROUND,
        )
    };
    result == IDYES
}
```

І зібрати дані в `confirm_quit_if_recording` (замінити тіло після підрахунку `active`):

```rust
    if active == 0 { return true; }

    // §3.5: активні планові записи — назва + локальний кінець вікна.
    let scheduled: Vec<ScheduledLine> = {
        let schedules = state.active_profile.read().await.scheduled_recordings.clone();
        let overview = state.scheduler.core.lock().await.active_overview();
        overview
            .iter()
            .map(|occ| {
                (
                    schedules
                        .iter()
                        .find(|s| s.id == occ.key.0)
                        .map(|s| s.name.clone())
                        .unwrap_or_default(),
                    occ.window_end_utc
                        .with_timezone(&chrono::Local)
                        .format("%H:%M")
                        .to_string(),
                )
            })
            .collect()
    };
    let body = quit_confirm_body(active, &scheduled);

    // MessageBoxW blocks; run on a blocking thread so we don't stall the
    // tokio worker (or the UI thread, if called via block_on).
    tokio::task::spawn_blocking(move || show_quit_confirm(&body))
        .await
        .unwrap_or(false)
```

- [ ] **Step 4: Тести зелені**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/tray/notify.rs
git commit -m "feat(scheduler): list active scheduled recordings in quit confirm"
```

---

### Task 6: Balloon tips для подій `scheduled-*`

Спека §5.5: «Balloon tip з трею (механізм Фази 3A) дублює ті самі події». Гейт `showTrayNotifications`, без тротлінгу; `StoppedByUser` не дублюється (рішення 3).

**Files:**
- Modify: `src-tauri/src/tray/notify.rs`
- Modify: `src-tauri/src/scheduler/timer.rs`

- [ ] **Step 1: Failing-тести тіл** — у `mod tests` файлу `notify.rs`:

```rust
    #[test]
    fn scheduled_bodies_match_live_region_texts() {
        use crate::profile::ScheduleResultReason;
        assert_eq!(scheduled_started_body("X"), "Плановий запис «X» розпочато");
        assert_eq!(
            scheduled_completed_body("X", 119),
            "Плановий запис «X» завершено, записано 119 хв"
        );
        assert_eq!(
            scheduled_missed_body("X", Some(&ScheduleResultReason::AppNotRunning)),
            "Плановий запис «X» пропущено: Tapir не працював"
        );
        assert_eq!(
            scheduled_missed_body("X", Some(&ScheduleResultReason::StartFailed)),
            "Плановий запис «X» пропущено: не вдалося стартувати запис"
        );
        assert_eq!(
            scheduled_missed_body("X", Some(&ScheduleResultReason::ClockChange)),
            "Плановий запис «X» пропущено: переведення годинника"
        );
        assert_eq!(scheduled_missed_body("X", None), "Плановий запис «X» пропущено: —");
        assert_eq!(
            scheduled_skipped_body("X"),
            "Плановий запис «X» не стартував: потік уже записується"
        );
    }
```

- [ ] **Step 2: Тести падають**

Run: `cargo test --manifest-path src-tauri/Cargo.toml tray::notify`
Expected: помилка компіляції.

- [ ] **Step 3: Реалізувати в `notify.rs`:**

```rust
use crate::profile::ScheduleResultReason;
```

```rust
// --- Balloon-дублікати подій scheduled-* (Phase 3D §5.5) ---
// Тексти дзеркалять live region (uk-only — native surface, як решта рядків
// цього модуля). StoppedByUser не дублюється: ручну зупинку вже озвучує
// існуючий recording-флоу.

pub fn scheduled_started_body(name: &str) -> String {
    format!("Плановий запис «{name}» розпочато")
}

pub fn scheduled_completed_body(name: &str, minutes: u32) -> String {
    format!("Плановий запис «{name}» завершено, записано {minutes} хв")
}

fn missed_reason_uk(reason: Option<&ScheduleResultReason>) -> &'static str {
    match reason {
        Some(ScheduleResultReason::AppNotRunning) => "Tapir не працював",
        Some(ScheduleResultReason::StartFailed) => "не вдалося стартувати запис",
        Some(ScheduleResultReason::ClockChange) => "переведення годинника",
        _ => "—",
    }
}

pub fn scheduled_missed_body(name: &str, reason: Option<&ScheduleResultReason>) -> String {
    format!("Плановий запис «{name}» пропущено: {}", missed_reason_uk(reason))
}

pub fn scheduled_skipped_body(name: &str) -> String {
    format!("Плановий запис «{name}» не стартував: потік уже записується")
}

/// Fire-and-forget balloon для подій планувальника. Гейт showTrayNotifications
/// («механізм Фази 3A», §5.5); без тротлінгу — події рідкісні.
pub fn notify_scheduled(app: &tauri::AppHandle, body: String) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = tauri::Manager::state::<crate::app_state::AppState>(&app);
        if !state.settings.read().await.show_tray_notifications { return; }
        log::info!("notify_scheduled: {body:?}");
        if let Err(e) = app.notification().builder().title("Tapir").body(&body).show() {
            log::warn!("notify_scheduled: failed to show toast: {e}");
        }
    });
}
```

- [ ] **Step 4: Тести зелені**

Run: `cargo test --manifest-path src-tauri/Cargo.toml tray::notify`
Expected: PASS.

- [ ] **Step 5: Виклики в `timer.rs`.** У гілці успішного старту (`run_tick`, після `app.emit("scheduled-started", …)`, де вже обчислено `name`):

```rust
                        crate::tray::notify::notify_scheduled(
                            app,
                            crate::tray::notify::scheduled_started_body(&name),
                        );
```

У `emit_result` — balloon лише там, де є announce: розбити наявну гілку `Completed | StartedLate | StoppedByUser` на дві з однаковим `app.emit("scheduled-completed", …)`:

```rust
        ScheduleResultStatus::Completed | ScheduleResultStatus::StartedLate => {
            app.emit("scheduled-completed", ScheduledCompletedPayload {
                recording_id: f.schedule_id.clone(),
                stream_id: f.stream_id.clone(),
                name: f.schedule_name.clone(),
                status: f.result.status.clone(),
                recorded_minutes: f.result.recorded_minutes,
            }).ok();
            crate::tray::notify::notify_scheduled(
                app,
                crate::tray::notify::scheduled_completed_body(
                    &f.schedule_name,
                    f.result.recorded_minutes,
                ),
            );
        }
        ScheduleResultStatus::StoppedByUser => {
            // §4: подія потрібна для оновлення панелі; без balloon і announce —
            // ручну зупинку вже озвучує recording-флоу.
            app.emit("scheduled-completed", ScheduledCompletedPayload {
                recording_id: f.schedule_id.clone(),
                stream_id: f.stream_id.clone(),
                name: f.schedule_name.clone(),
                status: f.result.status.clone(),
                recorded_minutes: f.result.recorded_minutes,
            }).ok();
        }
```

У гілці `Missed` після emit:

```rust
            crate::tray::notify::notify_scheduled(
                app,
                crate::tray::notify::scheduled_missed_body(
                    &f.schedule_name,
                    f.result.reason.as_ref(),
                ),
            );
```

У гілці `SkippedAlreadyRecording` після emit:

```rust
            crate::tray::notify::notify_scheduled(
                app,
                crate::tray::notify::scheduled_skipped_body(&f.schedule_name),
            );
```

- [ ] **Step 6: Gates + commit**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

```powershell
git add src-tauri/src/tray/notify.rs src-tauri/src/scheduler/timer.rs
git commit -m "feat(scheduler): tray balloon duplicates for scheduled-* events"
```

---

### Task 7: Хук `useScheduleEvents` + монтування в App

Live region — assertive, працює завжди (не лише на відкритій панелі), оновлює store без рефетч-залежності від панелі. Спека §4/§5.5.

**Files:**
- Create: `src/hooks/useScheduleEvents.ts`
- Test: `src/hooks/useScheduleEvents.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Failing-тести** — `src/hooks/useScheduleEvents.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { $announcer } from "../stores/announcer";
import * as tauri from "../lib/tauri";

type Handler = (e: { payload: unknown }) => void;
const handlers = new Map<string, Handler>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: Handler) => {
    handlers.set(event, cb);
    return () => handlers.delete(event);
  }),
}));

vi.mock("../lib/tauri", () => ({ getSchedules: vi.fn(async () => []) }));

vi.mock("../i18n/paraglide/messages", () => ({
  scheduled_announce_started: ({ name }: { name: string }) => `started ${name}`,
  scheduled_announce_completed: ({ name, minutes }: { name: string; minutes: string }) =>
    `completed ${name} ${minutes}`,
  scheduled_announce_missed: ({ name, reason }: { name: string; reason: string }) =>
    `missed ${name}: ${reason}`,
  scheduled_announce_skipped: ({ name }: { name: string }) => `skipped ${name}`,
  schedule_reason_app_not_running: () => "Tapir не працював",
  schedule_reason_start_failed: () => "не вдалося стартувати запис",
  schedule_reason_clock_change: () => "переведення годинника",
  schedule_result_none: () => "—",
}));

import { useScheduleEvents } from "./useScheduleEvents";

function Host() {
  useScheduleEvents();
  return null;
}

const base = { recordingId: "r1", streamId: "st1", name: "Jazz" };

async function fire(event: string, payload: unknown) {
  handlers.get(event)!({ payload });
  // дочекатися мікротасок refetch
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  $announcer.set(null);
});

describe("useScheduleEvents", () => {
  it("started → assertive announce + refetch", async () => {
    render(<Host />);
    await vi.waitFor(() => expect(handlers.has("scheduled-started")).toBe(true));
    await fire("scheduled-started", base);
    expect($announcer.get()).toEqual({ message: "started Jazz", priority: "assertive" });
    expect(tauri.getSchedules).toHaveBeenCalled();
  });

  it("completed → announce із хвилинами", async () => {
    render(<Host />);
    await vi.waitFor(() => expect(handlers.has("scheduled-completed")).toBe(true));
    await fire("scheduled-completed", { ...base, status: "startedLate", recordedMinutes: 80 });
    expect($announcer.get()).toEqual({ message: "completed Jazz 80", priority: "assertive" });
  });

  it("completed зі статусом stoppedByUser → store оновлюється, announce НЕМає (§4)", async () => {
    render(<Host />);
    await vi.waitFor(() => expect(handlers.has("scheduled-completed")).toBe(true));
    await fire("scheduled-completed", { ...base, status: "stoppedByUser", recordedMinutes: 15 });
    expect($announcer.get()).toBeNull();
    expect(tauri.getSchedules).toHaveBeenCalled();
  });

  it("missed → announce з локалізованою причиною", async () => {
    render(<Host />);
    await vi.waitFor(() => expect(handlers.has("scheduled-missed")).toBe(true));
    await fire("scheduled-missed", { ...base, reason: "appNotRunning" });
    expect($announcer.get()).toEqual({
      message: "missed Jazz: Tapir не працював",
      priority: "assertive",
    });
  });

  it("skipped → announce", async () => {
    render(<Host />);
    await vi.waitFor(() => expect(handlers.has("scheduled-skipped")).toBe(true));
    await fire("scheduled-skipped", base);
    expect($announcer.get()).toEqual({ message: "skipped Jazz", priority: "assertive" });
  });
});
```

- [ ] **Step 2: Тести падають**

Run: `pnpm test src/hooks/useScheduleEvents.test.tsx`
Expected: FAIL — `Cannot find module './useScheduleEvents'`.

- [ ] **Step 3: Реалізувати `src/hooks/useScheduleEvents.ts`**

```ts
import { useCallback } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { useAnnounce } from "./useAnnounce";
import { loadSchedules } from "../stores/schedule";
import { missedReasonText } from "../lib/scheduleFormat";
import type {
  ScheduledCompletedPayload, ScheduledEventPayload, ScheduledMissedPayload,
} from "../lib/tauri";
import * as m from "../i18n/paraglide/messages";

/**
 * Глобальна підписка на події планувальника (§4, §5.5): кожна подія оновлює
 * store (panel рендерить свіжі lastResult/enabled/nextRun без власного рефетчу)
 * і озвучується assertive live region — і коли відкрито діалог
 * (data-live-announcer, див. LiveAnnouncer). StoppedByUser не озвучується:
 * ручну зупинку вже озвучує існуючий recording-флоу.
 */
export function useScheduleEvents(): void {
  const announce = useAnnounce();

  useTauriEvent<ScheduledEventPayload>("scheduled-started", useCallback((p) => {
    void loadSchedules();
    announce(m.scheduled_announce_started({ name: p.name }), "assertive");
  }, [announce]));

  useTauriEvent<ScheduledCompletedPayload>("scheduled-completed", useCallback((p) => {
    void loadSchedules();
    if (p.status !== "stoppedByUser") {
      announce(
        m.scheduled_announce_completed({ name: p.name, minutes: String(p.recordedMinutes) }),
        "assertive",
      );
    }
  }, [announce]));

  useTauriEvent<ScheduledMissedPayload>("scheduled-missed", useCallback((p) => {
    void loadSchedules();
    announce(
      m.scheduled_announce_missed({ name: p.name, reason: missedReasonText(p.reason) }),
      "assertive",
    );
  }, [announce]));

  useTauriEvent<ScheduledEventPayload>("scheduled-skipped", useCallback((p) => {
    void loadSchedules();
    announce(m.scheduled_announce_skipped({ name: p.name }), "assertive");
  }, [announce]));
}
```

- [ ] **Step 4: Тести зелені**

Run: `pnpm test src/hooks/useScheduleEvents.test.tsx`
Expected: PASS.

- [ ] **Step 5: Змонтувати в `App.tsx`** — імпорт і виклик в `AppContent` поруч з `useDiskSpacePolling()`:

```ts
import { useScheduleEvents } from "./hooks/useScheduleEvents";
```

```ts
  useDiskSpacePolling();
  useProfileSync();
  useScheduleEvents();
```

- [ ] **Step 6: Повні тести + commit**

Run: `pnpm test`
Expected: PASS.

```powershell
git add src/hooks/useScheduleEvents.ts src/hooks/useScheduleEvents.test.tsx src/App.tsx
git commit -m "feat(scheduler): global scheduled-* event hook with live-region announcements"
```

---

### Task 8: `SegmentKind` + ScheduleContextMenu + ScheduleItem

**Files:**
- Modify: `src/hooks/useCompositeList.ts` (union `SegmentKind`, ~рядок 30)
- Create: `src/components/schedule/ScheduleContextMenu.tsx`
- Create: `src/components/schedule/ScheduleItem.tsx`

Інтерактивні перевірки рядка покриває SchedulePanel.test (Task 11) — там рядок рендериться в реальному CompositeList. Тут TDD-петля коротка: компіляція + повні тести.

- [ ] **Step 1: Додати segment kind.** У `useCompositeList.ts` в union `SegmentKind` після `| 'action-export'`:

```ts
  // Schedule rows
  | 'action-toggle';
```

- [ ] **Step 2: Створити `src/components/schedule/ScheduleContextMenu.tsx`** (патерн SongContextMenu):

```tsx
import { Button, Menu, MenuItem, MenuTrigger, Popover, Separator } from "react-aria-components";
import type { Key } from "react";
import type { ScheduleDto } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

export type ScheduleAction = "edit" | "toggle" | "delete";

interface Props {
  schedule: ScheduleDto;
  /** True when the menu trigger is the active 'action-menu' focus stop. */
  menuFocused: boolean;
  onAction: (action: ScheduleAction) => void;
}

const ITEM_CLS =
  "cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]";

export function ScheduleContextMenu({ schedule, menuFocused, onAction }: Props) {
  return (
    <MenuTrigger>
      <Button
        excludeFromTabOrder={!menuFocused}
        data-item-id={schedule.id}
        data-segment="action-menu"
        data-context-menu-trigger
        aria-label={m.schedule_action_menu()}
        className="inline-flex shrink-0 items-center justify-center rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText] forced-colors:focus-visible:outline-[Highlight]"
      >
        ⋯
      </Button>
      <Popover>
        <Menu
          aria-label={m.schedule_context_menu()}
          onAction={(key: Key) => onAction(key as ScheduleAction)}
          className="min-w-48 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl outline-none forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]"
        >
          <MenuItem id="edit" className={ITEM_CLS}>{m.schedule_action_edit()}</MenuItem>
          <MenuItem id="toggle" className={ITEM_CLS}>
            {schedule.enabled ? m.schedule_action_disable() : m.schedule_action_enable()}
          </MenuItem>
          <Separator className="my-1 border-t border-slate-700" />
          <MenuItem id="delete" className={`${ITEM_CLS} text-red-400`}>
            {m.schedule_action_delete()}
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
```

- [ ] **Step 3: Створити `src/components/schedule/ScheduleItem.tsx`** (патерн SongItem — два рядки, повний summary-label):

```tsx
import { Calendar, CalendarOff } from "lucide-react";
import type { ScheduleDto } from "../../lib/tauri";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { CompositeRow, CompositeSegment, CompositeAction } from "../common/composite-list";
import { ScheduleContextMenu, type ScheduleAction } from "./ScheduleContextMenu";
import {
  formatNextRun, formatWhen, lastResultText, stateText,
} from "../../lib/scheduleFormat";
import * as m from "../../i18n/paraglide/messages";

/** Стопи Left/Right після summary — однакові для всіх рядків. */
export function getScheduleSegments(): Exclude<SegmentKind, "summary">[] {
  return ["track", "tech", "action-toggle", "action-menu"];
}

interface Props {
  schedule: ScheduleDto;
  /** Назва потоку активного профілю; «потік видалено» для осиротілих. */
  streamName: string;
  isActiveRow: boolean;
  isFocused: (segment: "summary" | SegmentKind) => boolean;
  onToggle: () => void;
  onAction: (action: ScheduleAction) => void;
}

export function ScheduleItem({
  schedule, streamName, isActiveRow, isFocused, onToggle, onAction,
}: Props) {
  const when = formatWhen(schedule);
  const next = formatNextRun(schedule.nextRun);
  const result = lastResultText(schedule.lastResult);
  const state = stateText(schedule.enabled);

  // Усі «колонки» §5.2 в одному a11y-імені рядка — NVDA читає один чистий label.
  const summaryLabel = m.schedule_row_summary({
    name: schedule.name, state, stream: streamName, when, next, result,
  });

  // role="group" озвучує лише aria-label — без нього drill-down на рядок 2 німий.
  const techLabel = [
    streamName, when, m.schedule_next_run_label({ when: next }), result,
  ].join(", ");

  return (
    <CompositeRow
      itemId={schedule.id}
      isFocused={isFocused}
      isActiveRow={isActiveRow}
      label={summaryLabel}
      roleDescription={m.item_role_schedule()}
      className="border-b border-slate-800 px-3 py-2"
      activeClassName="bg-slate-800/40"
    >
      {/* Рядок 1: іконка стану + назва, кнопки праворуч. */}
      <div className="flex items-center gap-2">
        <CompositeSegment
          itemId={schedule.id}
          segment="track"
          isFocused={isFocused}
          label={schedule.name}
          className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-100"
        >
          {schedule.enabled ? (
            <Calendar size={14} aria-hidden className="flex-none text-slate-500" />
          ) : (
            <CalendarOff size={14} aria-hidden className="flex-none text-slate-600" />
          )}
          <span className={schedule.enabled ? "truncate" : "truncate text-slate-500"}>
            {schedule.name}
          </span>
        </CompositeSegment>

        <div className="ml-auto flex flex-none gap-1">
          <CompositeAction
            itemId={schedule.id}
            segment="action-toggle"
            isFocused={isFocused}
            onClick={onToggle}
            label={state}
            ariaPressed={schedule.enabled}
            className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 forced-colors:text-[ButtonText]"
          >
            {state}
          </CompositeAction>

          <ScheduleContextMenu
            schedule={schedule}
            menuFocused={isFocused("action-menu")}
            onAction={onAction}
          />
        </div>
      </div>

      {/* Рядок 2: потік · коли · наступний запуск · останній результат. */}
      <CompositeSegment
        itemId={schedule.id}
        segment="tech"
        isFocused={isFocused}
        label={techLabel}
        className="mt-1 flex items-center gap-1 text-xs text-slate-400"
      >
        <span className="min-w-0 flex-1 truncate">
          {streamName} · {when}
        </span>
        <span className="flex-none whitespace-nowrap">
          {" · "}{next}{" · "}{result}
        </span>
      </CompositeSegment>
    </CompositeRow>
  );
}
```

- [ ] **Step 4: Перевірити компіляцію і регресії**

Run: `pnpm test` та `pnpm vite:build`
Expected: PASS (нові файли ще не використовуються — лише компілюються).

- [ ] **Step 5: Commit**

```powershell
git add src/hooks/useCompositeList.ts src/components/schedule/ScheduleContextMenu.tsx src/components/schedule/ScheduleItem.tsx
git commit -m "feat(scheduler): schedule row with toggle stop and context menu"
```

---

### Task 9: ScheduleTable

**Files:**
- Create: `src/components/schedule/ScheduleTable.tsx`

Інтеракції покриває SchedulePanel.test (Task 11).

- [ ] **Step 1: Створити `src/components/schedule/ScheduleTable.tsx`:**

```tsx
import { forwardRef, useMemo } from "react";
import { useStore } from "@nanostores/react";
import { $schedules } from "../../stores/schedule";
import { $streams } from "../../stores/streams";
import { CompositeList } from "../common/composite-list";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { ScheduleItem, getScheduleSegments } from "./ScheduleItem";
import type { ScheduleAction } from "./ScheduleContextMenu";
import * as m from "../../i18n/paraglide/messages";

export interface ScheduleTableHandle extends ZoneEntry {
  /** Сфокусувати рядок розкладу (після add/edit). */
  focusSchedule: (id: string) => void;
}

interface Props {
  exitZone: (forward: boolean) => void;
  onEmpty: () => void;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export const ScheduleTable = forwardRef<ScheduleTableHandle, Props>(
  ({ exitZone, onEmpty, onToggle, onEdit, onDelete }, ref) => {
    const schedules = useStore($schedules);
    const streams = useStore($streams);

    const items = useMemo(
      () => schedules.map((s) => ({ id: s.id, segments: getScheduleSegments() })),
      [schedules],
    );

    const streamName = (streamId: string) =>
      streams.find((s) => s.id === streamId)?.name ?? m.schedule_stream_missing();

    const dispatch = (id: string, action: ScheduleAction) => {
      if (action === "edit") onEdit(id);
      else if (action === "toggle") onToggle(id);
      else onDelete(id);
    };

    return (
      <CompositeList<ScheduleTableHandle>
        ref={ref}
        zoneId="schedule-list"
        ariaLabel={m.zone_schedule_list()}
        items={items}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onTabOut={exitZone}
        onEmpty={onEmpty}
        imperativeExtra={({ focusItem }) => ({
          focusSchedule: (id: string) => focusItem(id),
        })}
        onAction={(type, itemId, segment) => {
          if (segment !== "summary") return;
          // Рішення 6: Enter = редагувати, Space = toggle, Delete = видалити.
          if (type === "primary") onEdit(itemId);
          else if (type === "toggle") onToggle(itemId);
          else if (type === "delete") onDelete(itemId);
        }}
        renderRow={({ id, isActive, isFocused }) => {
          const schedule = schedules.find((s) => s.id === id)!;
          return (
            <ScheduleItem
              key={id}
              schedule={schedule}
              streamName={streamName(schedule.streamId)}
              isActiveRow={isActive}
              isFocused={isFocused}
              onToggle={() => onToggle(id)}
              onAction={(action) => dispatch(id, action)}
            />
          );
        }}
      />
    );
  },
);
ScheduleTable.displayName = "ScheduleTable";
```

- [ ] **Step 2: Компіляція**

Run: `pnpm vite:build`
Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git add src/components/schedule/ScheduleTable.tsx
git commit -m "feat(scheduler): ScheduleTable composite list with focusSchedule"
```

---

### Task 10: formModel + ScheduleForm

**Files:**
- Create: `src/components/schedule/formModel.ts`
- Test: `src/components/schedule/formModel.test.ts`
- Create: `src/components/schedule/ScheduleForm.tsx`

- [ ] **Step 1: Failing-тести formModel** — `src/components/schedule/formModel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseMinutes, durationBetween, validateForm, toInput } from "./formModel";
import type { ScheduleFormValues } from "./formModel";

const valid: ScheduleFormValues = {
  name: "Evening Jazz", streamId: "st1", type: "recurring",
  days: [4, 0, 2], date: "", timeStart: "20:00", timeEnd: "22:00",
};

describe("parseMinutes", () => {
  it("парсить HH:MM", () => expect(parseMinutes("20:30")).toBe(1230));
  it("відкидає сміття", () => {
    expect(parseMinutes("")).toBeNull();
    expect(parseMinutes("24:00")).toBeNull();
    expect(parseMinutes("9:5")).toBeNull();
  });
});

describe("durationBetween", () => {
  it("звичайний інтервал", () => expect(durationBetween("20:00", "22:00")).toBe(120));
  it("через північ (§5.3): 22:30 → 00:30 = 120 хв", () =>
    expect(durationBetween("22:30", "00:30")).toBe(120));
  it("рівність — невалідно (запис на 0/24 год не підтримується)", () =>
    expect(durationBetween("20:00", "20:00")).toBeNull());
  it("невалідний час — null", () => expect(durationBetween("", "22:00")).toBeNull());
});

describe("validateForm", () => {
  it("валідні значення — без помилок", () => expect(validateForm(valid)).toEqual({}));
  it("порожня назва", () =>
    expect(validateForm({ ...valid, name: "  " }).name).toBe("nameRequired"));
  it("не обрано потік", () =>
    expect(validateForm({ ...valid, streamId: "" }).streamId).toBe("streamRequired"));
  it("recurring без днів", () =>
    expect(validateForm({ ...valid, days: [] }).days).toBe("daysRequired"));
  it("oneshot без дати", () =>
    expect(validateForm({ ...valid, type: "oneshot", days: [], date: "" }).date)
      .toBe("dateRequired"));
  it("oneshot із датою — днів не вимагає", () =>
    expect(validateForm({ ...valid, type: "oneshot", days: [], date: "2026-06-14" }))
      .toEqual({}));
  it("невалідний час", () =>
    expect(validateForm({ ...valid, timeStart: "" }).time).toBe("timeRequired"));
  it("кінець = початку", () =>
    expect(validateForm({ ...valid, timeEnd: "20:00" }).time).toBe("timeEqual"));
});

describe("toInput", () => {
  it("recurring: сортовані дні, date = null, duration з пари часів", () => {
    expect(toInput(valid, true)).toEqual({
      streamId: "st1", name: "Evening Jazz", type: "recurring",
      days: [0, 2, 4], date: null, time: "20:00", durationMinutes: 120, enabled: true,
    });
  });
  it("oneshot: дні порожні, дата збережена", () => {
    const input = toInput(
      { ...valid, type: "oneshot", days: [3], date: "2026-06-14" }, false,
    );
    expect(input.days).toEqual([]);
    expect(input.date).toBe("2026-06-14");
    expect(input.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Тести падають**

Run: `pnpm test src/components/schedule/formModel.test.ts`
Expected: FAIL — модуль не існує.

- [ ] **Step 3: Реалізувати `src/components/schedule/formModel.ts`:**

```ts
import type { ScheduleType, ScheduledRecordingInput } from "../../lib/tauri";

export interface ScheduleFormValues {
  name: string;
  streamId: string;
  type: ScheduleType;
  days: number[];
  /** "" — не задано. */
  date: string;
  /** "HH:MM" або "". */
  timeStart: string;
  timeEnd: string;
}

export type FormErrorCode =
  | "nameRequired" | "streamRequired" | "daysRequired"
  | "dateRequired" | "timeRequired" | "timeEqual";

export type FormErrors = Partial<
  Record<"name" | "streamId" | "days" | "date" | "time", FormErrorCode>
>;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseMinutes(time: string): number | null {
  if (!TIME_RE.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Тривалість між початком і кінцем; кінець < початку = через північ (§5.3).
 * 0 (рівність) → null: запис на 0 або 24 години не підтримується (§2).
 */
export function durationBetween(timeStart: string, timeEnd: string): number | null {
  const start = parseMinutes(timeStart);
  const end = parseMinutes(timeEnd);
  if (start == null || end == null) return null;
  const d = (end - start + 1440) % 1440;
  return d === 0 ? null : d;
}

/** Клієнтська валідація §5.3 (коди — компонент мапить на i18n-рядки). */
export function validateForm(v: ScheduleFormValues): FormErrors {
  const errors: FormErrors = {};
  if (!v.name.trim()) errors.name = "nameRequired";
  if (!v.streamId) errors.streamId = "streamRequired";
  if (v.type === "recurring" && v.days.length === 0) errors.days = "daysRequired";
  if (v.type === "oneshot" && !v.date) errors.date = "dateRequired";
  const start = parseMinutes(v.timeStart);
  const end = parseMinutes(v.timeEnd);
  if (start == null || end == null) errors.time = "timeRequired";
  else if (start === end) errors.time = "timeEqual";
  return errors;
}

/** Збирання payload §4. Викликати лише після validateForm без помилок. */
export function toInput(v: ScheduleFormValues, enabled: boolean): ScheduledRecordingInput {
  return {
    streamId: v.streamId,
    name: v.name.trim(),
    type: v.type,
    days: v.type === "recurring" ? [...new Set(v.days)].sort((a, b) => a - b) : [],
    date: v.type === "oneshot" ? v.date : null,
    time: v.timeStart,
    durationMinutes: durationBetween(v.timeStart, v.timeEnd)!,
    enabled,
  };
}
```

- [ ] **Step 4: Тести зелені**

Run: `pnpm test src/components/schedule/formModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Створити `src/components/schedule/ScheduleForm.tsx`** (порядок Tab — §5.3; focus trap дає Modal):

```tsx
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
```

- [ ] **Step 6: Компіляція + повні тести**

Run: `pnpm test` та `pnpm vite:build`
Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/components/schedule/formModel.ts src/components/schedule/formModel.test.ts src/components/schedule/ScheduleForm.tsx
git commit -m "feat(scheduler): add/edit schedule dialog with validated form model"
```

---

### Task 11: SchedulePanel + інтеграція в App + увімкнення секції

**Files:**
- Create: `src/components/schedule/SchedulePanel.tsx`
- Test: `src/components/schedule/SchedulePanel.test.tsx`
- Modify: `src/App.tsx`, `src/lib/sections.ts`, `src/components/layout/ActivityBar.tsx`

- [ ] **Step 1: Failing-тести** — `src/components/schedule/SchedulePanel.test.tsx` (патерн ProfilesPanel.test):

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SchedulePanel } from "./SchedulePanel";
import { $schedules, $schedulesLoading, $schedulesError } from "../../stores/schedule";
import { $streams } from "../../stores/streams";
import { $announcer } from "../../stores/announcer";
import * as tauri from "../../lib/tauri";
import type { ScheduleDto, StreamInfo } from "../../lib/tauri";

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
});

describe("SchedulePanel", () => {
  it("порожній стан із підказкою", async () => {
    renderPanel();
    expect(await screen.findByText("Поки що немає розкладів")).toBeTruthy();
  });

  it("рендерить рядок розкладу з назвою потоку", async () => {
    $schedules.set([dto()]);
    renderPanel();
    expect(await screen.findByText("Evening Jazz")).toBeTruthy();
    expect(screen.getByText(/Radio Jazz UA/)).toBeTruthy();
  });

  it("кнопка стану викликає toggle_schedule і озвучує", async () => {
    $schedules.set([dto()]);
    vi.mocked(tauri.toggleSchedule).mockResolvedValueOnce(
      { ...dto(), enabled: false } as never,
    );
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Увімкнено" }));
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
    $schedules.set([dto()]);
    renderPanel();
    // контекстне меню рядка
    fireEvent.click(await screen.findByRole("button", { name: "Дії" }));
    fireEvent.click(await screen.findByText("Видалити"));
    expect(await screen.findByText("Видалити «Evening Jazz»?")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Видалити" }).at(-1)!);
    await waitFor(() => expect(tauri.deleteSchedule).toHaveBeenCalledWith("s1"));
  });

  it("осиротілий розклад показує «потік видалено»", async () => {
    $schedules.set([dto({ streamId: "ghost" })]);
    renderPanel();
    expect(await screen.findByText(/потік видалено/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Тести падають**

Run: `pnpm test src/components/schedule/SchedulePanel.test.tsx`
Expected: FAIL — модуль не існує.

- [ ] **Step 3: Створити `src/components/schedule/SchedulePanel.tsx`:**

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@nanostores/react";
import {
  $schedules, $schedulesError, $schedulesLoading, loadSchedules,
} from "../../stores/schedule";
import { ScheduleTable, type ScheduleTableHandle } from "./ScheduleTable";
import { ScheduleForm } from "./ScheduleForm";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { ListCard, ListCardState } from "../common/ListCard";
import { ScreenHeader } from "../layout/ScreenHeader";
import { ScreenZone } from "../layout/ScreenZone";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { useAnnounce } from "../../hooks/useAnnounce";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as tauri from "../../lib/tauri";
import type { ScheduleDto, ScheduledRecording } from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

export function SchedulePanel({ onZonesChange, exitZone }: Props) {
  const schedules = useStore($schedules);
  const loading = useStore($schedulesLoading);
  const error = useStore($schedulesError);
  const announce = useAnnounce();

  const tableRef = useRef<ScheduleTableHandle | null>(null);
  // Stable proxy: таблиця демонтується на loading/error/empty — App не повинен
  // тримати мертвий ZoneEntry, інакше F6 мовчки глухне (патерн SongsPanel).
  const tableProxyRef = useRef<ZoneEntry>({
    id: "schedule-list",
    get el() { return tableRef.current?.el as HTMLElement; },
    focus: (dir) => tableRef.current?.focus(dir),
  });

  const [formFor, setFormFor] = useState<{ schedule: ScheduleDto | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ScheduleDto | null>(null);

  useEffect(() => { loadSchedules(); }, []);

  // ── Toolbar zone (одна кнопка «Додати розклад») ──
  const toolbarZoneRef = useRef<HTMLDivElement | null>(null);
  const addBtn = useRef<HTMLButtonElement | null>(null);
  const toolbarRefs = useMemo(() => [addBtn], []);
  const {
    onKeyDown: toolbarKeyDown,
    getTabIndex: toolbarTabIndex,
    restoreFocus: toolbarRestore,
  } = useRovingFocus(toolbarRefs, "horizontal", {
    mode: "mixed-boundary-handoff",
    onTabBoundary: (forward) => exitZone("schedule-toolbar", forward),
  });

  const hasRows = !loading && !error && schedules.length > 0;

  useEffect(() => {
    const toolbarZone: ZoneEntry = {
      id: "schedule-toolbar",
      get el() { return toolbarZoneRef.current!; },
      focus: toolbarRestore,
    };
    const zones: ZoneEntry[] = [toolbarZone];
    if (hasRows) zones.push(tableProxyRef.current);
    onZonesChange(zones);
  // onZonesChange — стабільний reference від App.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolbarRestore, hasRows]);

  const find = (id: string) => $schedules.get().find((s) => s.id === id);

  const handleToggle = async (id: string) => {
    const s = find(id);
    if (!s) return;
    try {
      const updated = await tauri.toggleSchedule(id, !s.enabled);
      announce(
        updated.enabled
          ? m.schedule_toggled_on({ name: updated.name })
          : m.schedule_toggled_off({ name: updated.name }),
        "assertive",
      );
      await loadSchedules();
    } catch (e) {
      // Напр., увімкнення відпрацьованого oneshot — помилка валідації (§2).
      addToast(String(e), "error");
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await tauri.deleteSchedule(confirmDelete.id);
      announce(m.schedule_deleted({ name: confirmDelete.name }), "assertive");
      await loadSchedules();
      requestAnimationFrame(() => {
        if ($schedules.get().length > 0) tableRef.current?.focus("forward");
        else addBtn.current?.focus();
      });
    } catch (e) {
      addToast(String(e), "error");
    }
    setConfirmDelete(null);
  };

  const handleSaved = async (saved: ScheduledRecording, isNew: boolean) => {
    setFormFor(null);
    announce(
      isNew ? m.schedule_added({ name: saved.name }) : m.schedule_saved({ name: saved.name }),
      "assertive",
    );
    await loadSchedules();
    requestAnimationFrame(() => tableRef.current?.focusSchedule(saved.id));
  };

  return (
    <div role="region" aria-label={m.schedule_section()} className="flex flex-1 flex-col overflow-hidden">
      {/* ── Toolbar zone ── */}
      <ScreenZone
        ref={toolbarZoneRef}
        id="schedule-toolbar"
        role="application"
        label={m.zone_schedule_toolbar()}
        onKeyDown={toolbarKeyDown}
      >
        <ScreenHeader title={m.schedule_section()}>
          <button
            ref={addBtn}
            tabIndex={toolbarTabIndex(0)}
            onClick={() => setFormFor({ schedule: null })}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:border forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]"
          >
            {m.schedule_add()}
          </button>
        </ScreenHeader>
      </ScreenZone>

      {/* ── Таблиця / стани ── */}
      <ListCard>
        {loading && (
          <ListCardState role="status" className="text-slate-400">
            {m.schedule_loading()}
          </ListCardState>
        )}
        {error && (
          <ListCardState role="alert" className="text-red-400">
            {m.schedule_error({ error })}
          </ListCardState>
        )}
        {!loading && !error && schedules.length === 0 && (
          <ListCardState role="status">{m.schedule_empty()}</ListCardState>
        )}
        {hasRows && (
          <ScheduleTable
            ref={tableRef}
            exitZone={(forward) => exitZone("schedule-list", forward)}
            onEmpty={() => addBtn.current?.focus()}
            onToggle={handleToggle}
            onEdit={(id) => { const s = find(id); if (s) setFormFor({ schedule: s }); }}
            onDelete={(id) => { const s = find(id); if (s) setConfirmDelete(s); }}
          />
        )}
      </ListCard>

      {/* ── Діалоги (portalled) ── */}
      {formFor && createPortal(
        <ScheduleForm
          schedule={formFor.schedule}
          onSaved={handleSaved}
          onClose={() => setFormFor(null)}
        />,
        document.body,
      )}

      {confirmDelete && createPortal(
        <ConfirmDialog
          title={m.schedule_confirm_delete_title()}
          message={m.schedule_confirm_delete_body({ name: confirmDelete.name })}
          confirmLabel={m.schedule_action_delete()}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />,
        document.body,
      )}
    </div>
  );
}
```

- [ ] **Step 4: Тести зелені**

Run: `pnpm test src/components/schedule/SchedulePanel.test.tsx`
Expected: PASS. Якщо падає матчер імені кнопки/заголовка — звірити реальні ролі через `screen.debug()` і поправити **тест** (роль/ім'я), не компонент.

- [ ] **Step 5: Інтеграція в App + увімкнення секції.**

`src/App.tsx` — імпорт і рендер:

```ts
import { SchedulePanel } from "./components/schedule/SchedulePanel";
```

```tsx
        {activeSection === "songs" && <SongsPanel onZonesChange={onZonesChange} exitZone={exitZone} />}
        {activeSection === "schedule" && <SchedulePanel onZonesChange={onZonesChange} exitZone={exitZone} />}
```

`src/lib/sections.ts` — прибрати `disabled: true` і застарілий коментар:

```ts
  { id: "schedule", label: m.schedule_section, digit: 4 },
```

(також оновити doc-коментар поля `disabled`: `/** True while the section is not yet shippable. */` — приклад «Schedule until Phase 3D» більше не актуальний.)

`src/components/layout/ActivityBar.tsx` — прибрати запис про Schedule:

```ts
// Phase shown in the disabled-section hint; no section is disabled today.
const PHASES: Partial<Record<Section, string>> = {};
```

- [ ] **Step 6: Повні тести + build**

Run: `pnpm test` та `pnpm vite:build`
Expected: PASS (зокрема наявні тести ActivityBar/sections — якщо котрийсь перевіряв disabled-стан Schedule, оновити його очікування: секція тепер активна).

- [ ] **Step 7: Commit**

```powershell
git add src/components/schedule/SchedulePanel.tsx src/components/schedule/SchedulePanel.test.tsx src/App.tsx src/lib/sections.ts src/components/layout/ActivityBar.tsx
git commit -m "feat(scheduler): SchedulePanel screen and enabled Schedule section (Alt+4)"
```

---

### Task 12: Settings → Запис → група «Планувальник»

Спека §5.4: «Починати раніше, хв» (0–30), «Закінчувати пізніше, хв» (0–60), default 0/0. Backend-кламп уже існує (Фаза 1, `clamp_schedule_padding`); TS-поля `schedulePadBeforeMin/AfterMin` уже в `RecordingSettings`.

**Files:**
- Modify: `src/components/settings/RecordingTab.tsx`
- Test: `src/components/settings/RecordingTab.test.tsx` (create)

- [ ] **Step 1: Failing-тест** — `src/components/settings/RecordingTab.test.tsx` (патерн AudioTab.test; `$recordingSettings` — заповнити всі поля типу `RecordingSettings` з `src/lib/tauri.ts`, значення нижче орієнтовні):

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { RecordingTab } from "./RecordingTab";
import { $recordingSettings, $settings } from "../../stores/settings";
import type { RecordingSettings } from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  saveRecordingSettings: vi.fn().mockResolvedValue(undefined),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  openDirectoryPicker: vi.fn().mockResolvedValue(null),
}));

const baseRecording: RecordingSettings = {
  outputDir: "recordings",
  fileNameTemplate: "%artist% - %title%",
  incompleteFileNameTemplate: "incomplete/%artist% - %title%",
  streamFileNameTemplate: "%station%/stream",
  saveStreamFile: false,
  deleteStreamFileOnStop: false,
  skipFirstIncompleteTrack: true,
  skipShortTracksMs: 30000,
  autoCorrectCase: true,
  schedulePadBeforeMin: 0,
  schedulePadAfterMin: 0,
  reconnect: {
    maxRetries: 10, retryIntervalSecs: 5, backoffMultiplier: 1.5, maxIntervalSecs: 60,
  },
} as RecordingSettings;

beforeEach(() => {
  vi.clearAllMocks();
  $recordingSettings.set(baseRecording);
});

afterEach(() => {
  $recordingSettings.set(null);
});

describe("RecordingTab — група «Планувальник» (§5.4)", () => {
  it("рендерить обидва поля padding із поточними значеннями", () => {
    const { getByRole } = render(<RecordingTab />);
    expect(getByRole("textbox", { name: m.settings_schedule_pad_before() })).toBeTruthy();
    expect(getByRole("textbox", { name: m.settings_schedule_pad_after() })).toBeTruthy();
  });

  it("зміна «Починати раніше» пише в store", () => {
    const { getByRole } = render(<RecordingTab />);
    const input = getByRole("textbox", { name: m.settings_schedule_pad_before() });
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect($recordingSettings.get()?.schedulePadBeforeMin).toBe(5);
  });

  it("зміна «Закінчувати пізніше» пише в store", () => {
    const { getByRole } = render(<RecordingTab />);
    const input = getByRole("textbox", { name: m.settings_schedule_pad_after() });
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect($recordingSettings.get()?.schedulePadAfterMin).toBe(10);
  });
});
```

- [ ] **Step 2: Тести падають**

Run: `pnpm test src/components/settings/RecordingTab.test.tsx`
Expected: FAIL — полів немає (`Unable to find role "textbox"` з цим іменем).

- [ ] **Step 3: Додати групу** в `RecordingTab.tsx` — перед блоком `{/* Section: Reconnection (collapsed) */}`:

```tsx
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
```

- [ ] **Step 4: Тести зелені**

Run: `pnpm test src/components/settings/RecordingTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/settings/RecordingTab.tsx src/components/settings/RecordingTab.test.tsx
git commit -m "feat(scheduler): scheduler padding group in recording settings"
```

---

### Task 13: Confirm переключення профілю з активним плановим записом

Спека §3.5: «confirm dialog, якщо триває плановий запис … якщо активних кілька — перелік і множина в тексті». Існуючий generic confirm (будь-які записи) лишається фолбеком.

**Files:**
- Modify: `src/components/profile/ProfilesPanel.tsx`
- Modify: `src/components/profile/ProfilesPanel.test.tsx`

- [ ] **Step 1: Failing-тест.** В існуючий `ProfilesPanel.test.tsx`:

1. У `vi.mock("../../lib/tauri", …)` додати:

```ts
  getActiveScheduled: vi.fn(async () => []),
```

2. У мок messages додати:

```ts
  profile_switch_scheduled_one: ({ name, end }: { name: string; end: string }) =>
    `Триває плановий запис «${name}» до ${end}. Переключити профіль і зупинити його?`,
  profile_switch_scheduled_item: ({ name, end }: { name: string; end: string }) => `«${name}» до ${end}`,
  profile_switch_scheduled_many: ({ list }: { list: string }) => `Тривають планові записи: ${list}. Переключити?`,
  schedule_result_none: () => "—",
```

3. Новий тест (поряд із наявними тестами switch):

```tsx
  it("переключення з активним плановим записом — confirm з назвою і часом кінця", async () => {
    vi.mocked(tauri.getActiveScheduled).mockResolvedValueOnce([
      { recordingId: "r1", name: "Evening Jazz", streamId: "st1", windowEnd: "2026-06-12T22:05" },
    ]);
    renderPanel();
    const row = await screen.findByText("Jazz");
    // та сама послідовність дій, що в наявному switch-тесті цього файлу
    // (натиснути switch-кнопку рядка «Jazz»)
    fireEvent.click(within(row.closest("li")!).getByRole("button", { name: /Switch/ }));
    expect(
      await screen.findByText(
        "Триває плановий запис «Evening Jazz» до 22:05. Переключити профіль і зупинити його?",
      ),
    ).toBeTruthy();
    expect(tauri.switchProfile).not.toHaveBeenCalled();
  });
```

(Точний спосіб натискання switch-кнопки скопіювати з наявного тесту «switches profile…» цього ж файлу — він уже знає правильну роль/ім'я.)

- [ ] **Step 2: Тест падає**

Run: `pnpm test src/components/profile/ProfilesPanel.test.tsx`
Expected: новий тест FAIL (generic confirm замість scheduled-тексту або одразу switch), наявні — PASS.

- [ ] **Step 3: Реалізувати.** У `ProfilesPanel.tsx`:

1. Імпорти:

```ts
import type { ActiveScheduled, ImportPreview } from "../../lib/tauri";
import { activeScheduledMessage } from "../../lib/scheduleFormat";
```

2. Розширити `SubDialog`:

```ts
type SubDialog =
  | null
  | { type: "create" }
  | { type: "rename" }
  | { type: "duplicate" }
  | { type: "delete" }
  | { type: "switch-confirm" }
  | { type: "switch-confirm-scheduled"; active: ActiveScheduled[] }
  | { type: "import"; preview: ImportPreview };
```

3. У `handleSwitch` перед перевіркою статусів:

```ts
  const handleSwitch = async (name: string) => {
    if (name === activeProfile) { announce(m.profile_already_active()); return; }
    setTarget(name);
    try {
      // §3.5: плановий запис — спеціальний confirm з назвою і часом кінця.
      const scheduled = await tauri.getActiveScheduled();
      if (scheduled.length > 0) {
        setSubDialog({ type: "switch-confirm-scheduled", active: scheduled });
        return;
      }
      const statuses = await tauri.getAllStatuses?.() ?? [];
      const hasRecordings = statuses.some((s) => s.state === "recording");
      if (hasRecordings) { setSubDialog({ type: "switch-confirm" }); return; }
      await doSwitch(name);
    } catch (e) { addToast(String(e), "error"); }
  };
```

4. Новий portalled confirm (поруч зі `switch-confirm`):

```tsx
      {subDialog?.type === "switch-confirm-scheduled" && createPortal(
        <ConfirmDialog
          title={m.profile_switch()}
          message={activeScheduledMessage(subDialog.active)}
          confirmLabel={m.profile_switch()}
          onConfirm={() => doSwitch(target)}
          onCancel={() => setSubDialog(null)}
        />,
        document.body,
      )}
```

- [ ] **Step 4: Тести зелені**

Run: `pnpm test src/components/profile/ProfilesPanel.test.tsx`
Expected: PASS (нові і старі).

- [ ] **Step 5: Commit**

```powershell
git add src/components/profile/ProfilesPanel.tsx src/components/profile/ProfilesPanel.test.tsx
git commit -m "feat(scheduler): profile-switch confirm lists active scheduled recordings"
```

---

### Task 14: Документація, повні gates, ручний NVDA-сценарій

**Files:**
- Modify: `docs/superpowers/specs/2026-06-12-scheduler-design.md`
- Modify: `AGENTS.md`
- Modify: `docs/implementation-phases.md`

- [ ] **Step 1: Спека §9** — замінити рядок «Фаза 3: _план ще не написано_» на:

```markdown
- Фаза 3: [2026-06-12-scheduler-phase-3-ui.md](../plans/2026-06-12-scheduler-phase-3-ui.md)
```

- [ ] **Step 2: Повні gates**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
pnpm test
pnpm vite:build
```

Expected: усі PASS. Якщо ні — лагодити до зеленого, не йти далі.

- [ ] **Step 3: Ручний NVDA-сценарій (§7)** — виконати з розробником на живому застосунку (`just dev` або `just build-fast`). Кожен пункт відмічати лише після фактичної перевірки:

1. Розклад на now+2 хв, тривалість 2 хв → стартує (live region + balloon), зупиняється, файл є, last_result «✓ записано N хв».
2. Закрити Tapir до старту, відкрити посеред вікна → StartedLate, дописано решту.
3. Зупинити плановий запис вручну → не рестартує, статус «зупинено вручну».
4. Запустити ручний запис потоку, дочекатись планового старту → skip (live region «не стартував»), ручний запис не зупинено в кінці вікна.
5. Переключити профіль під час планового запису → confirm із назвою і часом «до HH:MM», запис зупинено.
6. Закрити Tapir під час планового запису (MessageBox містить «Триває плановий запис…»), відкрити знову (вікно ще активне) → запис відновлюється один раз через catch-up (StartedLate), без дубля.
7. Глобальний stop-all (хоткей) під час планового запису → зупинено, статус «зупинено вручну», без рестарту до кінця вікна.
8. Обірвати мережу під час планового запису, дочекатися реконекту і кінця вікна → запис зупинено штатно.
9. NVDA: ScheduleTable — стрілки по рядках/сегментах, toggle озвучується; ScheduleForm — всі поля з label, помилки валідації озвучуються; обидві зони доступні через F6.

- [ ] **Step 4: Чекбокси Done у спеці §6** — після проходження сценарію відмітити `- [x]` всі 13 пунктів §6.

- [ ] **Step 5: Статус фази.** В `AGENTS.md` замінити рядок таблиці:

```markdown
| Phase 3D — Scheduler | ✅ Complete | `feature/phase-3d-scheduler` |
```

У `docs/implementation-phases.md` — оновити статус Phase 3D на «виконано» (формат за сусідніми завершеними фазами цього файлу).

- [ ] **Step 6: Commit**

```powershell
git add docs/superpowers/specs/2026-06-12-scheduler-design.md AGENTS.md docs/implementation-phases.md
git commit -m "docs(scheduler): phase 3 plan link, Done checklist, roadmap status"
```

Після цього — `superpowers:finishing-a-development-branch` (мердж у `develop` із зеленими gates).
