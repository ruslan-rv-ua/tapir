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
| [stream-name-disambiguation](p0-stream-name-disambiguation.md) | P0 | planned | ready | M | — | — |
| [wishlist-stale-list-ref](p1-wishlist-stale-list-ref.md) | P1 | planned | ready | S | [wishlist-example-patterns](done/p2-wishlist-example-patterns.md) ✅ | — |
| [log-rotation](p1-log-rotation.md) | P1 | planned | ready | S | — | — |
| [open-song-with-default-app](p1-open-song-with-default-app.md) | P1 | planned | ready | M | — | — |
| [open-stream-with-default-app](p1-open-stream-with-default-app.md) | P1 | planned | ready | S | — | — |
| [help-content-polish](p1-help-content-polish.md) | P1 | planned | ready | M | — | — |
| [full-edit-stream](p1-full-edit-stream.md) | P1 | planned | draft | M | — | — |
| [webview-reload-guard](p2-webview-reload-guard.md) | P2 | planned | ready | S | — | [keyboard-shortcuts-audit](p2-keyboard-shortcuts-audit.md) |
| [keyboard-shortcuts-audit](p2-keyboard-shortcuts-audit.md) | P2 | planned | ready | S | [webview-reload-guard](p2-webview-reload-guard.md) | — |
| [hotkeys-expansion](p2-hotkeys-expansion.md) | P2 | planned | ready | M | — | — |
| [settings-sidebar-tabs](p2-settings-sidebar-tabs.md) | P2 | planned | ready | S | — | — |
| [unwrap-in-tests](p3-unwrap-in-tests.md) | P3 | planned | ready | S | — | — (housekeeping, будь-коли) |
| [import-duplicate-metadata-update](p3-import-duplicate-metadata-update.md) | P3 | planned | ready | M | — | — |

## v0.2.0

| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує |
|------|---|-----|------|---------|---------------|-------------|
| [command-palette-phase-3](p2-command-palette-phase-3.md) | P2 | planned | ready | S | — | [command-palette-phase-4](p3-command-palette-phase-4.md), [command-palette-mode-prefixes](p3-command-palette-mode-prefixes.md) |
| [command-palette-phase-4](p3-command-palette-phase-4.md) | P3 | planned | **blocked** | S | [command-palette-phase-3](p2-command-palette-phase-3.md) | — |

## unscheduled

<!-- Відсортовано за пріоритетом і корисністю (P1 → P2 → P3). -->
<!-- P значення відповідають front-matter записів (першоджерело). -->

| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує |
|------|---|-----|------|---------|---------------|-------------|
| [focus-active-item-on-playback-start](p1-focus-active-item-on-playback-start.md) | P1 | idea | draft | S | — | — |
| [wishlist-conditions](p1-wishlist-conditions.md) | P1 | idea | draft | L | — | — |
| [browser-filter-cursor-reset](p2-browser-filter-cursor-reset.md) | P2 | planned | ready | S | — | — |
| [sleep-timer](p2-sleep-timer.md) | P2 | idea | draft | S | — | — |
| [pause-recording](p2-pause-recording.md) | P2 | idea | draft | M | — | — |
| [focus-on-screen-open-option](p2-focus-on-screen-open-option.md) | P2 | idea | draft | S | — | — |
| [command-palette-fuzzy-search](p2-command-palette-fuzzy-search.md) | P2 | idea | draft | S | — | — |
| [command-palette-taxonomy](p2-command-palette-taxonomy.md) | P2 | idea | draft | M | — | — (спірна — див. «Відкриті питання»; розчеплено з phase-3) |
| [post-processing](p2-post-processing.md) | P2 | idea | draft | M | — | — |
| [command-palette-dual-language-search](p2-command-palette-dual-language-search.md) | P2 | idea | draft | S | — | — |
| [wishlist-separate-folder](p2-wishlist-separate-folder.md) | P2 | idea | draft | S | — | — |
| [stream-manual-reorder](p2-stream-manual-reorder.md) | P2 | idea | draft | M | — | — |
| [track-log-only-mode](p2-track-log-only-mode.md) | P2 | idea | draft | M | — | — |
| [quick-controls-overlay](p2-quick-controls-overlay.md) | P2 | idea | draft | L | — | — |
| [command-palette-mode-prefixes](p3-command-palette-mode-prefixes.md) | P3 | idea | draft | S | [command-palette-phase-3](p2-command-palette-phase-3.md) | — (спірна — укр. розкладка без `>`/`@`; вирізано з phase-4) |
| [mpv-playback-engine](p3-mpv-playback-engine.md) | P3 | research | draft | L | — | [he-aac-mf-playback](p3-he-aac-mf-playback.md), [hls-stream-support](p3-hls-stream-support.md) (розвилка — може закрити обидва) |
| [he-aac-mf-playback](p3-he-aac-mf-playback.md) | P3 | research | draft | M | — | залежить від рішення mpv-playback-engine |
| [hls-stream-support](p3-hls-stream-support.md) | P3 | idea | draft | L | — | залежить від рішення mpv-playback-engine |
| [lastfm-scrobbling](p3-lastfm-scrobbling.md) | P3 | idea | draft | M | — | — |
| [recording-stats](p3-recording-stats.md) | P3 | idea | draft | S | — | — |
| [context-menu-at-cursor](p3-context-menu-at-cursor.md) | P3 | idea | draft | S | — | — |
| [profile-switch-orphaned-tasks](p3-profile-switch-orphaned-tasks.md) | P3 | idea | draft | M | — | **умовний** — брати лише за реальним тригером |
| [screen-reader-direct-speech](p3-screen-reader-direct-speech.md) | P3 | idea | **blocked** | S | — | тригер-gated, не планувати |
| [player-station-image](p3-player-station-image.md) | P3 | idea | draft | S | — | — |

---

## Виконано

| Запис | Коли | Що лишилось у спадок |
|-------|------|----------------------|
| [command-palette-results-a11y](done/p1-command-palette-results-a11y.md) | 2026-07-23 | `palette_no_results` замість хардкоду; оголошення кількості результатів (у т.ч. «0») через глобальний `LiveAnnouncer`/`useAnnounce` (polite, дебаунс 300 мс) — без окремого регіону в модалці й без змін моделі пунктів. Гілка `feature/command-palette-results-a11y`, TDD. **NVDA-прогін оголошення не проведено** — рекомендовано перед релізом |
| [resume-last-playback](done/p1-resume-last-playback.md) | 2026-07-23 | `PlayerSession.autoplay_on_startup` (per-profile opt-in) + `AutoplayGuard` one-shot + `set_profile_autoplay` IPC + `ProfileSettingsDialog`; злито fast-forward у develop (`26b7f1e`), локально, не запушено. **NVDA-прогін нового діалогу та авто-старту не проведено** — рекомендовано перед релізом |
| [stream-name-trim](done/p0-stream-name-trim.md) | 2026-07-22 | `.trim()` у `add_stream` і `update_stream` (`stream_commands.rs`) — назва потоку більше не зберігається з провідними/завершальними пробілами |
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
   реалізовано 2026-07-18; політику фіналізовано 2026-07-19; **код реалізовано й злито
   2026-07-23** (`26b7f1e`, NVDA-прогін ще не проведено)._ `resume-last-playback` — надбудова над
   `PlayerSession`; **окремого `last_playback.json` немає.** Політика —
   `autoplay_on_startup: bool` (без `always_paused` — дублює cold-start `Ctrl+Shift+K`;
   без `restore`) — нове поле **в `PlayerSession`** → per-profile. Авто-гра — явний opt-in.
2. ✅ **state.json (crash-recovery, done) vs стан відтворення (resume-last-playback)** — _знято (A1)._ Стан
   відтворення живе в `PlayerSession` (профіль), crash — у `data/state.json`; два чітко
   різні сховища, звіряти нема чого.
3. ✅ **autostart ↔ відтворення** — _вирішено (A3 через A1), обидві сторони реалізовано й злито._
   Autostart сам **не** грає; авто-гра ⇔ активний профіль має `autoplay_on_startup = true`
   (поле вводить [resume-last-playback](done/p1-resume-last-playback.md)).
4. **mpv-playback-engine ↔ he-aac-mf-playback / hls-stream-support.** Якщо mpv проходить PoC — винести
   обидва записи в `done/` як зняті. _(A4 — відкрите.)_
