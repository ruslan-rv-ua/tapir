---
slug: reconnect-max-in-status
title: "Стеля спроб їде разом зі статусом потоку, а не читається з поточних налаштувань"
priority: P2
type: planned
status: blocked
effort: S
kind: bug
target: unscheduled
updated: 2026-08-13
a11y: false
depends_on: [reconnect-zero-retries]
blocks: []
blocked_reason: "Чекає reconnect-zero-retries: той запис міняє семантику стелі й видаляє гілку, яку цей замінює."
touches:
  - src-tauri/src/stream/manager.rs
  - src/lib/tauri.ts
  - src/components/streams/StreamList.tsx
  - src/components/streams/StreamItem.tsx
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
notes:
  - "Відщеплено від reconnect-zero-retries під час grilling 2026-08-13 (варіант F3)."
---

# Стеля спроб їде разом зі статусом потоку

> **Контекст:** UI показує «спроба N з M», де `N` приходить із бекенда, а `M` —
> із поточних налаштувань профілю. Це різні джерела, і вони розходяться.

## Опис

`recording_task` бере `RecordingSettings` **знімком** на старті запису
([manager.rs:588](../../src-tauri/src/stream/manager.rs:588) — `reconnect` клонується
один раз і живе з задачею). `StreamItem` натомість читає **поточні** налаштування
профілю ([StreamList.tsx:42](../../src/components/streams/StreamList.tsx:42):
`profileSettings?.recording.reconnect.maxRetries ?? 0`).

Два шляхи розсинхрону:

1. Користувач стартує запис із `maxRetries: 10`, під час запису змінює значення —
   бекенд і далі живе зі своїм знімком, UI вже показує нове число. «Спроба 3 з 25»
   при реальній стелі 10.
2. Доки налаштування профілю не завантажені, `?? 0` дає нуль — і будь-який
   `reconnecting`-статус у цьому вікні читається за гілкою «стелі немає».

`StreamStatus` уже несе `reconnect_attempt` — тобто половина пари вже їде правильним
каналом. Друга половина гадається на фронтенді.

## Рішення

Додати стелю в `StreamStatus` поруч із `reconnect_attempt`, зі **знімка**, за яким
реально живе цикл `'reconnect`. `StreamItem` перестає приймати `maxRetries` пропом і
бере обидва числа з одного джерела; `StreamList` більше не читає налаштування профілю
заради цього.

## Критерії готовності

- [ ] `StreamStatus` несе стелю спроб зі знімка `recording_task`
- [ ] `StreamItem` не отримує `maxRetries` із налаштувань профілю; обидва числа —
      з одного статусу
- [ ] Зміна налаштування під час активного запису не міняє число в рядку потоку
- [ ] `cargo test`, `cargo clippy`, `pnpm test`, `pnpm vite:build` — без помилок

## Документи

- [reconnect-zero-retries](p0-reconnect-zero-retries.md) — запис, від якого відщеплено (рішення 2, варіант F3)
- [ADR: семантика спроби перепідключення](../decisions/2026-08-13-reconnect-attempt-semantics.md)
