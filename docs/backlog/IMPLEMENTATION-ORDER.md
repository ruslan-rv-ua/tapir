# Порядок реалізації беклогу

Зведений, **обґрунтований залежностями** план черговості для записів у цій папці.
Згенеровано аналізом усіх записів (P1–P3) станом на **2026-06-24**; перенумеровано
**2026-07-18** після винесення виконаних записів у [`done/`](done/).

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
| [playback-toggle-stop-pause](done/p1-playback-toggle-stop-pause.md) | 2026-07-18 | `PlayerSession.last_active` + оживлені `last_stream_id`/`last_file_position`, `playback_control.rs`, cold-start resume — база для #1 і #9 |
| [autostart](done/p2-autostart.md) | 2026-06-25 | winreg-автостарт (`autostart.rs`), CLI `--minimize`; сам **не** грає — авто-гра лише через `startup_playback_mode` (#9) |

---

## Зведена таблиця

| # | Запис | P | Тип | Стан | Зусилля | Залежить від | Розблоковує / зв'язок |
|---|-------|---|-----|------|---------|--------------|----------------------|
| 1 | [resume-file-from-setting](p2-resume-file-from-setting.md) | P2 | покращення | ready | S | playback-toggle ✅ | — |
| 2 | [crash-recovery](p1-crash-recovery.md) | P1 | заплановано | ready | M | Phase 1, scheduler | спільний `state.json` з #9 |
| 3 | [activity-bar-help-button](p1-activity-bar-help-button.md) | P1 | заплановано | ready | S | — | — |
| 4 | [volume-nan-validation](p2-bug-volume-nan-validation.md) | P2 | заплановано | ready | S | Phase 2A | — |
| 5 | [add-stream-probe](p2-add-stream-probe.md) | P2 | ідея | ready | S | Phase 3J | спільна IPC з #6 |
| 6 | [browser-add-probe](p2-browser-add-probe.md) | P2 | ідея | ready | S | Phase 3B/3J, **#5** | — |
| 7 | [streams-ctrlk-empty-hint](p2-streams-ctrlk-empty-hint.md) | P2 | заплановано | ready | S | — | завершує ADR 2026-05-31 §6 |
| 8 | [wishlist-example-patterns](p2-wishlist-example-patterns.md) | P2 | заплановано | ready | S | — | патерн порожн. стану як у #7 |
| 9 | [resume-last-playback](p2-resume-last-playback.md) | P2 | покращення | draft (модель ✅) | M | **надбудова над** playback-toggle ✅ (`PlayerSession`) | autostart ✅ |
| 10 | [log-rotation](p2-log-rotation.md) | P2 | ідея | draft* | S | — | — |
| 11 | [open-song-with-default-app](p2-open-song-with-default-app.md) | P2 | ідея | draft | S | Phase 3C | — |
| 12 | [import-duplicate-metadata-update](p2-import-duplicate-metadata-update.md) | P2 | ідея | draft | S | Phase 3J | — |
| 13 | [full-edit-stream](p2-full-edit-stream.md) | P2 | покращення | ідея | M | F2 edit-режим ✅ | — |
| 14 | [command-palette-phase-3](p2-command-palette-phase-3.md) | P2 | ідея | draft | M | Phase 3C | **розблоковує #19** |
| 15 | [post-processing](p2-post-processing.md) | P2 | ідея | draft | M | Phase 1 | — |
| 16 | [profile-switch-orphaned-tasks](p2-bug-profile-switch-orphaned-tasks.md) | P2 | ідея | draft | M | Phase 3F | **умовний** (тригер нижче) |
| 17 | [mpv-playback-engine](p3-mpv-playback-engine.md) | P3 | дослідити | draft | L | код плеєра | **розвилка для #18** |
| 18 | [he-aac-mf-playback](p3-he-aac-mf-playback.md) · [hls-stream-support](p3-hls-stream-support.md) | P3 | дослідити/ідея | draft | M–L | код плеєра | залежать від рішення #17 |
| 19 | [command-palette-phase-4](p3-command-palette-phase-4.md) | P3 | ідея | **blocked** | M | **#14** | — |
| 20 | [quick-controls-overlay](p3-quick-controls-overlay.md) | P3 | ідея | draft | L | Phase 3A/2A/3F | — |
| 21 | [unwrap-in-tests](p3-unwrap-in-tests.md) | P3 | заплановано | ready | S | — | housekeeping (будь-коли) |
| 22 | [screen-reader-direct-speech](p3-screen-reader-direct-speech.md) | P3 | ідея | **відкладено** | S | — | тригер-gated, не планувати |

\* `log-rotation` має тип `ідея`/`draft`, але секція «Прийняті рішення» вже фіксує підхід
(size-based ротація, дефолти) — фактично готовий до планування.

---

## Хвилі реалізації

### Хвиля 1 — добити «хребет» відтворення (P2, робити першим)

**1. [resume-file-from-setting](p2-resume-file-from-setting.md)** (P2, S, ready)
Хоч і P2 — це **чисто адитивний** follow-up до вже виконаного
[playback-toggle](done/p1-playback-toggle-stop-pause.md) («прочитати прапорець перед seek»,
нульовий ризик переробки). Робити першим, поки контекст cold-start-гілки ще свіжий: гілка
`resume_last` у `playback_control.rs` уже на місці, лишається лише розвилка позиції.

### Хвиля 2 — інфраструктура надійності + швидкі перемоги (P1 + дешеві P2/P3)

Ці записи майже не перетинаються по коду — їх можна вести **паралельно** або
вклинювати між M-задачами.

**2. [crash-recovery](p1-crash-recovery.md)** (P1, M, ready)
Вводить `data/state.json` (`clean_shutdown` + живий снапшот) і **прибирає мертве поле**
`Profile.active_recording_urls`. Стан відтворення (#9) живе в `PlayerSession` профілю
(після A1 окремого `last_playback.json` немає) — два чітко різні сховища, звіряти нема чого.

**3. [activity-bar-help-button](p1-activity-bar-help-button.md)** (P1, S, ready) — тривіальна,
видима a11y-перемога; ідеальна «розминка» або філер між M-задачами.

**4. [volume-nan-validation](p2-bug-volume-nan-validation.md)** (P2, S, ready) — точковий
bugfix межі IPC (`is_finite()` перед `clamp`), з готовими тестами.

**7. [streams-ctrlk-empty-hint](p2-streams-ctrlk-empty-hint.md)** (P2, S, ready) — добудовує
**вже наполовину виконане** рішення ADR 2026-05-31 §6 (кнопку прибрали — компенсуючий
бейдж `Ctrl+K` не додали).

**8. [wishlist-example-patterns](p2-wishlist-example-patterns.md)** (P2, S, ready) — onboarding
для порожнього Wishlist/Ignorelist; усі питання закриті 2026-06-24. Той самий патерн
порожнього стану, що й #7 — робити поряд для консистентності.

**21. [unwrap-in-tests](p3-unwrap-in-tests.md)** (P3, S, ready) — попри мітку P3, це
тривіальна **гігієна тестів** без залежностей; підтягнути будь-коли як housekeeping.

### Хвиля 3 — кластер probe (спільна IPC)

**5. [add-stream-probe](p2-add-stream-probe.md)** (P2, S) — вводить IPC `probe_stream(url)`
(sync-spinner у `AddStreamDialog`).
**6. [browser-add-probe](p2-browser-add-probe.md)** (P2, S) — **реюзає ту саму IPC** (async-тост
у Browser). Робити одразу за #5, щоб не дублювати команду.

### Хвиля 4 — узгодити resume + дрібний polish (P2)

**9. [resume-last-playback](p2-resume-last-playback.md)** (P2, M, draft — модель ✅ узгоджена 2026-06-25)
Надбудова **над виконаним** [playback-toggle](done/p1-playback-toggle-stop-pause.md):
per-profile поле `startup_playback_mode` (`never`/`always_paused`/`always_play`, дефолт
`never`, без `restore`) у `PlayerSession`; **без** окремого `last_playback.json`; авто-гра —
явний opt-in; UI — окремий діалог «Налаштування профілю» з `ProfileContextMenu`; скидання
режиму при дублюванні/експорті. Спадщина вже в коді: дискримінатор `last_active`, seek,
функція `resume_last` — лишається startup-hook і поле режиму.

Далі — незалежні дрібниці (S, будь-який порядок):
**10. [log-rotation](p2-log-rotation.md)** · **11. [open-song-with-default-app](p2-open-song-with-default-app.md)** ·
**12. [import-duplicate-metadata-update](p2-import-duplicate-metadata-update.md)** ·
**13. [full-edit-stream](p2-full-edit-stream.md)** (M — потребує дизайну guard'а для активного запису).

### Хвиля 5 — більші P2-фічі (після стабілізації відтворення)

**14. [command-palette-phase-3](p2-command-palette-phase-3.md)** (P2, M, draft) — розширення
вмісту палітри (станції/пісні/навігація); **розблоковує #19**.
**15. [post-processing](p2-post-processing.md)** (P2, M, draft) — об'ємна фіча, нижча
цінність → у кінець P2.
**16. [profile-switch-orphaned-tasks](p2-bug-profile-switch-orphaned-tasks.md)** (P2, M) —
**умовно**: брати лише якщо реальне використання покаже незафіналізовані файли після
profile switch (сам запис так і каже). Інакше тримати на полиці.

### Хвиля 6 — P3: дослідження-розвилки й відкладене

**17. [mpv-playback-engine](p3-mpv-playback-engine.md)** (P3, дослідити, L) — **робити ПЕРШИМ
серед декодер-записів**. Це розвилка: PoC-gate (HE-AACv2 грає правильно? перший ICY-тайтл
вчасно? розмір DLL? ліцензія FFmpeg?) вирішує долю #18. Запис прямо застерігає «не
починати обидва шляхи паралельно».

**18.** Залежно від результату #17:
- mpv **go** → реалізувати mpv (L), потім **винести в `done/`** записи he-aac-mf і hls як
  зняті рішенням (mpv закриває обидва).
- mpv **no-go** → повернутись до [he-aac-mf-playback](p3-he-aac-mf-playback.md) (діагностувати
  реальний баг на гілці `he-aac-mf`) і/або [hls-stream-support](p3-hls-stream-support.md) окремо.

**19. [command-palette-phase-4](p3-command-palette-phase-4.md)** (P3, blocked) — context-aware
ранжування; знімається з блоку лише після #14.
**20. [quick-controls-overlay](p3-quick-controls-overlay.md)** (P3, L) — велика, низький
пріоритет; відкласти.
**22. [screen-reader-direct-speech](p3-screen-reader-direct-speech.md)** — **відкладено під
сумнівом** із явним тригером повернення; **не планувати**, тримати запис як маркер рішення.

---

## Чому саме так (відхилення від алфавітного порядку README)

- **#1 (P2) веде чергу попри пріоритет.** Формально це P2, але як нульовий-ризик follow-up
  до щойно виконаного playback-toggle його дешевше зробити одразу, поки контекст
  cold-start-гілки відкритий. P1-записи (#2, #3) йдуть одразу за ним.
- **Кластеризація probe (#5→#6)** і **палітра (#14→#19)** — щоб спільну IPC / залежність
  робити суміжно, а не повертатись двічі.
- **mpv (#17) перед he-aac/hls (#18)** — попри те, що he-aac/hls «старіші» записи, mpv —
  це fork-in-the-road, що може зробити їх непотрібними. Дослідити розвилку дешевше, ніж
  паралельно тягнути MF-шлях.

## Перехресні рішення

1. ✅ **resume-last-playback (#9) vs playback-toggle** — _вирішено 2026-06-25 (A1), базу
   реалізовано 2026-07-18._ #9 — надбудова над `PlayerSession`; **окремого
   `last_playback.json` немає.** Режим `startup_playback_mode`
   (`never`/`always_paused`/`always_play`, без `restore`) — нове поле **в `PlayerSession`**
   → per-profile. Авто-гра — явний opt-in.
2. ✅ **state.json (#2) vs стан відтворення (#9)** — _знято (A1)._ Стан відтворення живе в
   `PlayerSession` (профіль), crash — у `state.json`; два чітко різні сховища, звіряти нема чого.
3. ✅ **autostart ↔ відтворення** — _вирішено (A3 через A1), обидві сторони реалізовано._
   Autostart сам **не** грає; авто-гра ⇔ активний профіль має `startup_playback_mode = always_play`
   (поле вводить #9).
4. **mpv (#17) ↔ he-aac-mf / hls (#18).** Якщо mpv проходить PoC — винести обидва записи в `done/`
   як зняті. _(A4 — відкрите.)_

## Готовність-сигнал (для вибору наступного)

- **Готові до коду зараз** (`ready`/«рішення прийняті»): #1, #2, #3, #4, #5, #6, #7, #8, #10, #21.
- **Модель узгоджена, база в коді** (промпт уже імплементаційний): #9 (A1 закрито 2026-06-25;
  `PlayerSession`-спадщина злита 2026-07-18).
- **Потребують grooming-пасу** (тип `ідея`/`draft`, є відкриті питання): #11, #12, #13,
  #14, #15, #16 — їхній промпт у записі досі «лише обговорення»; спершу довести до
  `заплановано`, тоді кодити.
- **Дослідження/розвилка**: #17, #18.
- **Заблоковано/відкладено**: #19 (чекає #14), #22 (тригер-gated).
