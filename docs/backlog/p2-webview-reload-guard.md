---
slug: webview-reload-guard
title: "Подавити акселератори webview: reload (F5/Ctrl+R), F3/F7/F11, контекстне меню"
priority: P2
type: planned
status: ready
effort: M
kind: bug
target: 0.1.0
updated: 2026-08-07
a11y: true
depends_on: []
blocks: [streams-transfer-hotkeys, window-fullscreen-f11]
touches:
  - src/App.tsx
  - src/lib/webviewAccelerators.ts
  - src/hooks/useWebviewGuard.ts
  - src-tauri/src/lib.rs
  - docs/keyboard-shortcuts.md
gates: [pnpm test, pnpm vite:build]
notes:
  - "WebView2 за замовчуванням перезавантажує webview на F5 / Ctrl+R / Shift+F5 / Ctrl+F5; Tauri v2 конфіг-опції вимкнути browser accelerator keys не має — підтверджений мейнтейнером шлях: JS keydown + preventDefault (tauri#3844)"
  - "Ctrl+Shift+R (hard reload) зараз тіньований власним OS-хоткеєм toggle_recording (RegisterHotKey перехоплює раніше за webview); гард страхує випадок, коли користувач перепризначив хоткей"
  - "Дефолтне контекстне меню WebView2 має пункт Reload — на рядках списків contextmenu вже перехоплюється (меню рядка), але поза ними меню нативне"
  - "Розширено 2026-07-23 (друга хвиля аудиту): + F3 (find next) / F7 (caret browsing) / F11 (fullscreen); Ctrl+F споживає Tier-2 диспетчер (hotkeys-expansion), F12 у прод-збірці мертвий без devtools-feature Tauri"
  - "Автотести цього гарду нічого не доводять про WebView2: у jsdom дефолту немає, тож preventDefault() «спрацьовує» завжди. Єдиний доказ — прогін прод-збірки; звідси обов'язковий NVDA-чекліст у критеріях"
  - "Гард викликає лише preventDefault(), НІКОЛИ stopPropagation() — інакше подія не дійде ні до F5=Копіювати (streams-transfer-hotkeys), ні до KeyRecorder. Перевірено: у src/ немає жодної перевірки defaultPrevented, тож погашена подія нікого не збиває. Цей інваріант перевіряється кроком «шов із гардом» у NVDA-чеклисті streams-transfer-hotkeys — навмисне дублювання зони відповідальності, бо поодинці жоден із двох чеклистів регресію не спіймає"
  - "DEV-гейт (import.meta.env.DEV) відхилено 2026-08-07: гард ніколи не був би живий у розробці й тестах, а єдина перевірка — найдорожча (ручний прогін). devtools у debug відкриваються з Rust (window.open_devtools() під cfg(debug_assertions)), не через F5/контекстне меню"
  - "Зумом Ctrl+Plus/Minus системний вимикач більше не аргументується: zoomHotkeysEnabled у tauri.conf.json відсутній (дефолт false), тобто зуму зараз немає взагалі — це окремий запис webview-zoom-hotkeys"
---

# Подавити акселератори webview: reload (F5/Ctrl+R), F3/F7/F11, контекстне меню

> **Контекст:** знахідка дослідження [streams-transfer-hotkeys](p2-streams-transfer-hotkeys.md)
> (2026-07-23). F5 у коді ніде не обробляється → сьогодні F5 **мовчки
> перезавантажує webview** (дефолт WebView2): скидається стан UI, фокус, зони —
> для NVDA-користувача це дезорієнтація без жодного оголошення. Запис у Rust
> живе і виживає, але сесія інтерфейсу губиться. Виправляється до того, як
> F5 стане шорткатом «Копіювати в профіль» (звідси `blocks`).
> Ревізія 2026-08-07 (grilling): знято DEV-гейт, зафіксовано `preventDefault`-only,
> додано обов'язковий прогін прод-збірки, зум винесено окремо.

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
3. **Однаково в усіх режимах:** режимних гілок немає — ні `import.meta.env.DEV`,
   ні іншого перемикача (див. «Прийняті рішення» §3).

Решта акселераторів (Ctrl+P друк тощо) — свідомо поза скоупом: реального
шкідливого ефекту, як у reload/fullscreen, не мають. Системний вимикач
`AreBrowserAcceleratorKeysEnabled = false` (Rust-side через `with_webview` +
`webview2-com`) відхилено: JS-перелік тестований у vitest, не тягне `unsafe`
+ `webview2-com`, і лежить поруч із рештою клавіатурних шарів застосунку.
Переглянути, лише якщо перелік розростеться.

## Прийняті рішення (grilling 2026-08-07)

### 1. `preventDefault()` — так, `stopPropagation()` — ніколи

Сусідній [useGlobalShortcuts.ts](../../src/hooks/useGlobalShortcuts.ts) робить
обидва виклики; скопіювати це сюди — тиха катастрофа. Слухач висить на `window`
у capture-фазі, тобто раніше за все інше: `stopPropagation()` там означає, що
подія не дійде ні до React-дерева, ні до `KeyRecorder`. Наслідок — майбутній
`F5` = «Копіювати в профіль» не спрацює ніколи, а рекордер не запише
`F5`/`F3`/`F7`/`F11` як хоткей.

`preventDefault()` сам по собі безпечний: у `src/` немає **жодної** перевірки
`defaultPrevented`, тож жоден обробник не проігнорує вже погашену подію.

### 2. Зум більше не аргумент проти системного вимикача

Попередня редакція відхиляла `AreBrowserAcceleratorKeysEnabled = false` тим, що
той «вбиває Ctrl+Plus/Minus зум — важливий для слабозорих». Аргумент хибний:
у [tauri.conf.json](../../src-tauri/tauri.conf.json) опції `zoomHotkeysEnabled`
немає, а її дефолт у Tauri v2 — `false`, тобто зуму в застосунку зараз немає
взагалі. Захищати нічого. Вимикач відхилено з інших причин (див. «Опис»), а сам
зум винесено в [webview-zoom-hotkeys](p2-webview-zoom-hotkeys.md).

Практичний наслідок для гарду: `Ctrl+Plus`/`Ctrl+Minus`/`Ctrl+0` у перелік
**не** додавати — щоб після вмикання зуму цей гард не довелося переробляти.

### 3. Жодних режимних гілок (DEV-гейт знято)

Попередня редакція вимикала гард у `import.meta.env.DEV`. Відхилено:

- гард не був би живий ні в розробці, ні в тестах — vitest працює в
  `mode: "test"`, тобто `DEV === true`, і кожен тест мусив би брехати про
  середовище через `vi.stubEnv`;
- регресія (прибрали виклик хука з `App.tsx`, зламався матчер) проявилася б
  тільки на найдорожчому кроці — ручному прогоні прод-збірки з NVDA;
- у `src/` сьогодні **жодного** використання `import.meta.env` — патерн
  заводився б заради одного гарду.

«F5 корисний при розробці» покриває Vite HMR. Devtools у dev не потребують ні
F5, ні контекстного меню: їх відкриває Rust — `window.open_devtools()` під
`#[cfg(debug_assertions)]` у [lib.rs](../../src-tauri/src/lib.rs).

### 4. Розкладка модулів

Повторити наявний поділ «чиста функція + хук» (`lib/shortcuts.ts` ↔
`hooks/useGlobalShortcuts.ts`):

- `src/lib/webviewAccelerators.ts` — чистий предикат по `e.code` + модифікаторах;
  тут же живуть тести, без React;
- `src/hooks/useWebviewGuard.ts` — два слухачі (`keydown` capture + `contextmenu`),
  викликається з `App.tsx` поруч із `useGlobalShortcuts()`.

`useGlobalShortcuts.ts` **не редагується** — попередній `touches:` називав його
помилково.

### 5. F11 — подавити зараз, справжній fullscreen окремо

Справжній повноекранний режим — це не рядок у гарді, а свій стан, оголошення,
повернення фокуса й пункт у F1-довідці. Винесено в
[window-fullscreen-f11](p3-window-fullscreen-f11.md) (P3, unscheduled).

### 6. Контекстне меню зникає й з клавіатури — це задокументувати

`contextmenu` — не лише правий клік: ту саму подію дають клавіша Applications і
`Shift+F10`, тобто основний спосіб незрячого користувача відкрити меню.
Document-level `preventDefault()` вимикає обидва входи скрізь, де немає власного
меню рядка (всередині списків усе гаразд —
[useCompositeList.ts](../../src/hooks/useCompositeList.ts) обробляє всі три
жести). Подавляємо беззастережно поза editable — це передбачуваніше за гілку
«є виділення → лишаємо нативне», а копіювання покриває `Ctrl+C`. Натомість
наслідок фіксуємо в `docs/keyboard-shortcuts.md`, щоб тиша була
задокументованою, а не сюрпризом на прогоні.

## Критерії готовності

- [ ] keydown-гард: `F5`/`Ctrl+F5`/`Shift+F5`/`Ctrl+R`/`Ctrl+Shift+R` +
      `F3`/`F7`/`F11` → `defaultPrevented` (capture-фаза, працює і при
      відкритій модалі); `Ctrl+Plus`/`Ctrl+Minus`/`Ctrl+0` у переліку немає
- [ ] Гард не викликає `stopPropagation()` — регресійний тест: після диспетчу
      `F5` слухач нижче за течією таки отримав подію (§1)
- [ ] `contextmenu` поза editable-елементами подавлено; на `input`/`textarea` —
      нативне меню працює; меню рядків списків не регресує
- [ ] Жодних режимних гілок: `import.meta.env` у новому коді не з'являється;
      тести не стабають середовище
- [ ] `src-tauri/src/lib.rs`: `window.open_devtools()` під `#[cfg(debug_assertions)]`
      (заміна devtools-доступу, який забирає подавлене контекстне меню)
- [ ] Тести: dispatch reload-комбо → `defaultPrevented === true`; `contextmenu`
      на body → prevented, на `input` → ні
- [ ] `docs/keyboard-shortcuts.md`: примітка про подавлені webview-акселератори
      **і** про відсутність контекстного меню поза списками — ні мишею, ні
      Applications/Shift+F10 (§6)
- [ ] `pnpm test` без регресій
- [ ] **NVDA-прогін на прод-збірці** (`pnpm tauri build`, не `dev`) за чеклістом
      `docs/testing/nvda-webview-reload-guard.md`: покнопково F5 / Ctrl+R /
      Shift+F5 / Ctrl+F5 / F3 / F7 / F11 + правий клік і Applications/Shift+F10
      поза списками. Без нього запис не переїжджає в `done/`, а
      [streams-transfer-hotkeys](p2-streams-transfer-hotkeys.md) не розблоковується.
      Прогін проводиться однією сесією прод-збірки разом із чеклістом
      streams-transfer-hotkeys (цей — першим), але приймається **окремим**
      комітом: якщо той прогін упаде, цей запис не має застрягти разом із ним
- [ ] Прогін заміряє й **фактичну** поведінку `F3`/`F7`/`F11` у WebView2; якщо
      котрась інертна — повернути висновок у нотатку про вільні F-клавіші
      [hotkeys-expansion](p2-hotkeys-expansion.md)

## Документи

- Дослідження-джерело: [p2-streams-transfer-hotkeys.md](p2-streams-transfer-hotkeys.md);
  друга хвиля (F3/F7/F11, Ctrl+F у диспетчері): [p2-hotkeys-expansion.md](p2-hotkeys-expansion.md)
- Відгалуження цього запису: [p2-webview-zoom-hotkeys.md](p2-webview-zoom-hotkeys.md) (§2),
  [p3-window-fullscreen-f11.md](p3-window-fullscreen-f11.md) (§5)
- Код: `src/App.tsx`, `src/hooks/useGlobalShortcuts.ts` (сусідній прецедент
  capture-listener'а, **не редагується**), `src/lib/shortcutGuard.ts`
  (`isInModal` — тут НЕ вживати), `src/hooks/useCompositeList.ts` (меню рядка)
- [Tauri discussion #3844 — How to disable pressing F5](https://github.com/tauri-apps/tauri/discussions/3844)
  (підтверджено мейнтейнером: `addEventListener` + `preventDefault`; меню — окремо)
- [WebView2 `AreBrowserAcceleratorKeysEnabled`](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2settings.arebrowseracceleratorkeysenabled)
  — рівень WebView2, у Tauri v2 не експонований (для довідки)
