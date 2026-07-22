# ROADMAP беклогу

Навігаційна карта записів [`docs/backlog/`](README.md), згрупована за `target`
(semver-версією з front-matter). **Front-matter кожного запису — першоджерело**;
цей файл підтримується вручну й може дрейфувати — за розбіжності вір файлу запису.

> Це не той самий roadmap, що [`docs/implementation-phases.md`](../implementation-phases.md)
> (офіційний фазовий roadmap застосунку). Цей файл впорядковує **беклог** —
> те, що ще не стало фазою — за версією, яку розробник планує його зробити.

Посилання — за **slug**, стабільні (не нумерація `#N`). Секції йдуть за зростанням
semver; `unscheduled` — наприкінці.

---

## v0.1.0

| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує |
|------|---|-----|------|---------|---------------|-------------|
| [resume-last-playback](p2-resume-last-playback.md) | P2 | planned | ready | M | [playback-toggle-stop-pause](done/p1-playback-toggle-stop-pause.md) ✅, [resume-file-from-setting](done/p2-resume-file-from-setting.md) ✅, [autostart](done/p2-autostart.md) ✅, [crash-recovery](done/p1-crash-recovery.md) ✅ | — |
| [log-rotation](p2-log-rotation.md) | P2 | planned | ready | S | — | — |
| [open-song-with-default-app](p2-open-song-with-default-app.md) | P2 | planned | ready | M | — | — |
| [unwrap-in-tests](p3-unwrap-in-tests.md) | P3 | planned | ready | S | — | — (housekeeping, будь-коли) |
| [wishlist-stale-list-ref](p2-wishlist-stale-list-ref.md) | P2 | research | ready | S | [wishlist-example-patterns](done/p2-wishlist-example-patterns.md) ✅ | — |
| [import-duplicate-metadata-update](p2-import-duplicate-metadata-update.md) | P2 | idea | draft | S | — | — |
| [full-edit-stream](p2-full-edit-stream.md) | P2 | planned | draft | M | — | — |

## v0.2.0

| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує |
|------|---|-----|------|---------|---------------|-------------|
| [command-palette-phase-3](p2-command-palette-phase-3.md) | P2 | idea | draft | M | — | [command-palette-phase-4](p3-command-palette-phase-4.md) |
| [command-palette-phase-4](p3-command-palette-phase-4.md) | P3 | idea | **blocked** | M | [command-palette-phase-3](p2-command-palette-phase-3.md) | — |

## unscheduled

| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує |
|------|---|-----|------|---------|---------------|-------------|
| [mpv-playback-engine](p3-mpv-playback-engine.md) | P3 | research | draft | L | — | [he-aac-mf-playback](p3-he-aac-mf-playback.md), [hls-stream-support](p3-hls-stream-support.md) (розвилка — може закрити обидва) |
| [he-aac-mf-playback](p3-he-aac-mf-playback.md) | P3 | research | draft | M | — | залежить від рішення mpv-playback-engine |
| [hls-stream-support](p3-hls-stream-support.md) | P3 | idea | draft | L | — | залежить від рішення mpv-playback-engine |
| [post-processing](p2-post-processing.md) | P2 | idea | draft | M | — | — |
| [profile-switch-orphaned-tasks](p2-profile-switch-orphaned-tasks.md) | P2 | idea | draft | M | — | **умовний** — брати лише за реальним тригером |
| [quick-controls-overlay](p3-quick-controls-overlay.md) | P3 | idea | draft | L | — | — |
| [screen-reader-direct-speech](p3-screen-reader-direct-speech.md) | P3 | idea | **blocked** | S | — | тригер-gated, не планувати |

---

## Виконано

| Запис | Коли | Що лишилось у спадок |
|-------|------|----------------------|
| [streams-empty-focus-audit](done/p2-streams-empty-focus-audit.md) | 2026-07-20 | гіпотеза підтверджена + третій мертвий шлях (одиничне move-to-profile); імперативний `onEmpty()` у `handleConfirmDelete`/`doTransfer` (`StreamList.tsx`) за зразком `223fadb`; 3 регресійні тести «SINGLE-op empty transitions» у `StreamsPanel.test.tsx` |
| [wishlist-example-patterns](done/p2-wishlist-example-patterns.md) | 2026-07-19 | CTA «Додати приклад» у власній зоні `wishlist-empty` (`WishlistPanel.tsx`) — не в `PatternList`'s `emptyExtra` (той варіант виявився keyboard-unreachable, rev R1); фіксований масив `examplePatterns.ts`; ключі `wishlist_add_example`/`wishlist_examples_adding`/`wishlist_examples_added`/`wishlist_examples_failed`. Застосувало патерн `streams-ctrlk-empty-hint` |
| [streams-ctrlk-empty-hint](done/p2-streams-ctrlk-empty-hint.md) | 2026-07-19 | бейдж «Команди — Ctrl+K» у порожньому стані `StreamsPanel` (не Tab-стоп); константа `PALETTE_COMBO` читає комбінацію з `SHORTCUTS`, тож бейдж не розходиться з F1-довідкою; ключ `streams_empty_palette_hint`. Завершує ADR 2026-05-31 §6 (S3) — патерн для `wishlist-example-patterns` |
| [browser-add-probe](done/p2-browser-add-probe.md) | 2026-07-19 | подія `browser-station-probe-result` + `useBrowserProbeFeedback` (App-wide, озвучує лише невдачі/підсумок); `spawn_probe_added()` у `browser_commands.rs` — detached probe після збереження, `buffer_unordered(5)` |
| [add-stream-probe](done/p2-add-stream-probe.md) | 2026-07-19 | IPC `probe_stream(url) -> { ok, error }` + `probe_once()` у `stream_io_commands.rs` (спільний 5-с `SINGLE_PROBE_TIMEOUT`); sync-spinner + «Все одно додати» в `AddStreamDialog` |
| [volume-nan-validation](done/p2-volume-nan-validation.md) | 2026-07-19 | хелпер `sanitize_volume()` у `player/engine.rs` — єдина точка санітизації гучності на межах IPC (`set_volume`) і профілю (`PlayerEngine::new`); non-finite → `0.0` |
| [activity-bar-help-button](done/p1-activity-bar-help-button.md) | 2026-07-19 | кнопка Help у footer `ActivityBar.tsx` (над Settings, спільний атом `$helpOpen` з `F1`); roving-order бару тепер 8 елементів |
| [crash-recovery](done/p1-crash-recovery.md) | 2026-07-18 | `data/state.json` (`cleanShutdown` + `activeRecordings[{streamId, url?}]`), снапшот-писар (`Notify` + 30с interval + 500мс debounce, `crash_recovery.rs`), auto-resume в setup-хуку, deferred подія `crash-resume`, `useCrashResumeFeedback` (NVDA polite + toast) — `Profile.active_recording_urls` прибрано |
| [resume-file-from-setting](done/p2-resume-file-from-setting.md) | 2026-07-18 | `resume_file_from` у `GlobalSettings`, `plan_file_resume`/`emit_resuming` у `playback_control.rs`, NVDA-анонс позиції — нульового виносу немає, чисто адитивно |
| [playback-toggle-stop-pause](done/p1-playback-toggle-stop-pause.md) | 2026-07-18 | `PlayerSession.last_active` + оживлені `last_stream_id`/`last_file_position`, `playback_control.rs`, cold-start resume — база для `resume-last-playback` (вище) |
| [autostart](done/p2-autostart.md) | 2026-06-25 | winreg-автостарт (`autostart.rs`), CLI `--minimize`; сам **не** грає — авто-гра лише через `autoplay_on_startup` (`resume-last-playback`) |

---

## Перехресні рішення

1. ✅ **resume-last-playback vs playback-toggle-stop-pause** — _вирішено 2026-06-25 (A1), базу
   реалізовано 2026-07-18; політику фіналізовано 2026-07-19._ `resume-last-playback` — надбудова над
   `PlayerSession`; **окремого `last_playback.json` немає.** Політика —
   `autoplay_on_startup: bool` (без `always_paused` — дублює cold-start `Ctrl+Shift+K`;
   без `restore`) — нове поле **в `PlayerSession`** → per-profile. Авто-гра — явний opt-in.
2. ✅ **state.json (crash-recovery, done) vs стан відтворення (resume-last-playback)** — _знято (A1)._ Стан
   відтворення живе в `PlayerSession` (профіль), crash — у `data/state.json`; два чітко
   різні сховища, звіряти нема чого.
3. ✅ **autostart ↔ відтворення** — _вирішено (A3 через A1), обидві сторони реалізовано._
   Autostart сам **не** грає; авто-гра ⇔ активний профіль має `autoplay_on_startup = true`
   (поле вводить `resume-last-playback`).
4. **mpv-playback-engine ↔ he-aac-mf-playback / hls-stream-support.** Якщо mpv проходить PoC — винести
   обидва записи в `done/` як зняті. _(A4 — відкрите.)_
