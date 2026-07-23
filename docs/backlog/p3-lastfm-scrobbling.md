---
slug: lastfm-scrobbling
title: "Last.fm скробблінг — автоматична відправка прослуханих треків"
priority: P3
type: idea
status: draft
effort: M
kind: feature
target: unscheduled
updated: 2026-07-22
a11y: false
depends_on: []
blocks: []
touches: [src-tauri/src/stream/splitter.rs, src-tauri/src/commands/settings_commands.rs, src/components/settings]
gates: [pnpm test, cargo test, cargo clippy]
---

# Last.fm скробблінг — автоматична відправка прослуханих треків

> **Контекст:** Last.fm — сервіс музичної статистики. Скробблінг — це автоматичне надсилання
> інформації про трек на Last.fm щоразу, коли він прослуховується. Tapir вже отримує
> ICY-метадані (виконавець + назва) — ця фіча їх використовує.

## Опис

Коли Tapir виявляє зміну ICY-метаданих (новий трек), він надсилає POST-запит до
[Last.fm API](https://www.last.fm/api) (`track.scrobble`) з виконавцем і назвою.
Це дозволяє користувачу накопичувати музичну статистику, отримувати рекомендації
та відстежувати свою бібліотеку через Last.fm.

Для автентифікації Last.fm використовує `Last.fm API key` + `session key`
(OAuth-подібний flow через `auth.getMobileSession` або веб-авторизацію).

## Сфера

- Налаштування у Settings: toggle "Скробблінг Last.fm" + поля API key та session token
- Backend: HTTP-клієнт (reqwest вже є), `track.scrobble` + `track.updateNowPlaying`
- Скробблінг лише при відтворенні (`play_stream`), не при записі без відтворення
- Умова: трек вважається "прослуханим" якщо >30 сек або >50% тривалості (Last.fm правило)
  — але оскільки тривалість радіо-треку невідома до зміни ICY, надсилаємо після наступної зміни
  якщо попередній трек грав довше мінімального порогу (наприклад, 30 сек)

## Критерії готовності

- [ ] Налаштування: toggle + поле для API credentials у SettingsDialog
- [ ] При зміні ICY-метаданих → `track.updateNowPlaying` (зараз грає)
- [ ] При наступній зміні ICY → `track.scrobble` попереднього треку (якщо ≥30 сек)
- [ ] Помилки Last.fm API не переривають запис/відтворення — тихо логуються
- [ ] Скробблінг не запускається при записі без активного відтворення

## Відкриті питання

- Чи потрібен окремий "Last.fm авторизація" діалог (web-flow → отримати session key)?
  Або просто поле для ручного введення session key (простіше, але менш зручно)?
- Скробблювати тільки при відтворенні, чи також при записі без відтворення?
