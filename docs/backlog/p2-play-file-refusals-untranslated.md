---
slug: play-file-refusals-untranslated
title: "Відмова відтворити пісню приходить у тост англійською"
summary: "play_saved_song шле сиру англійську прозу рушія («File not found: {шлях}» тощо), і SongsPanel показує її в обох локалях"
priority: P2
type: planned
status: draft
effort: S
kind: bug
target: 0.1.1
updated: 2026-10-04
a11y: true
depends_on: [play-refusals-untranslated]
blocks: []
touches:
  - src-tauri/src/player/engine.rs
  - src-tauri/src/commands/songs_commands.rs
  - src/lib/playRefusal.ts
  - src/components/songs/SongsPanel.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
gates: [cargo test, cargo clippy --all-targets, pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Винесено з грумінгу play-refusals-untranslated 2026-10-04: той самий клас вади на іншому виклику. Залежність — спільний дім: коди PLAY_ERR_*, функцію «відмова → код на дріт» і мапер заводить батьківський запис, цей їх розширює."
---

# Відмова відтворити пісню приходить у тост англійською

> **Контекст:** винесено з грумінгу
> [play-refusals-untranslated](p2-play-refusals-untranslated.md) 2026-10-04, щоб той лишився
> S і з одним NVDA-сценарієм. Режим — **GROOMING** (`planned` + `draft`).

## Опис

`play_saved_song` (`src-tauri/src/commands/songs_commands.rs`) віддає `e.to_string()` усього,
що поверне `play_file` рушія, а `SongsPanel.tsx` показує `String(err)` у тості. Сира проза
рушія (`src-tauri/src/player/engine.rs`, `play_file`):

- «File not found: {шлях}» — ще й із повним шляхом у тості;
- «Unsupported audio format»;
- «Failed to open audio output stream».

Гілки `App.tsx` і `transportControl.ts`, що теж кличуть `playSavedSong`, — звірити під час
грумінгу: куди йде їхня відмова.

## Чому це вада

Те саме правило, що в батьківському записі: нативний шар шле ключі, не прозу
([ADR 2026-08-17](../decisions/2026-08-17-native-layer-localisation.md)); причина — закритий
перелік, деталь — у лозі
([ADR 2026-09-06](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md) §5).

## Що вирішити на грумінгу

- `output_unavailable` і `play_failed` з батьківського запису, імовірно, перевикористовуються
  як є; чи пасує «Не вдалося відтворити потік» до файлу — чи потрібне слово без «потоку».
- «Файл не знайдено» — новий код і ключ; що робить список після такої відмови (пісню
  перемістили чи видалили поза Tapir).

## Критерії готовності

- [ ] Відмови `play_saved_song` приходять кодом без шляху й чисел; деталь (`{e:#}`) — у лозі
- [ ] `SongsPanel` (і кожен інший виклик `playSavedSong`, що показує відмову) — через
      `playRefusalMessage`; тест на кожен код
- [ ] Ключі в обох локалях
- [ ] `docs/help/` — звірити розділи про «Пісні» й `troubleshooting.md`
- [ ] `cargo test`, `cargo clippy --all-targets`, `pnpm test`, `pnpm typecheck`,
      `pnpm vite:build` — без помилок
- [ ] NVDA-прогін: тост відмови на екрані «Пісні» читається мовою інтерфейсу

## Документи

- [play-refusals-untranslated](p2-play-refusals-untranslated.md) — батьківський запис, коди й мапер
- [record-refusals-untranslated](done/p2-record-refusals-untranslated.md) — той самий клас для запису
