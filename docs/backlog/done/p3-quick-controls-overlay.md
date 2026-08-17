---
slug: quick-controls-overlay
title: "Quick Controls Overlay — швидке меню у фоні"
priority: P3
type: idea
status: done
effort: L
kind: feature
target: unscheduled
updated: 2026-08-17
completed: 2026-08-17
a11y: true
depends_on: []
blocks: []
touches: [src-tauri/src/tray, src/components]
gates: [pnpm test, pnpm vite:build, cargo test, cargo clippy]
depends_on_external: ["Phase 3A (System Tray, ✅)", "Phase 2A (PlayerEngine, ✅)", "Phase 3F (Profiles, ✅)"]
---

# Quick Controls Overlay — швидке меню у фоні

> **Контекст:** **відхилено 2026-08-17.** Запис закрито; опис нижче лишається як розбір
> варіантів, а не як план. Керування у фоні — трей-меню плюс глобальні клавіші.

## Рішення: відхилено (2026-08-17)

Розробник відмовився від ідеї. Разом із записом закриваються всі чотири відкриті
питання (яку глобальну клавішу призначити; чи робити overlay конфігурованим; друге
Tauri-вікно проти нативного Win32; toggle проти відкривання заново) — вони вилучені
з [OPEN-QUESTIONS.md](../OPEN-QUESTIONS.md), секція P2 там спорожніла.

**Що це закріплює:**

- **Другого вікна в застосунку не буде.** Ні другого WebView2 (~50 МБ RAM поверх
  «portable single EXE»), ні нативного Win32-popup'а з власним MSAA/UIA-деревом.
- **Фонова поверхня одна — трей.** Меню значка плюс глобальні хоткеї лишаються
  єдиним способом керувати Tapir, не піднімаючи вікно. Це підвищує ставку двох
  записів у 0.1.0: [tray-layer-not-localized](p1-tray-layer-not-localized.md)
  (єдина фонова поверхня зобов'язана бути двомовною — обхідного шляху більше немає)
  і [sound-hotkeys-feedback-announce-only](../p1-sound-hotkeys-feedback-announce-only.md)
  (відгук на глобальні клавіші лишається balloon tips + видима поверхня у вікні).
- Сценарій «5–10 кроків, щоб змінити дію з іншого застосунку» приймається як ціна:
  дешевшає він лише розширенням набору глобальних клавіш, не новим вікном.

## Опис

Натискання глобальної клавіші (наприклад `Ctrl+Shift+Space`) відкриває мале overlay-вікно — "Quick Controls" — навіть коли основне вікно мінімізоване або у tray. Вікно фокусується, NVDA озвучує, і користувач керує стрілками.

**Проблема, яку вирішує:** при роботі в інших застосунках єдиний спосіб змінити дії Tapir — переключитися у вікно Tapir, знайти потрібний елемент і зробити дію. Для NVDA-користувача це 5-10 кроків. Quick Controls — 1 клавіша + 2-3 стрілки.

**Аналог:** iPhone VoiceOver Rotor, macOS Control Strip, Windows Media Transport Controls у taskbar.

### Що в меню

```
▶ Записати поточний потік         [Enter]
⏸ Зупинити відтворення            [Enter]
🔊 Гучність: 75%  ← →             [← →]
─────────────────────────────────────
◀ Попередній потік                 [Enter]
▶ Наступний потік                  [Enter]
─────────────────────────────────────
📋 Переключити профіль → Jazz      [Enter]
```

Навігація: ↑/↓ між пунктами, ← → для value (гучність), Enter/Space — виконати, Escape — закрити.

### Технічні варіанти

**Варіант 1: Друге Tauri-вікно** (React-overlay)
- Окремий Tauri Window з `skip_taskbar: true`, `always_on_top: true`, `decorations: false`
- Фокусується глобальним хоткеєм через `window.set_focus()`
- NVDA бачить як окреме вікно — стандартна поведінка
- Мінус: ще один WebView2 процес (~50 МБ RAM)

**Варіант 2: Нативний Win32 popup** (Rust + windows-rs)
- `CreateWindowEx(WS_EX_TOOLWINDOW | WS_EX_TOPMOST)` + custom rendering
- Менший overhead, але складна accessibility (потрібен MSAA/UI Automation)
- Мінус: велика складність, немає React

**Варіант 3: Розширити System Tray popup** (Windows Tray Context Menu + NVDA)
- Tray вже є (3A ✅) і вже озвучується NVDA
- Але: tray context menu не підтримує value-слайдери, не має живих updates
- Мінус: не підходить для гучності та real-time стану

**Рекомендований варіант: 1** (друге Tauri-вікно). Більша складність, але правильна accessibility.

### Доступність (NVDA)

- Overlay-вікно має `role="dialog"`, `aria-label="Quick Controls"`
- `aria-live="polite"` для змін гучності
- Фокус при відкритті — перший пункт
- Escape → фокус повертається у попереднє вікно (`AllowSetForegroundWindow` trick)

## Критерії готовності

- [ ] Глобальна клавіша відкриває overlay без переключення на основне вікно
- [ ] Overlay закривається по Escape, Enter (після вибору дії), або click outside
- [ ] NVDA озвучує назву overlay і кожен пункт меню
- [ ] Стрілки ← → змінюють гучність (+/- 5%)
- [ ] Overlay відображає поточний стан (що грає, яка гучність)

## Відкриті питання

- Яку глобальну клавішу призначити? (не конфліктувати з іншими T1 shortcuts)
- Чи варто робити overlay конфігурованим (вибрати які пункти показувати)?
- Друге Tauri-вікно vs нативний Win32 — як вибрати з урахуванням "portable single EXE"?
- Чи показувати overlay при кожному виклику або toggle (відкрити/закрити)?

## Документи

- [docs/accessibility.md](../../accessibility.md) — NVDA focus handling
- Phase 3A System Tray — аналогічний підхід з фоновим вікном
- Tauri docs: multiple windows, `skip_taskbar`, `always_on_top`
