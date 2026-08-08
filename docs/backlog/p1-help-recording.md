---
slug: help-recording
title: "Довідка: Потоки, Як працює запис, Файли й імена"
priority: P1
type: planned
status: ready
effort: M
kind: chore
target: 0.1.0
updated: 2026-08-08
a11y: false
depends_on: [help-content-polish, help-intro]
blocks: [help-troubleshooting]
touches:
  - docs/help/uk/streams.md
  - docs/help/en/streams.md
  - docs/help/uk/recording.md
  - docs/help/en/recording.md
  - docs/help/uk/templates.md
  - docs/help/en/templates.md
  - src/components/common/HelpDialog.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
gates: [pnpm test, pnpm vite:build]
---

# Довідка: Потоки, Як працює запис, Файли й імена

> **Контекст:** другий із шести записів, що наповнюють вбудовану довідку (F1).
> Специфікація — [help-content-polish](done/p1-help-content-polish.md). Три розділи пишуться
> одним заходом, бо тісно перехресні: запис бере потік і кладе файл за шаблоном у теку.

## Опис

- **`streams.md`** — новий: керування списком потоків (додавання з перевіркою, попередження
  про дублі й збіг назв, редагування, фільтр, сортування, імпорт-експорт `M3U8`/`PLS`,
  перенесення між профілями, «Записати все»).
- **`recording.md`** — переписати заглушку: як іде запис, статуси, **метадані ефіру**
  (термін вводиться саме тут), поділ на треки, неповний перший трек, перепідключення,
  вільне місце, підйом записів після аварійного завершення.
- **`templates.md`** — переписати заглушку й розширити тему: де лежать файли, як змінити
  теку, три шаблони імен, змінні списком, заборонені символи, збіг імен.

Перелік обов'язкових позицій — у розділі «Мапа покриття» специфікації.

## Технічні кроки

- Нова вкладка `streams` у `HelpDialog.tsx` — за `profiles`, згідно з порядком зі
  специфікації.
- Новий ключ `help_section_streams`: «Потоки» / "Streams" (дослівно як `streams_section`).
- Змінити тексти наявних ключів: `help_section_recording` → «Як працює запис» /
  "How recording works"; `help_section_templates` → «Файли й імена» / "Files & names".
  Самі ключі та імена файлів **не** перейменовуються.
- Кожен із трьох розділів завершується блоком «Клавіші на цьому екрані» (для `streams`)
  або відсиланням до розділу «Навігація і клавіатура».

## Критерії готовності

- [ ] `streams.md`, `recording.md`, `templates.md` написані (uk + en) за мапою покриття
- [ ] Термін «метадані ефіру» введено один раз у `recording.md` і вжито однаково в решті
- [ ] Значення за замовчуванням (кількість спроб, пауза, мінімальна тривалість треку,
      поріг вільного місця) звірено **з кодом** (`src-tauri/src/settings.rs`,
      `src-tauri/src/profile.rs`), а не з документацією
- [ ] Змінні шаблонів подані списком, не таблицею; є щонайменше два готові приклади
- [ ] Блок «Клавіші на цьому екрані» у `streams.md` — 3–6 пунктів, лише специфічні дії
- [ ] Вкладки «Потоки», «Як працює запис», «Файли й імена» на своїх місцях у порядку
      зі специфікації
- [ ] `pnpm test`, `pnpm vite:build` — без помилок

## Документи

- [help-content-polish](done/p1-help-content-polish.md) — специфікація (мапа, стиль, розмітка)
- `src-tauri/src/stream/` — з'єднання, поділ на треки, перепідключення
- `src-tauri/src/sanitize.rs`, `src-tauri/src/naming.rs` — імена файлів і потоків
- `src/components/streams/` — діалоги додавання, імпорту, експорту, перенесення
- `src/components/profile/ProfileRecordingTab.tsx` — склад налаштувань запису
