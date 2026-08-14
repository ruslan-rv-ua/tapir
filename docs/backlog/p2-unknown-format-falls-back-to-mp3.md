---
slug: unknown-format-falls-back-to-mp3
title: "Невідомий формат потоку мовчки стає MP3 — файл отримує чуже розширення"
priority: P2
type: planned
status: ready
effort: S
kind: bug
target: unscheduled
updated: 2026-08-14
a11y: false
depends_on: []
blocks: []
touches:
  - src-tauri/src/stream/format.rs
  - src-tauri/src/stream/manager.rs
  - src-tauri/src/stream/recorder.rs
  - src-tauri/src/profile.rs
gates: [cargo test]
notes:
  - "Знахідка grilling help-troubleshooting (2026-08-14): довідка описує екран як є, тому в текст це не пішло — інакше зафіксувала б дефект як норму."
  - "Усередині є розвилка: розширити розпізнавання чи чесно відмовити. Рішення при підйомі."
---

# Невідомий формат потоку мовчки стає MP3 — файл отримує чуже розширення

> **Контекст:** знайдено під час grilling `help-troubleshooting`. Tapir знає рівно два
> формати, а третій не відхиляє й не позначає — тихо називає його першим.

## Опис

`AudioFormat` має рівно два варіанти — `Mp3` і `Aac`
([profile.rs:9](../src-tauri/src/profile.rs:9)). Розпізнавання йде тільки по
`Content-Type` ([format.rs](../src-tauri/src/stream/format.rs)), і все, крім
`audio/mpeg`, `audio/mp3`, `audio/aac`, `audio/aacp`, `audio/x-aac`, `audio/mp4`, дає
`None`.

А далі — мовчазний фолбек:

```rust
let detected_format = format::detect_from_content_type(content_type)
    .unwrap_or(AudioFormat::Mp3);   // manager.rs:663
```

Формат обирає розширення файлу (`recorder.rs:263` → `"mp3"` / `"aac"`), тож станція в
OGG/Vorbis, Opus чи FLAC записується у файл із назвою `…​.mp3`, у якому лежить не MP3.
Такі станції в каталозі є — Браузер станцій має фільтр **Кодек**, і серед його значень
`OGG` присутній нарівні з `MP3` і `AAC`.

Наслідки:

- **Файл бреше про себе.** Провідник, теговий редактор і сторонній плеєр орієнтуються на
  розширення; частина з них просто відмовиться його відкрити.
- **Власний плеєр Tapir його теж не візьме** — rodio зібрано з `symphonia-mp3`,
  `symphonia-aac`, `symphonia-isomp4`, без Vorbis/Opus/FLAC.
- **Ознаки проблеми немає ніде:** ні в рядку потоку, ні в журналі — фолбек беззвучний.

Поруч у тому ж модулі лежать **невживані** `detect_from_magic_bytes` і `detect`, обидві
під `#[allow(dead_code)]` з коментарем `Scaffold:` — тобто другий рівень розпізнавання
задумували й не підключили. Це не робить дефекта меншим: сигнатури `OggS`/`fLaC` магічними
байтами ловляться, але навіть спійманий формат нікуди складати — варіанта в enum немає.

## Відкриті питання

- **Розширити чи відмовити.** (а) Додати варіанти в `AudioFormat` і підключити
  `detect_from_magic_bytes` — запис стає чесним, але відтворення однаково не запрацює,
  поки плеєр не вміє цих кодеків (див. [mpv-playback-engine](p3-mpv-playback-engine.md));
  (б) лишити два формати, але **не вгадувати**: невідомий `Content-Type` → видима помилка
  або позначка на потоці замість тихого `Mp3`; (в) зберігати з розширенням `.bin` чи без
  розширення. Рекомендація при підйомі — **(б)**: дешево, чесно, і не тягне за собою
  питання про декодер. Головна шкода тут не в тому, що формат не підтримано, а в тому, що
  про це ніхто не сказав.

## Критерії готовності

Уточнити після рішення вище. Кістяк:

- [ ] Потік із нерозпізнаним `Content-Type` більше не записується мовчки як MP3
- [ ] Користувач дізнається про це з інтерфейсу, а не з властивостей файлу
- [ ] Скаффолди `detect` / `detect_from_magic_bytes` або підключені, або лишені свідомо
      з оновленим коментарем
- [ ] `cargo test` — без помилок

## Документи

- [help-troubleshooting](p1-help-troubleshooting.md) — знахідка сесії; довідка описує
  лише видиме («Tapir відтворює MP3 і AAC») і про розширення мовчить свідомо
- [mpv-playback-engine](p3-mpv-playback-engine.md), [he-aac-mf-playback](p3-he-aac-mf-playback.md)
  — сусідня межа: що Tapir уміє **відтворювати**
- `src-tauri/src/stream/format.rs`, `manager.rs:663`, `recorder.rs:263`
