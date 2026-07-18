# Порядок реалізації беклогу

Зведений, **обґрунтований залежностями** план черговості для записів у цій папці.
Згенеровано аналізом усіх записів (P1–P3) станом на **2026-06-24**; перенумеровано
**2026-07-18** після винесення виконаних записів у [`done/`](done/)
(`playback-toggle-stop-pause`, `resume-file-from-setting`, `crash-recovery`).

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
| [crash-recovery](done/p1-crash-recovery.md) | 2026-07-18 | `data/state.json` (`cleanShutdown` + `activeRecordings[{streamId, url?}]`), снапшот-писар (`Notify` + 30с interval + 500мс debounce, `crash_recovery.rs`), auto-resume в setup-хуку, deferred подія `crash-resume`, `useCrashResumeFeedback` (NVDA polite + toast) — `Profile.active_recording_urls` прибрано |
| [resume-file-from-setting](done/p2-resume-file-from-setting.md) | 2026-07-18 | `resume_file_from` у `GlobalSettings`, `plan_file_resume`/`emit_resuming` у `playback_control.rs`, NVDA-анонс позиції — нульового виносу немає, чисто адитивно |
| [playback-toggle-stop-pause](done/p1-playback-toggle-stop-pause.md) | 2026-07-18 | `PlayerSession.last_active` + оживлені `last_stream_id`/`last_file_position`, `playback_control.rs`, cold-start resume — база для #7 (нижче) |
| [autostart](done/p2-autostart.md) | 2026-06-25 | winreg-автостарт (`autostart.rs`), CLI `--minimize`; сам **не** грає — авто-гра лише через `startup_playback_mode` (#7) |

---

## Зведена таблиця

| # | Запис | P | Тип | Стан | Зусилля | Залежить від | Розблоковує / зв'язок |
|---|-------|---|-----|------|---------|--------------|----------------------|
| 1 | [activity-bar-help-button](p1-activity-bar-help-button.md) | P1 | заплановано | ready | S | — | — |
| 2 | [volume-nan-validation](p2-bug-volume-nan-validation.md) | P2 | заплановано | ready | S | Phase 2A | — |
| 3 | [add-stream-probe](p2-add-stream-probe.md) | P2 | ідея | ready | S | Phase 3J | спільна IPC з #4 |
| 4 | [browser-add-probe](p2-browser-add-probe.md) | P2 | ідея | ready | S | Phase 3B/3J, **#3** | — |
| 5 | [streams-ctrlk-empty-hint](p2-streams-ctrlk-empty-hint.md) | P2 | заплановано | ready | S | — | завершує ADR 2026-05-31 §6 |
| 6 | [wishlist-example-patterns](p2-wishlist-example-patterns.md) | P2 | заплановано | ready | S | — | патерн порожн. стану як у #5 |
| 7 | [resume-last-playback](p2-resume-last-playback.md) | P2 | покращення | draft (модель ✅) | M | **надбудова над** playback-toggle ✅ (`PlayerSession`) | autostart ✅ |
| 8 | [log-rotation](p2-log-rotation.md) | P2 | ідея | draft* | S | — | — |
| 9 | [open-song-with-default-app](p2-open-song-with-default-app.md) | P2 | ідея | draft | S | Phase 3C | — |
| 10 | [import-duplicate-metadata-update](p2-import-duplicate-metadata-update.md) | P2 | ідея | draft | S | Phase 3J | — |
| 11 | [full-edit-stream](p2-full-edit-stream.md) | P2 | покращення | ідея | M | F2 edit-режим ✅ | — |
| 12 | [command-palette-phase-3](p2-command-palette-phase-3.md) | P2 | ідея | draft | M | Phase 3C | **розблоковує #17** |
| 13 | [post-processing](p2-post-processing.md) | P2 | ідея | draft | M | Phase 1 | — |
| 14 | [profile-switch-orphaned-tasks](p2-bug-profile-switch-orphaned-tasks.md) | P2 | ідея | draft | M | Phase 3F | **умовний** (тригер нижче) |
| 15 | [mpv-playback-engine](p3-mpv-playback-engine.md) | P3 | дослідити | draft | L | код плеєра | **розвилка для #16** |
| 16 | [he-aac-mf-playback](p3-he-aac-mf-playback.md) · [hls-stream-support](p3-hls-stream-support.md) | P3 | дослідити/ідея | draft | M–L | код плеєра | залежать від рішення #15 |
| 17 | [command-palette-phase-4](p3-command-palette-phase-4.md) | P3 | ідея | **blocked** | M | **#12** | — |
| 18 | [quick-controls-overlay](p3-quick-controls-overlay.md) | P3 | ідея | draft | L | Phase 3A/2A/3F | — |
| 19 | [unwrap-in-tests](p3-unwrap-in-tests.md) | P3 | заплановано | ready | S | — | housekeeping (будь-коли) |
| 20 | [screen-reader-direct-speech](p3-screen-reader-direct-speech.md) | P3 | ідея | **відкладено** | S | — | тригер-gated, не планувати |

\* `log-rotation` має тип `ідея`/`draft`, але секція «Прийняті рішення» вже фіксує підхід
(size-based ротація, дефолти) — фактично готовий до планування.

---

## Хвилі реалізації

### Хвиля 1 — інфраструктура надійності + швидкі перемоги (P1 + дешеві P2/P3)

Ці записи майже не перетинаються по коду — їх можна вести **паралельно** або
вклинювати між M-задачами.

**1. [activity-bar-help-button](p1-activity-bar-help-button.md)** (P1, S, ready) — тривіальна,
видима a11y-перемога; ідеальна «розминка» або філер між M-задачами.

**2. [volume-nan-validation](p2-bug-volume-nan-validation.md)** (P2, S, ready) — точковий
bugfix межі IPC (`is_finite()` перед `clamp`), з готовими тестами.

**5. [streams-ctrlk-empty-hint](p2-streams-ctrlk-empty-hint.md)** (P2, S, ready) — добудовує
**вже наполовину виконане** рішення ADR 2026-05-31 §6 (кнопку прибрали — компенсуючий
бейдж `Ctrl+K` не додали).

**6. [wishlist-example-patterns](p2-wishlist-example-patterns.md)** (P2, S, ready) — onboarding
для порожнього Wishlist/Ignorelist; усі питання закриті 2026-06-24. Той самий патерн
порожнього стану, що й #5 — робити поряд для консистентності.

**19. [unwrap-in-tests](p3-unwrap-in-tests.md)** (P3, S, ready) — попри мітку P3, це
тривіальна **гігієна тестів** без залежностей; підтягнути будь-коли як housekeeping.

### Хвиля 2 — кластер probe (спільна IPC)

**3. [add-stream-probe](p2-add-stream-probe.md)** (P2, S) — вводить IPC `probe_stream(url)`
(sync-spinner у `AddStreamDialog`).
**4. [browser-add-probe](p2-browser-add-probe.md)** (P2, S) — **реюзає ту саму IPC** (async-тост
у Browser). Робити одразу за #3, щоб не дублювати команду.

### Хвиля 3 — узгодити resume + дрібний polish (P2)

**7. [resume-last-playback](p2-resume-last-playback.md)** (P2, M, draft — модель ✅ узгоджена 2026-06-25)
Надбудова **над виконаним** [playback-toggle](done/p1-playback-toggle-stop-pause.md): per-profile
поле `startup_playback_mode` (`never`/`always_paused`/`always_play`, дефолт `never`, без
`restore`) у `PlayerSession`; **без** окремого `last_playback.json`; авто-гра — явний opt-in;
UI — окремий діалог «Налаштування профілю» з `ProfileContextMenu`; скидання режиму при
дублюванні/експорті. Спадщина вже в коді: дискримінатор `last_active`, seek, функція
`resume_last` (і тепер `resume_file_from` з cold-start-де-ризиком) — лишається startup-hook
і поле режиму.

Далі — незалежні дрібниці (S, будь-який порядок):
**8. [log-rotation](p2-log-rotation.md)** · **9. [open-song-with-default-app](p2-open-song-with-default-app.md)** ·
**10. [import-duplicate-metadata-update](p2-import-duplicate-metadata-update.md)** ·
**11. [full-edit-stream](p2-full-edit-stream.md)** (M — потребує дизайну guard'а для активного запису).

### Хвиля 4 — більші P2-фічі (після стабілізації відтворення)

**12. [command-palette-phase-3](p2-command-palette-phase-3.md)** (P2, M, draft) — розширення
вмісту палітри (станції/пісні/навігація); **розблоковує #17**.
**13. [post-processing](p2-post-processing.md)** (P2, M, draft) — об'ємна фіча, нижча
цінність → у кінець P2.
**14. [profile-switch-orphaned-tasks](p2-bug-profile-switch-orphaned-tasks.md)** (P2, M) —
**умовно**: брати лише якщо реальне використання покаже незафіналізовані файли після
profile switch (сам запис так і каже). Інакше тримати на полиці.

### Хвиля 5 — P3: дослідження-розвилки й відкладене

**15. [mpv-playback-engine](p3-mpv-playback-engine.md)** (P3, дослідити, L) — **робити ПЕРШИМ
серед декодер-записів**. Це розвилка: PoC-gate (HE-AACv2 грає правильно? перший ICY-тайтл
вчасно? розмір DLL? ліцензія FFmpeg?) вирішує долю #16. Запис прямо застерігає «не
починати обидва шляхи паралельно».

**16.** Залежно від результату #15:
- mpv **go** → реалізувати mpv (L), потім **винести в `done/`** записи he-aac-mf і hls як
  зняті рішенням (mpv закриває обидва).
- mpv **no-go** → повернутись до [he-aac-mf-playback](p3-he-aac-mf-playback.md) (діагностувати
  реальний баг на гілці `he-aac-mf`) і/або [hls-stream-support](p3-hls-stream-support.md) окремо.

**17. [command-palette-phase-4](p3-command-palette-phase-4.md)** (P3, blocked) — context-aware
ранжування; знімається з блоку лише після #12.
**18. [quick-controls-overlay](p3-quick-controls-overlay.md)** (P3, L) — велика, низький
пріоритет; відкласти.
**20. [screen-reader-direct-speech](p3-screen-reader-direct-speech.md)** — **відкладено під
сумнівом** із явним тригером повернення; **не планувати**, тримати запис як маркер рішення.

---

## Чому саме так (відхилення від алфавітного порядку README)

- **Кластеризація probe (#3→#4)** і **палітра (#12→#17)** — щоб спільну IPC / залежність
  робити суміжно, а не повертатись двічі.
- **mpv (#15) перед he-aac/hls (#16)** — попри те, що he-aac/hls «старіші» записи, mpv —
  це fork-in-the-road, що може зробити їх непотрібними. Дослідити розвилку дешевше, ніж
  паралельно тягнути MF-шлях.

## Перехресні рішення

1. ✅ **resume-last-playback (#7) vs playback-toggle** — _вирішено 2026-06-25 (A1), базу
   реалізовано 2026-07-18._ #7 — надбудова над `PlayerSession`; **окремого
   `last_playback.json` немає.** Режим `startup_playback_mode`
   (`never`/`always_paused`/`always_play`, без `restore`) — нове поле **в `PlayerSession`**
   → per-profile. Авто-гра — явний opt-in.
2. ✅ **state.json (crash-recovery, done) vs стан відтворення (#7)** — _знято (A1)._ Стан
   відтворення живе в `PlayerSession` (профіль), crash — у `data/state.json`; два чітко
   різні сховища, звіряти нема чого.
3. ✅ **autostart ↔ відтворення** — _вирішено (A3 через A1), обидві сторони реалізовано._
   Autostart сам **не** грає; авто-гра ⇔ активний профіль має `startup_playback_mode = always_play`
   (поле вводить #7).
4. **mpv (#15) ↔ he-aac-mf / hls (#16).** Якщо mpv проходить PoC — винести обидва записи в `done/`
   як зняті. _(A4 — відкрите.)_

## Готовність-сигнал (для вибору наступного)

- **Готові до коду зараз** (`ready`/«рішення прийняті»): #1, #2, #3, #4, #5, #6, #8, #19.
- **Модель узгоджена, база в коді** (промпт уже імплементаційний): #7 (A1 закрито 2026-06-25;
  `PlayerSession`-спадщина злита 2026-07-18, включно з `resume_file_from`).
- **Потребують grooming-пасу** (тип `ідея`/`draft`, є відкриті питання): #9, #10, #11,
  #12, #13, #14 — їхній промпт у записі досі «лише обговорення»; спершу довести до
  `заплановано`, тоді кодити.
- **Дослідження/розвилка**: #15, #16.
- **Заблоковано/відкладено**: #17 (чекає #12), #20 (тригер-gated).
