---
slug: webview-reload-guard
title: "Подавити акселератори webview: reload (F5/Ctrl+R), F3/F7/F11, контекстне меню"
priority: P2
type: planned
status: ready
effort: S
kind: bug
target: 0.1.0
updated: 2026-07-23
a11y: true
depends_on: []
blocks: [keyboard-shortcuts-audit]
touches:
  - src/App.tsx
  - src/hooks/useGlobalShortcuts.ts
gates: [pnpm test, pnpm vite:build]
notes:
  - "WebView2 за замовчуванням перезавантажує webview на F5 / Ctrl+R / Shift+F5 / Ctrl+F5; Tauri v2 конфіг-опції вимкнути browser accelerator keys не має — підтверджений мейнтейнером шлях: JS keydown + preventDefault (tauri#3844)"
  - "Ctrl+Shift+R (hard reload) зараз тіньований власним OS-хоткеєм toggle_recording (RegisterHotKey перехоплює раніше за webview); гард страхує випадок, коли користувач перепризначив хоткей"
  - "Дефолтне контекстне меню WebView2 має пункт Reload — на рядках списків contextmenu вже перехоплюється (меню рядка), але поза ними меню нативне"
  - "Розширено 2026-07-23 (друга хвиля аудиту): + F3 (find next) / F7 (caret browsing) / F11 (fullscreen); Ctrl+F споживає Tier-2 диспетчер (hotkeys-expansion), F12 у прод-збірці мертвий без devtools-feature Tauri"
  - "Системна альтернатива AreBrowserAcceleratorKeysEnabled=false (Rust, with_webview + webview2-com) відхилена як дефолт: вбиває і Ctrl+Plus/Minus зум — важливий для слабозорих; точковий JS-гард зум зберігає"
---

# Подавити акселератори webview: reload (F5/Ctrl+R), F3/F7/F11, контекстне меню

> **Контекст:** знахідка дослідження [keyboard-shortcuts-audit](p2-keyboard-shortcuts-audit.md)
> (2026-07-23). F5 у коді ніде не обробляється → сьогодні F5 **мовчки
> перезавантажує webview** (дефолт WebView2): скидається стан UI, фокус, зони —
> для NVDA-користувача це дезорієнтація без жодного оголошення. Запис у Rust
> живе і виживає, але сесія інтерфейсу губиться. Виправляється до того, як
> F5 стане шорткатом «Копіювати в профіль» (звідси `blocks`).

## Опис

Перехопити reload-родину акселераторів WebView2 і нативний пункт Reload
контекстного меню:

1. **Клавіші:** reload-родина `F5`, `Ctrl+F5`, `Shift+F5`, `Ctrl+R`,
   `Ctrl+Shift+R` + браузерні `F3` (find next), `F7` (caret browsing), `F11`
   (fullscreen) — capture-фазний keydown-listener з `preventDefault()`.
   Метчити по `e.code` — конвенція №1 [keyboard-shortcuts.md](../keyboard-shortcuts.md).
   `Ctrl+F` тут НЕ потрібен — його глобально споживає Tier-2 диспетчер
   ([hotkeys-expansion](p2-hotkeys-expansion.md)); `F12` у прод-збірці Tauri
   мертвий без `devtools`-feature.
   **Не** гейтити на `isInModal`: гард мусить діяти й у модалях (на відміну від
   Tier-2 диспетчера) — тому окремий маленький listener поруч із
   [useGlobalShortcuts.ts](../../src/hooks/useGlobalShortcuts.ts), не гілка в ньому.
2. **Контекстне меню:** document-level `contextmenu` + `preventDefault()`,
   **крім** editable-елементів (`input`/`textarea`/`contenteditable`) — там
   нативне меню лишаємо (вставка/копіювання). Меню рядків не зачіпається:
   власний `onContextMenu` рядка вже гасить дефолт і відкриває своє.
3. **Dev-режим:** у `import.meta.env.DEV` гард не вмикати — F5 корисний при
   розробці; подавлення лише в прод-збірці (у тестах змокати як прод).

Решта акселераторів (Ctrl+P друк тощо) — свідомо поза скоупом: реального
шкідливого ефекту, як у reload/fullscreen, не мають. Системний вимикач
`AreBrowserAcceleratorKeysEnabled = false` (Rust-side через `with_webview` +
`webview2-com`) відхилено як дефолтний шлях: він гасить і `Ctrl+Plus/Minus`
зум — важливий для слабозорих; повертати зум довелося б per-key через
`AcceleratorKeyPressed`/`IsBrowserAcceleratorKeyEnabled` (зайва обв'язка).
Тримаємо точковий JS-перелік; переглянути, лише якщо перелік розростеться.

## Критерії готовності

- [ ] keydown-гард: `F5`/`Ctrl+F5`/`Shift+F5`/`Ctrl+R`/`Ctrl+Shift+R` +
      `F3`/`F7`/`F11` → `defaultPrevented` (capture-фаза, працює і при
      відкритій модалі); `Ctrl+Plus/Minus` зум НЕ зачеплений
- [ ] `contextmenu` поза editable-елементами подавлено; на `input`/`textarea` —
      нативне меню працює; меню рядків списків не регресує
- [ ] Гард неактивний у dev (`import.meta.env.DEV`)
- [ ] Тести: dispatch reload-комбо → `defaultPrevented === true`; `contextmenu`
      на body → prevented, на `input` → ні
- [ ] `docs/keyboard-shortcuts.md`: примітка про подавлені webview-акселератори
- [ ] `pnpm test` без регресій

## Документи

- Дослідження-джерело: [p2-keyboard-shortcuts-audit.md](p2-keyboard-shortcuts-audit.md);
  друга хвиля (F3/F7/F11, Ctrl+F у диспетчері): [p2-hotkeys-expansion.md](p2-hotkeys-expansion.md)
- Код: `src/App.tsx`, `src/hooks/useGlobalShortcuts.ts` (сусідній прецедент
  capture-listener'а), `src/lib/shortcutGuard.ts` (`isInModal` — тут НЕ вживати)
- [Tauri discussion #3844 — How to disable pressing F5](https://github.com/tauri-apps/tauri/discussions/3844)
  (підтверджено мейнтейнером: `addEventListener` + `preventDefault`; меню — окремо)
- [WebView2 `AreBrowserAcceleratorKeysEnabled`](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2settings.arebrowseracceleratorkeysenabled)
  — рівень WebView2, у Tauri v2 не експонований (для довідки)
