---
slug: profile-switch-orphaned-tasks
title: "Баг: orphaned recording tasks при profile switch timeout"
priority: P3
type: idea
status: draft
effort: M
kind: bug
target: unscheduled
updated: 2026-07-22
a11y: true
depends_on: []
blocks: []
touches: [src-tauri/src/commands/profile_commands.rs, src-tauri/src/stream/manager.rs]
gates: [cargo test, cargo clippy]
notes: ["умовно: брати лише за реальним тригером — незафіналізовані файли після profile switch"]
---

# Баг: orphaned recording tasks при profile switch timeout

> **Контекст:** умовний запис — брати лише якщо реальне використання покаже незафіналізовані файли після profile switch. Наразі низький ризик, не планувати проактивно.

## Опис

При перемиканні профілю (`switch_profile`) бекенд зупиняє всі активні записи через `stop_all_async()` і чекає їх завершення з timeout 2 секунди:

```rust
let _ = tokio::time::timeout(
    Duration::from_secs(2),
    futures::future::join_all(handles),
).await;  // ← Timeout expires silently, orphaned tasks MAY continue
```

Якщо recording tasks не завершуються за 2 секунди (наприклад, повільне HTTP-з'єднання при shutdown, або блокуючий write у `tags::writer`), вони продовжують роботу у фоні: потенційно записують у файл старого профілю, поки новий вже активний.

**Чому низький ризик:** recording tasks пишуть у файли в `data/recordings/`, а не у AppState. Живий снапшот у `data/state.json` писар переписує вже після «stopped»-переходів `stop_all`, тож там orphaned-запис не осяде. Ризик: незафіналізований файл запису або теги, записані після закриття writer. В більшості випадків recording task завершується швидко (< 1 секунди).

**Тригер повернення:** якщо реальне використання показує незафіналізовані файли після profile switch.

## Варіанти виправлення

1. **Збільшити timeout** — 5 або 10 секунд. Простий, але повільніший switch.
2. **Propagation via CancellationToken** — замінити `stop_all_async()` + wait на чітку CancellationToken систему, де кожен task перевіряє токен і чисто завершується. Більш архітектурно правильно, але L зусиль.
3. **Детектувати orphaned tasks** — якщо timeout спрацьовує, логувати попередження і показати NVDA-оголошення "Зупинка запису зайняла більше часу".

## Критерії готовності

- [ ] Recording tasks завершуються до перемикання профілю (без timeout-forced orphan)
- [ ] Або: timeout > 2с, документовано в коді
- [ ] Або: логується попередження при timeout + NVDA-оголошення

## Відкриті питання

- Наскільки реальний сценарій де task не завершується за 2с?
- Чи можна track-level shutdown (CancellationToken) замість process-level kill?

## Документи

- Код: `src-tauri/src/commands/profile_commands.rs` — `switch_profile()` (рядки ~130-135)
- Код: `src-tauri/src/stream/manager.rs` — `stop_all_async()`
