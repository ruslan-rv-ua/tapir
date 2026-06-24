# Порядок реалізації беклогу

Зведений, **обґрунтований залежностями** план черговості для записів у цій папці.
Згенеровано аналізом усіх записів (P1–P3) станом на **2026-06-24**.

> Цей файл — **навігаційна карта**, не запис беклогу (тому без `p<рівень>-`-префікса).
> Первинна вісь — пріоритет (`p1` → `p2` → `p3`), як у [README.md](README.md). Усередині
> рівня порядок переставлено за **залежностями, готовністю (`ready` vs `draft`) і
> важелем** (скільки інших записів розблоковує). Де я відхиляюсь від простого
> алфавітного порядку README — пояснено в «Чому саме так».

---

## Зведена таблиця

| # | Запис | P | Тип | Стан | Зусилля | Залежить від | Розблоковує / зв'язок |
|---|-------|---|-----|------|---------|--------------|----------------------|
| 1 | [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md) | P1 | покращення | ready | M | код плеєра/профілю | #2, #10, #15 |
| 2 | [resume-file-from-setting](p2-resume-file-from-setting.md) | P2 | покращення | ready | S | **#1** | — |
| 3 | [crash-recovery](p1-crash-recovery.md) | P1 | заплановано | ready | M | Phase 1, scheduler | спільний `state.json` з #10 |
| 4 | [activity-bar-help-button](p1-activity-bar-help-button.md) | P1 | заплановано | ready | S | — | — |
| 5 | [volume-nan-validation](p2-bug-volume-nan-validation.md) | P2 | заплановано | ready | S | Phase 2A | — |
| 6 | [add-stream-probe](p2-add-stream-probe.md) | P2 | ідея | ready | S | Phase 3J | спільна IPC з #7 |
| 7 | [browser-add-probe](p2-browser-add-probe.md) | P2 | ідея | ready | S | Phase 3B/3J, **#6** | — |
| 8 | [streams-ctrlk-empty-hint](p2-streams-ctrlk-empty-hint.md) | P2 | заплановано | ready | S | — | завершує ADR 2026-05-31 §6 |
| 9 | [wishlist-example-patterns](p2-wishlist-example-patterns.md) | P2 | заплановано | ready | S | — | патерн порожн. стану як у #8 |
| 10 | [resume-last-playback](p2-resume-last-playback.md) | P2 | ідея | draft | S | Phase 2A/2C, **узгодити з #1, #3** | autostart (#15) |
| 11 | [log-rotation](p2-log-rotation.md) | P2 | ідея | draft* | S | — | — |
| 12 | [open-song-with-default-app](p2-open-song-with-default-app.md) | P2 | ідея | draft | S | Phase 3C | — |
| 13 | [import-duplicate-metadata-update](p2-import-duplicate-metadata-update.md) | P2 | ідея | draft | S | Phase 3J | — |
| 14 | [full-edit-stream](p2-full-edit-stream.md) | P2 | покращення | ідея | M | F2 edit-режим ✅ | — |
| 15 | [autostart](p2-autostart.md) | P2 | ідея | draft | S | CLI `--minimize` (3G), узгодити з #1/#10 | — |
| 16 | [command-palette-phase-3](p2-command-palette-phase-3.md) | P2 | ідея | draft | M | Phase 3C | **розблоковує #21** |
| 17 | [post-processing](p2-post-processing.md) | P2 | ідея | draft | M | Phase 1 | — |
| 18 | [profile-switch-orphaned-tasks](p2-bug-profile-switch-orphaned-tasks.md) | P2 | ідея | draft | M | Phase 3F | **умовний** (тригер нижче) |
| 19 | [mpv-playback-engine](p3-mpv-playback-engine.md) | P3 | дослідити | draft | L | код плеєра | **розвилка для #20** |
| 20 | [he-aac-mf-playback](p3-he-aac-mf-playback.md) · [hls-stream-support](p3-hls-stream-support.md) | P3 | дослідити/ідея | draft | M–L | код плеєра | залежать від рішення #19 |
| 21 | [command-palette-phase-4](p3-command-palette-phase-4.md) | P3 | ідея | **blocked** | M | **#16** | — |
| 22 | [quick-controls-overlay](p3-quick-controls-overlay.md) | P3 | ідея | draft | L | Phase 3A/2A/3F | — |
| 23 | [unwrap-in-tests](p3-unwrap-in-tests.md) | P3 | заплановано | ready | S | — | housekeeping (будь-коли) |
| 24 | [screen-reader-direct-speech](p3-screen-reader-direct-speech.md) | P3 | ідея | **відкладено** | S | — | тригер-gated, не планувати |

\* `log-rotation` має тип `ідея`/`draft`, але секція «Прийняті рішення» вже фіксує підхід
(size-based ротація, дефолти) — фактично готовий до планування.

---

## Хвилі реалізації

### Хвиля 1 — «хребет» відтворення (P1, робити першим)

**1. [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md)** (P1, M, ready)
Найбільший важіль у всьому беклозі. Оживляє мертві поля `PlayerSession.last_stream_id` /
`last_file_position`, додає дискримінатор «останнє активне джерело», метод `stop`,
семантику stop-для-потоку/pause-для-файлу й NVDA-анонси. Від нього **прямо** залежить #2,
з ним **перетинається** #10 і його мусить **враховувати** #15 (autostart не авто-грає).
Зробивши його першим, розблоковуємо найбільше нижчого по стеку.

**2. [resume-file-from-setting](p2-resume-file-from-setting.md)** (P2, S, ready)
Хоч і P2 — це **чисто адитивний** follow-up до #1 («прочитати прапорець перед seek»,
нульовий ризик переробки). Логічно йде впритул за #1, поки контекст cold-start-гілки
свіжий. Передчасний без #1.

### Хвиля 2 — інфраструктура надійності + швидкі перемоги (P1 + дешеві P2/P3)

Ці записи майже не перетинаються по коду — їх можна вести **паралельно** або
вклинювати між M-задачами хвилі 1.

**3. [crash-recovery](p1-crash-recovery.md)** (P1, M, ready)
Вводить `data/state.json` (`clean_shutdown` + живий снапшот) і **прибирає мертве поле**
`Profile.active_recording_urls`. Узгодити з #10, який кладе поруч окремий
`last_playback.json` (свідомо **різні** файли — звірити структури).

**4. [activity-bar-help-button](p1-activity-bar-help-button.md)** (P1, S, ready) — тривіальна,
видима a11y-перемога; ідеальна «розминка» або філер між M-задачами.

**5. [volume-nan-validation](p2-bug-volume-nan-validation.md)** (P2, S, ready) — точковий
bugfix межі IPC (`is_finite()` перед `clamp`), з готовими тестами.

**8. [streams-ctrlk-empty-hint](p2-streams-ctrlk-empty-hint.md)** (P2, S, ready) — добудовує
**вже наполовину виконане** рішення ADR 2026-05-31 §6 (кнопку прибрали — компенсуючий
бейдж `Ctrl+K` не додали).

**9. [wishlist-example-patterns](p2-wishlist-example-patterns.md)** (P2, S, ready) — onboarding
для порожнього Wishlist/Ignorelist; усі питання закриті 2026-06-24. Той самий патерн
порожнього стану, що й #8 — робити поряд для консистентності.

**23. [unwrap-in-tests](p3-unwrap-in-tests.md)** (P3, S, ready) — попри мітку P3, це
тривіальна **гігієна тестів** без залежностей; підтягнути будь-коли як housekeeping.

### Хвиля 3 — кластер probe (спільна IPC)

**6. [add-stream-probe](p2-add-stream-probe.md)** (P2, S) — вводить IPC `probe_stream(url)`
(sync-spinner у `AddStreamDialog`).
**7. [browser-add-probe](p2-browser-add-probe.md)** (P2, S) — **реюзає ту саму IPC** (async-тост
у Browser). Робити одразу за #6, щоб не дублювати команду.

### Хвиля 4 — узгодити resume + дрібний polish (P2)

**10. [resume-last-playback](p2-resume-last-playback.md)** (P2, S, draft) — ⚠️ **спершу groom**:
перетинається з #1 (пропонує власний `last_playback.json` + enum `startup_playback_mode`,
тоді як #1 уже персистить `last_stream_id`/`last_file_position`). Вирішити, чи це окрема
авто-resume-на-старті поверх #1, чи дублювання — **до** написання коду. Також узгодити з
#3 (`state.json`) і #15 (autostart).

Далі — незалежні дрібниці (S, будь-який порядок):
**11. [log-rotation](p2-log-rotation.md)** · **12. [open-song-with-default-app](p2-open-song-with-default-app.md)** ·
**13. [import-duplicate-metadata-update](p2-import-duplicate-metadata-update.md)** ·
**14. [full-edit-stream](p2-full-edit-stream.md)** (M — потребує дизайну guard'а для активного запису).

### Хвиля 5 — більші P2-фічі (після стабілізації відтворення)

**15. [autostart](p2-autostart.md)** (P2, S, draft) — ⚠️ перевірити, що CLI `--minimize`
(колишня Phase 3G) **уже реалізовано** (запис `p1-cli-arguments.md` зник із беклогу →
ймовірно зроблено). Має координуватися з #1/#10: autostart **не** авто-грає.
**16. [command-palette-phase-3](p2-command-palette-phase-3.md)** (P2, M, draft) — розширення
вмісту палітри (станції/пісні/навігація); **розблоковує #21**.
**17. [post-processing](p2-post-processing.md)** (P2, M, draft) — об'ємна фіча, нижча
цінність → у кінець P2.
**18. [profile-switch-orphaned-tasks](p2-bug-profile-switch-orphaned-tasks.md)** (P2, M) —
**умовно**: брати лише якщо реальне використання покаже незафіналізовані файли після
profile switch (сам запис так і каже). Інакше тримати на полиці.

### Хвиля 6 — P3: дослідження-розвилки й відкладене

**19. [mpv-playback-engine](p3-mpv-playback-engine.md)** (P3, дослідити, L) — **робити ПЕРШИМ
серед декодер-записів**. Це розвилка: PoC-gate (HE-AACv2 грає правильно? перший ICY-тайтл
вчасно? розмір DLL? ліцензія FFmpeg?) вирішує долю #20. Запис прямо застерігає «не
починати обидва шляхи паралельно».

**20.** Залежно від результату #19:
- mpv **go** → реалізувати mpv (L), потім **видалити** записи he-aac-mf і hls (mpv закриває обидва).
- mpv **no-go** → повернутись до [he-aac-mf-playback](p3-he-aac-mf-playback.md) (діагностувати
  реальний баг на гілці `he-aac-mf`) і/або [hls-stream-support](p3-hls-stream-support.md) окремо.

**21. [command-palette-phase-4](p3-command-palette-phase-4.md)** (P3, blocked) — context-aware
ранжування; знімається з блоку лише після #16.
**22. [quick-controls-overlay](p3-quick-controls-overlay.md)** (P3, L) — велика, низький
пріоритет; відкласти.
**24. [screen-reader-direct-speech](p3-screen-reader-direct-speech.md)** — **відкладено під
сумнівом** із явним тригером повернення; **не планувати**, тримати запис як маркер рішення.

---

## Чому саме так (відхилення від алфавітного порядку README)

- **#1 перед рештою P1.** Алфавітно першим у папці стоїть `activity-bar-help-button`, але
  `playback-toggle` має найбільший downstream-важіль (розблоковує/координує #2, #10, #15) —
  тому веде. Help-button (S, нульовий ризик) лишається «філером».
- **#2 (P2) підтягнуто до #1 (P1).** Пріоритетно це P2, але як нульовий-ризик follow-up до
  #1 його дешевше зробити одразу, поки контекст cold-start-гілки відкритий.
- **Кластеризація probe (#6→#7)** і **палітра (#16→#21)** — щоб спільну IPC / залежність
  робити суміжно, а не повертатись двічі.
- **mpv (#19) перед he-aac/hls (#20)** — попри те, що he-aac/hls «старіші» записи, mpv —
  це fork-in-the-road, що може зробити їх непотрібними. Дослідити розвилку дешевше, ніж
  паралельно тягнути MF-шлях.

## Перехресні рішення, які треба закрити до коду

1. **resume-last-playback (#10) vs playback-toggle (#1).** Дві моделі персистенсу resume.
   Вирішити: #10 — це авто-старт-надбудова над `PlayerSession` з #1, чи окремий
   `last_playback.json`? Уникнути дублювання джерел правди.
2. **state.json (#3) vs last_playback.json (#10).** Свідомо різні файли (crash recovery ≠
   playback position) — але звірити структури при реалізації, щоб не дублювати поля.
3. **autostart (#15) ↔ відтворення (#1/#10).** Autostart запускає `--minimize` і **не**
   авто-грає; гра — лише явним жестом (Ctrl+Shift+K).
4. **mpv (#19) ↔ he-aac-mf / hls (#20).** Якщо mpv проходить PoC — видалити обидва записи.

## Готовність-сигнал (для вибору наступного)

- **Готові до коду зараз** (`ready`/«рішення прийняті»): #1, #2, #3, #4, #5, #6, #7, #8, #9, #11, #23.
- **Потребують grooming-пасу** (тип `ідея`/`draft`, є відкриті питання): #10, #12, #13, #14,
  #15, #16, #17, #18 — їхній промпт у записі досі «лише обговорення»; спершу довести до
  `заплановано`, тоді кодити.
- **Дослідження/розвилка**: #19, #20.
- **Заблоковано/відкладено**: #21 (чекає #16), #24 (тригер-gated).
