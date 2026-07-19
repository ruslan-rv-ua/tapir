# Порядок реалізації беклогу

Зведений, **обґрунтований залежностями** план черговості для записів у цій папці.
Згенеровано аналізом усіх записів (P1–P3) станом на **2026-06-24**; перенумеровано
**2026-07-19** після винесення виконаних записів у [`done/`](done/)
(`playback-toggle-stop-pause`, `resume-file-from-setting`, `crash-recovery`,
`volume-nan-validation`, `add-stream-probe`, `browser-add-probe`,
`activity-bar-help-button`, `streams-ctrlk-empty-hint`, `wishlist-example-patterns`).

> Цей файл — **навігаційна карта**, не запис беклогу (тому без `p<рівень>-`-префікса).
> Первинна вісь — пріоритет (`p1` → `p2` → `p3`), як у [README.md](README.md). Усередині
> рівня порядок переставлено за **залежностями, готовністю (`ready` vs `draft`) і
> важелем** (скільки інших записів розблоковує). Де я відхиляюсь від простого
> алфавітного порядку README — пояснено в «Чому саме так».
>
> **Номери `#N` не стабільні:** коли запис виконано, його рядок звідси зникає, а решта
> перенумеровується. Посилайся на записи **за слагом**, номер — лише позиція в черзі.

---

## Виконано (винесено з черги)

| Запис | Коли | Що лишилось у спадок |
|-------|------|----------------------|
| [wishlist-example-patterns](done/p2-wishlist-example-patterns.md) | 2026-07-19 | CTA «Додати приклад» у власній зоні `wishlist-empty` (`WishlistPanel.tsx`) — не в `PatternList`'s `emptyExtra` (той варіант виявився keyboard-unreachable, rev R1); фіксований масив `examplePatterns.ts`; ключі `wishlist_add_example`/`wishlist_examples_adding`/`wishlist_examples_added`/`wishlist_examples_failed`. Застосувало патерн `streams-ctrlk-empty-hint` |
| [streams-ctrlk-empty-hint](done/p2-streams-ctrlk-empty-hint.md) | 2026-07-19 | бейдж «Команди — Ctrl+K» у порожньому стані `StreamsPanel` (не Tab-стоп); константа `PALETTE_COMBO` читає комбінацію з `SHORTCUTS`, тож бейдж не розходиться з F1-довідкою; ключ `streams_empty_palette_hint`. Завершує ADR 2026-05-31 §6 (S3) — патерн для `wishlist-example-patterns` |
| [browser-add-probe](done/p2-browser-add-probe.md) | 2026-07-19 | подія `browser-station-probe-result` + `useBrowserProbeFeedback` (App-wide, озвучує лише невдачі/підсумок); `spawn_probe_added()` у `browser_commands.rs` — detached probe після збереження, `buffer_unordered(5)` |
| [add-stream-probe](done/p2-add-stream-probe.md) | 2026-07-19 | IPC `probe_stream(url) -> { ok, error }` + `probe_once()` у `stream_io_commands.rs` (спільний 5-с `SINGLE_PROBE_TIMEOUT`); sync-spinner + «Все одно додати» в `AddStreamDialog` |
| [volume-nan-validation](done/p2-bug-volume-nan-validation.md) | 2026-07-19 | хелпер `sanitize_volume()` у `player/engine.rs` — єдина точка санітизації гучності на межах IPC (`set_volume`) і профілю (`PlayerEngine::new`); non-finite → `0.0` |
| [activity-bar-help-button](done/p1-activity-bar-help-button.md) | 2026-07-19 | кнопка Help у footer `ActivityBar.tsx` (над Settings, спільний атом `$helpOpen` з `F1`); roving-order бару тепер 8 елементів |
| [crash-recovery](done/p1-crash-recovery.md) | 2026-07-18 | `data/state.json` (`cleanShutdown` + `activeRecordings[{streamId, url?}]`), снапшот-писар (`Notify` + 30с interval + 500мс debounce, `crash_recovery.rs`), auto-resume в setup-хуку, deferred подія `crash-resume`, `useCrashResumeFeedback` (NVDA polite + toast) — `Profile.active_recording_urls` прибрано |
| [resume-file-from-setting](done/p2-resume-file-from-setting.md) | 2026-07-18 | `resume_file_from` у `GlobalSettings`, `plan_file_resume`/`emit_resuming` у `playback_control.rs`, NVDA-анонс позиції — нульового виносу немає, чисто адитивно |
| [playback-toggle-stop-pause](done/p1-playback-toggle-stop-pause.md) | 2026-07-18 | `PlayerSession.last_active` + оживлені `last_stream_id`/`last_file_position`, `playback_control.rs`, cold-start resume — база для `resume-last-playback` (нижче) |
| [autostart](done/p2-autostart.md) | 2026-06-25 | winreg-автостарт (`autostart.rs`), CLI `--minimize`; сам **не** грає — авто-гра лише через `autoplay_on_startup` (`resume-last-playback`) |

---

## Зведена таблиця

| # | Запис | P | Тип | Стан | Зусилля | Залежить від | Розблоковує / зв'язок |
|---|-------|---|-----|------|---------|--------------|----------------------|
| 1 | [resume-last-playback](p2-resume-last-playback.md) | P2 | покращення | ready (2026-07-19) | M | **надбудова над** playback-toggle ✅ (`resume_last`) | autostart ✅ |
| 2 | [log-rotation](p2-log-rotation.md) | P2 | ідея | draft* | S | — | — |
| 3 | [open-song-with-default-app](p2-open-song-with-default-app.md) | P2 | ідея | draft | S | Phase 3C | — |
| 4 | [import-duplicate-metadata-update](p2-import-duplicate-metadata-update.md) | P2 | ідея | draft | S | Phase 3J | — |
| 5 | [full-edit-stream](p2-full-edit-stream.md) | P2 | покращення | ідея | M | F2 edit-режим ✅ | — |
| 6 | [streams-empty-focus-audit](p2-streams-empty-focus-audit.md) | P2 | дослідити | ready | S | — | спадок wishlist-example-patterns ✅ |
| 7 | [wishlist-stale-list-ref](p2-wishlist-stale-list-ref.md) | P2 | дослідити | ready | S | — | знахідка follow-up-хвилі wishlist-example-patterns ✅; якщо відтвориться — кандидат у P1 |
| 8 | [command-palette-phase-3](p2-command-palette-phase-3.md) | P2 | ідея | draft | M | Phase 3C | **розблоковує #13** |
| 9 | [post-processing](p2-post-processing.md) | P2 | ідея | draft | M | Phase 1 | — |
| 10 | [profile-switch-orphaned-tasks](p2-bug-profile-switch-orphaned-tasks.md) | P2 | ідея | draft | M | Phase 3F | **умовний** (тригер нижче) |
| 11 | [mpv-playback-engine](p3-mpv-playback-engine.md) | P3 | дослідити | draft | L | код плеєра | **розвилка для #12** |
| 12 | [he-aac-mf-playback](p3-he-aac-mf-playback.md) · [hls-stream-support](p3-hls-stream-support.md) | P3 | дослідити/ідея | draft | M–L | код плеєра | залежать від рішення #11 |
| 13 | [command-palette-phase-4](p3-command-palette-phase-4.md) | P3 | ідея | **blocked** | M | **#8** | — |
| 14 | [quick-controls-overlay](p3-quick-controls-overlay.md) | P3 | ідея | draft | L | Phase 3A/2A/3F | — |
| 15 | [unwrap-in-tests](p3-unwrap-in-tests.md) | P3 | заплановано | ready | S | — | housekeeping (будь-коли) |
| 16 | [screen-reader-direct-speech](p3-screen-reader-direct-speech.md) | P3 | ідея | **відкладено** | S | — | тригер-gated, не планувати |

\* `log-rotation` має тип `ідея`/`draft`, але секція «Прийняті рішення» вже фіксує підхід
(size-based ротація, дефолти) — фактично готовий до планування.

---

## Хвилі реалізації

### Хвиля 0 — швидка перемога ✅ виконано 2026-07-19

**[streams-ctrlk-empty-hint](done/p2-streams-ctrlk-empty-hint.md)** — добудувало
**наполовину виконане** рішення ADR 2026-05-31 §6 (кнопку прибрали — компенсуючий
бейдж `Ctrl+K` не додали). Деталі спадщини — у таблиці «Виконано» вище.

### Хвиля 1 — швидкі перемоги (P2/P3) + housekeeping ✅ частково виконано 2026-07-19

[wishlist-example-patterns](done/p2-wishlist-example-patterns.md) — onboarding для порожнього
Wishlist/Ignorelist, реалізовано й винесено в `done/`. Деталі спадщини — у таблиці «Виконано»
вище.

**15. [unwrap-in-tests](p3-unwrap-in-tests.md)** (P3, S, ready) — попри мітку P3, це
тривіальна **гігієна тестів** без залежностей; підтягнути будь-коли як housekeeping.

### Хвиля 2 — кластер probe (спільна IPC) ✅ виконано 2026-07-19

Обидва записи винесено в `done/`: [add-stream-probe](done/p2-add-stream-probe.md) ввів
`probe_stream` / `probe_once` (5-с `SINGLE_PROBE_TIMEOUT`) і sync-spinner у
`AddStreamDialog`; [browser-add-probe](done/p2-browser-add-probe.md) реюзнув той самий
`probe_once` у фоновому `spawn_probe_added()` з подією
`browser-station-probe-result`. Кластеризація спрацювала — IPC писали один раз.

### Хвиля 3 — узгодити resume + дрібний polish (P2)

**1. [resume-last-playback](p2-resume-last-playback.md)** (P2, M, ready — рішення фіналізовано 2026-07-19)
Надбудова **над виконаним** [playback-toggle](done/p1-playback-toggle-stop-pause.md): per-profile
поле `autoplay_on_startup: bool` (дефолт `false`; `always_paused` викинуто — дублює
cold-start `Ctrl+Shift+K`; без `restore`) у `PlayerSession`; **без** окремого
`last_playback.json`; авто-гра — явний opt-in; тригер — `frontend_ready` (гейт-патерн
`StartupPlan`), spawn-нутий реюз `resume_last`; CLI `--play`/`--stop-playback` скасовує
авто-гру; UI — окремий діалог «Налаштування профілю» (чекбокс) з `ProfileContextMenu`;
скидання поля + resume-трійки при дублюванні/експорті. Спадщина вже в коді: `last_active`,
seek, `resume_last`, `resume_file_from` — лишається поле, IPC, діалог і hook у
`frontend_ready`.

Далі — незалежні дрібниці (S, будь-який порядок):
**2. [log-rotation](p2-log-rotation.md)** · **3. [open-song-with-default-app](p2-open-song-with-default-app.md)** ·
**4. [import-duplicate-metadata-update](p2-import-duplicate-metadata-update.md)** ·
**5. [full-edit-stream](p2-full-edit-stream.md)** (M — потребує дизайну guard'а для активного запису) ·
**6. [streams-empty-focus-audit](p2-streams-empty-focus-audit.md)** (S, ready, дослідити —
спадок `wishlist-example-patterns`: чи орфанить фокус видалення останнього потоку в Streams;
якщо так — фікс за зразком `223fadb`) ·
**7. [wishlist-stale-list-ref](p2-wishlist-stale-list-ref.md)** (S, ready, дослідити —
чи мертві тулбарний bulk-delete і F6-зона списку на перемкнутій вкладці; якщо
відтвориться в реальному застосунку — кандидат у P1).

### Хвиля 4 — більші P2-фічі (після стабілізації відтворення)

**8. [command-palette-phase-3](p2-command-palette-phase-3.md)** (P2, M, draft) — розширення
вмісту палітри (станції/пісні/навігація); **розблоковує #13**.
**9. [post-processing](p2-post-processing.md)** (P2, M, draft) — об'ємна фіча, нижча
цінність → у кінець P2.
**10. [profile-switch-orphaned-tasks](p2-bug-profile-switch-orphaned-tasks.md)** (P2, M) —
**умовно**: брати лише якщо реальне використання покаже незафіналізовані файли після
profile switch (сам запис так і каже). Інакше тримати на полиці.

### Хвиля 5 — P3: дослідження-розвилки й відкладене

**11. [mpv-playback-engine](p3-mpv-playback-engine.md)** (P3, дослідити, L) — **робити ПЕРШИМ
серед декодер-записів**. Це розвилка: PoC-gate (HE-AACv2 грає правильно? перший ICY-тайтл
вчасно? розмір DLL? ліцензія FFmpeg?) вирішує долю #12. Запис прямо застерігає «не
починати обидва шляхи паралельно».

**12.** Залежно від результату #11:
- mpv **go** → реалізувати mpv (L), потім **винести в `done/`** записи he-aac-mf і hls як
  зняті рішенням (mpv закриває обидва).
- mpv **no-go** → повернутись до [he-aac-mf-playback](p3-he-aac-mf-playback.md) (діагностувати
  реальний баг на гілці `he-aac-mf`) і/або [hls-stream-support](p3-hls-stream-support.md) окремо.

**13. [command-palette-phase-4](p3-command-palette-phase-4.md)** (P3, blocked) — context-aware
ранжування; знімається з блоку лише після #8.
**14. [quick-controls-overlay](p3-quick-controls-overlay.md)** (P3, L) — велика, низький
пріоритет; відкласти.
**16. [screen-reader-direct-speech](p3-screen-reader-direct-speech.md)** — **відкладено під
сумнівом** із явним тригером повернення; **не планувати**, тримати запис як маркер рішення.

---

## Чому саме так (відхилення від алфавітного порядку README)

- **Кластеризація probe** (обидва записи вже в `done/`) і **палітра (#8→#13)** — щоб спільну
  IPC / залежність робити суміжно, а не повертатись двічі. Probe-кластер це підтвердив:
  друга задача звелася до виклику вже наявного `probe_once`.
- **mpv (#11) перед he-aac/hls (#12)** — попри те, що he-aac/hls «старіші» записи, mpv —
  це fork-in-the-road, що може зробити їх непотрібними. Дослідити розвилку дешевше, ніж
  паралельно тягнути MF-шлях.

## Перехресні рішення

1. ✅ **resume-last-playback (#1) vs playback-toggle** — _вирішено 2026-06-25 (A1), базу
   реалізовано 2026-07-18; політику фіналізовано 2026-07-19._ #1 — надбудова над
   `PlayerSession`; **окремого `last_playback.json` немає.** Політика —
   `autoplay_on_startup: bool` (без `always_paused` — дублює cold-start `Ctrl+Shift+K`;
   без `restore`) — нове поле **в `PlayerSession`** → per-profile. Авто-гра — явний opt-in.
2. ✅ **state.json (crash-recovery, done) vs стан відтворення (#1)** — _знято (A1)._ Стан
   відтворення живе в `PlayerSession` (профіль), crash — у `data/state.json`; два чітко
   різні сховища, звіряти нема чого.
3. ✅ **autostart ↔ відтворення** — _вирішено (A3 через A1), обидві сторони реалізовано._
   Autostart сам **не** грає; авто-гра ⇔ активний профіль має `autoplay_on_startup = true`
   (поле вводить #1).
4. **mpv (#11) ↔ he-aac-mf / hls (#12).** Якщо mpv проходить PoC — винести обидва записи в `done/`
   як зняті. _(A4 — відкрите.)_

## Готовність-сигнал (для вибору наступного)

- **Готові до коду зараз** (`ready`/«рішення прийняті»): #2, #6, #7, #15.
- **Модель узгоджена, база в коді** (промпт уже імплементаційний): #1 (A1 закрито 2026-06-25;
  `PlayerSession`-спадщина злита 2026-07-18, включно з `resume_file_from`).
- **Потребують grooming-пасу** (тип `ідея`/`draft`, є відкриті питання): #3, #4, #5,
  #8, #9, #10 — їхній промпт у записі досі «лише обговорення»; спершу довести до
  `заплановано`, тоді кодити.
- **Дослідження/розвилка**: #6, #7, #11, #12.
- **Заблоковано/відкладено**: #13 (чекає #8), #16 (тригер-gated).
