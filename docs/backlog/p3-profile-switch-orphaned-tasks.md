---
slug: profile-switch-orphaned-tasks
title: "Баг: orphaned recording tasks при profile switch timeout"
summary: "**умовний** — лише за реальним тригером (незафіналізовані файли після перемикання профілю)"
priority: P3
type: idea
status: draft
effort: M
kind: bug
target: unscheduled
updated: 2026-10-04
a11y: true
depends_on: []
blocks: []
touches: [src-tauri/src/commands/profile_commands.rs, src-tauri/src/stream/manager.rs]
gates: [cargo test, cargo clippy --all-targets]
notes: ["умовно: брати лише за реальним тригером — незафіналізовані файли після profile switch"]
---

# Баг: orphaned recording tasks при profile switch timeout

> **Контекст:** умовний запис — брати лише якщо реальне використання покаже незафіналізовані файли після profile switch. Наразі низький ризик, не планувати проактивно.

## Опис

При перемиканні профілю (`switch_profile`) бекенд зупиняє всі активні записи через `stop_all_async()` і чекає їх завершення з timeout 2 секунди:

```rust
let _ = tokio::time::timeout(
    Duration::from_secs(2),
    futures_util::future::join_all(handles),
).await;  // ← Timeout expires silently, orphaned tasks MAY continue
```

Якщо recording tasks не завершуються за 2 секунди (наприклад, повільне HTTP-з'єднання при shutdown, або блокуючий write у `tags::writer`), вони продовжують роботу у фоні: потенційно записують у файл старого профілю, поки новий вже активний.

**Чому вважався низьким ризик:** recording tasks пишуть у файли в `data/recordings/`, а не у AppState. Живий снапшот у `data/state.json` писар переписує вже після «stopped»-переходів `stop_all`, тож там orphaned-запис не осяде. Ризик: незафіналізований файл запису або теги, записані після закриття writer. В більшості випадків recording task завершується швидко (< 1 секунди).

**Звірка 2026-10-04 (HEAD `a04e358`): перша половина передумови хибна.** Задача запису пише не лише файли: вона комітить назву й бітрейт потоку в **активний** профіль (`commit_profile`, `src-tauri/src/stream/manager.rs:887`) і на кожному треку читає його вішліст та ігнор-листи (`:1069-1081`). Задача, що пережила 2 с очікування, робить це вже з **новим** профілем. А пережити їх легко: `connection::connect` скасування не слухає й має 10-секундні тайм-аути (`src-tauri/src/stream/connection.rs:28-35`). Рівень ризику варто переоцінити, перш ніж чекати тригера.

**Тригер повернення:** якщо реальне використання показує незафіналізовані файли після profile switch.

## Варіанти виправлення

1. **Збільшити timeout** — 5 або 10 секунд. Простий, але повільніший switch.
2. **Propagation via CancellationToken** — замінити `stop_all_async()` + wait на чітку CancellationToken систему, де кожен task перевіряє токен і чисто завершується. Більш архітектурно правильно, але L зусиль.
3. **Детектувати orphaned tasks** — якщо timeout спрацьовує, логувати попередження і показати NVDA-оголошення "Зупинка запису зайняла більше часу".

## Критерії готовності

- [ ] `docs/help/` — варіанти 1–2 видимої поведінки не міняють; варіант 3 додає репліку, і
      тоді `profiles.md` (обидві локалі) мусить її пояснити
- [ ] Recording tasks завершуються до перемикання профілю (без timeout-forced orphan)
- [ ] Або: timeout > 2с, документовано в коді
- [ ] Або: логується попередження при timeout + NVDA-оголошення

## Відкриті питання

- Наскільки реальний сценарій де task не завершується за 2с?
- Чи можна track-level shutdown (CancellationToken) замість process-level kill?

## Документи

- Код: `src-tauri/src/commands/profile_commands.rs` — `switch_profile()` (очікування — рядки 205-214)
- Код: `src-tauri/src/stream/manager.rs` — `stop_all_async()`
- Сусіди з тим самим 2-секундним очікуванням: [profiles-module](p2-profiles-module.md) (одне
  згортання сесії для перемикання й виходу) і [reconnect-loop-behind-host-port](p2-reconnect-loop-behind-host-port.md)
  (життя задачі запису) — власника цього правила обирати разом із ними
