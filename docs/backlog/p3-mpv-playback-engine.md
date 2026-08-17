---
slug: mpv-playback-engine
title: "Відтворення через mpv / libmpv (альтернативний рушій декодування)"
priority: P3
type: research
status: draft
effort: L
kind: feature
target: unscheduled
updated: 2026-08-17
a11y: true
depends_on: []
blocks: [he-aac-mf-playback, hls-stream-support]
touches: [src-tauri/src/player/engine.rs, src-tauri/src/smtc.rs, src-tauri/src/wake_lock.rs]
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
depends_on_external: ["player::engine (LiveSource, play_live, play_file, open_device_sink)", "stream::connection (ICY)", "smtc", "wake_lock", "деплой/бандлінг portable-EXE"]
notes: ["Робити ПЕРШИМ серед декодер-записів — розвилка (PoC-gate), яка може зробити he-aac-mf-playback і hls-stream-support непотрібними; не вести MF-шлях і mpv паралельно"]
---

# Відтворення через mpv / libmpv (альтернативний рушій декодування)

> **Контекст:** дослідження — розвилка (PoC-gate) для [he-aac-mf-playback](p3-he-aac-mf-playback.md) і [hls-stream-support](p3-hls-stream-support.md). Головний ризик — надійність **першого** ICY-тайтла в mpv/FFmpeg.

## Опис

Ідея: замінити поточний шлях декодування (**rodio + symphonia + cpal**) на **mpv через libmpv**.
Користувач явно погодився на «зайву DLL».

**Поточний стан (звідки росте ідея):**
Декодер — `symphonia` (через rodio). Він **не вміє HE-AAC / HE-AACv2** (див. [[he-aac-mf-parked]] / [he-aac-mf-playback](p3-he-aac-mf-playback.md)) і не парсить HLS-маніфести ([hls-stream-support](p3-hls-stream-support.md)). Через це частина радіо-станцій не грає; у коді живе `PROBE_TIMEOUT = 15s` ([engine.rs:69](../../src-tauri/src/player/engine.rs#L69)) саме щоб недекодовані потоки не вішали відтворення.

**Чому mpv приваблює:** під капотом FFmpeg (libavcodec/libavformat) → майже всі кодеки **включно з HE-AAC, HE-AACv2, Opus, Vorbis, FLAC**, плюс HLS «з коробки». Один крок закриває одразу два P3-записи (HE-AAC і HLS) і знімає власний декод-пайплайн.

### Чи можливо — так. Зрілі обгортки для Rust/Tauri існують:

- **`libmpv2`** — безпечні Rust-біндінги до `libmpv` (≥ mpv 0.35). Активний: v6.0.0 від 2026-05-12, Rust 2024, LGPL-2.1. Дає playback, мережеві потоки, properties, події, кастомні протоколи. Найближчий аналог того, що тут треба.
- **`tauri-plugin-libmpv`** / **`tauri-plugin-libmpv-sys`** — готовий Tauri-плагін (FFI + wrapper): спостереження за `pause`/`time-pos`/`duration`/`filename`, команди, get/set properties.
- **`tauri-plugin-mpv`** — альтернатива без DLL у процесі: керує **окремим процесом** `mpv.exe` через JSON-IPC (поряд має лежати mpv.exe).

### Що це дає (порівняння з поточним способом)

| Аспект | Зараз (rodio + symphonia + cpal) | mpv (libmpv) |
|---|---|---|
| Деплой | Статична лінковка, **0 зовнішніх DLL** | `libmpv-2.dll` + FFmpeg, десятки МБ |
| Кодеки | MP3, AAC-LC, ISO-MP4; **немає HE-AAC** | Майже все, **включно з HE-AAC/HE-AACv2** |
| HLS | Не підтримується (окремий P3) | Нативно через FFmpeg |
| Декод/демукс/буфер | Власний код: `LiveSource`, `RtrbReader`, reqwest-pump (~400 рядків [engine.rs](../../src-tauri/src/player/engine.rs)) | Усе всередині mpv → наш код спрощується |
| Гучність/пауза/seek/позиція/тривалість | Ручне зведення через rodio `Player` | Нативні properties mpv |
| Вибір аудіопристрою | `cpal` enum, вже працює ([engine.rs:339](../../src-tauri/src/player/engine.rs#L339)) | mpv `--audio-device` + `audio-device-list` |
| **ICY-метадані (artist/title)** | **Власний парсер** `StreamTitle`, надійний *перший* тайтл, годує `track-changed`/SMTC/нотифікації ([engine.rs:659](../../src-tauri/src/player/engine.rs#L659)) | mpv читає ICY (`metadata` property + observe), **але є відома вада: перший тайтл часто не приходить до першої зміни** |
| Контроль пайплайну | Повний (non-destructive probe, wake-lock, прогрес) | Через події/properties — менше контролю |
| Ліцензія | Permissive (Rust-крейти) | **LGPL-2.1** (mpv/FFmpeg), нерідко GPL-збірки FFmpeg |

## Ризики / застереження

1. **ICY-метадані — головний ризик.** Весь конвеєр `track-changed → SMTC → tray-нотифікації` зав'язаний на надійний парсинг `StreamTitle`, у т.ч. **першого** тайтла. mpv/FFmpeg ICY читає (`stream_lavf`, потребує свіжого FFmpeg), але історично **перший тайтл показує лише після першої зміни** (mpv #36 / #753). Це **регрес** проти поточної реалізації — обов'язково перевіряти на реальних потоках.
2. **Ліцензія.** libmpv/FFmpeg — LGPL-2.1 (нерідко GPL-збірки). Динамічне лінкування DLL під LGPL допустиме, але треба notices і можливість заміни бібліотеки. Перевірити, яка саме збірка FFmpeg усередині DLL.
3. **SMTC-дубль.** Проєкт сам синхронізує SMTC (`crate::smtc`); mpv на Windows теж уміє в SMTC → можливий конфлікт/дубляж. Вимкнути одну сторону.
4. **mpv — video-движок.** Для audio-only запускати з `--vid=no`/`--no-video`; зайвий «вантаж» заради аудіо.
5. **Втрата тонкого контролю.** Логіку «спершу переконатися, що потік декодується, лише потім зупиняти старий» ([engine.rs:837](../../src-tauri/src/player/engine.rs#L837)) доведеться перебудовувати на події mpv.
6. **Можливе перетинання з MF-роботою.** Якщо mpv заходить — гілка `he-aac-mf` і запис [he-aac-mf-playback](p3-he-aac-mf-playback.md) стають непотрібні (mpv розв'язує ту саму проблему). Не починати обидва шляхи паралельно.

## Критерії готовності

Спочатку **PoC-gate** (без нього не промотувати):
- [ ] PoC на `libmpv2`: один **HE-AACv2** потік (напр. SomaFM `groovesalad-16-aac`) грає з правильною швидкістю/тоном
- [ ] PoC: один **ICY**-потік — перевірено, чи приходить **перший** `StreamTitle` без затримки (ключове рішення go/no-go)
- [ ] Оцінено розмір `libmpv-2.dll` + вплив на portable-бандл і час старту
- [ ] З'ясовано ліцензійну збірку FFmpeg усередині DLL (LGPL vs GPL) і вимоги до дистрибуції

Якщо PoC проходить — повна реалізація:
- [ ] `play_file`, `play_stream`, `preview` через mpv; pause/resume/seek/volume/позиція/тривалість збережені
- [ ] `track-changed` / SMTC / нотифікації працюють не гірше за поточний ICY-парсер (включно з першим тайтлом)
- [ ] Вибір аудіопристрою (`set_output_device`) збережено
- [ ] AAC-LC і MP3 без регресій; HLS-станції грають
- [ ] Уся доступність/NVDA-озвучення збережені; жодного дубля SMTC
- [ ] `cargo test` + `cargo clippy` зелені; `pnpm test` + `pnpm vite:build` зелені; ручний gate на реальному пристрої

## Відкриті питання

- **In-process (`libmpv2`/`tauri-plugin-libmpv`) чи окремий процес (`tauri-plugin-mpv` + JSON-IPC)?** DLL у процесі простіше інтегрувати, процес — ізоляція й простіша ліцензія.
- Чи дає mpv надійний перший ICY-тайтл? Якщо ні — лишити власний ICY-pump (reqwest) лише для метаданих, а mpv годувати байтами/URL як декодер?
- Як збирати/постачати `libmpv-2.dll` для portable-EXE (звідки беремо бінарник, оновлення, антивірус-false-positive)?
- Чи зберігається поточна модель «non-destructive probe» (старий потік грає, поки новий не підтверджений) на подіях mpv?
- Реальна цінність проти ризику: скільки станцій у користувача саме HE-AAC/HLS без MP3/AAC-LC-альтернативи?
- Чи закриває mpv одразу [he-aac-mf-playback](p3-he-aac-mf-playback.md) і [hls-stream-support](p3-hls-stream-support.md) — і чи варто тоді їх видалити?

## Документи

- Пов'язані записи: [he-aac-mf-playback](p3-he-aac-mf-playback.md), [hls-stream-support](p3-hls-stream-support.md)
- Код: [src-tauri/src/player/engine.rs](../../src-tauri/src/player/engine.rs) — `LiveSource`, `play_live` (`PROBE_TIMEOUT`), `play_file`, `open_device_sink`, ICY-парсер `parse_stream_title`; `src-tauri/src/smtc.rs`, `src-tauri/src/wake_lock.rs`
- [docs/architecture.md](../architecture.md), [docs/tech-stack.md](../tech-stack.md)
- Крейти: [libmpv2 — lib.rs](https://lib.rs/crates/libmpv2) · [tauri-plugin-libmpv — crates.io](https://crates.io/crates/tauri-plugin-libmpv) · [tauri-plugin-mpv — lib.rs](https://lib.rs/crates/tauri-plugin-mpv)
- ICY у mpv/FFmpeg: [mpv commit 0b77649 — stream_lavf: read ICY metadata](https://github.com/mpv-player/mpv/commit/0b77649c0b6afb103e0390163bd14f1cf9d20f06) · [mpv #36](https://github.com/mpv-player/mpv/issues/36) · [mpv #753 — перший тайтл не показано до зміни](https://github.com/mpv-player/mpv/issues/753) · [FFmpeg `-icy` опції](https://ffmpeg.org/pipermail/ffmpeg-user/2014-January/019673.html)
