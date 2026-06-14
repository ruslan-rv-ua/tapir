# Спека: «Копіювати URL» для списку потоків

- **Дата:** 2026-06-14
- **Тип:** дизайн фічі (spec) — додавання дії копіювання URL потока в буфер обміну
- **Статус:** затверджено, готово до writing-plans
- **Пов'язані ADR:**
  [context-aware keyboard shortcuts](../../decisions/2026-06-02-context-aware-keyboard-shortcuts.md),
  [shortcut configurability asymmetry](../../decisions/2026-06-07-shortcut-configurability-asymmetry.md)

## Мета

На екрані потоків додати копіювання адреси (`StreamInfo.url`) сфокусованого
потока в буфер обміну, двома узгодженими входами:

1. Пункт контекстного меню рядка — **«Копіювати URL»**.
2. List-scoped гаряча клавіша **Ctrl+C** — спрацьовує лише коли фокус усередині
   списку потоків.

Плюс доко-гігієна: зафіксувати тригер майбутнього рефакторингу там, де він
спрацює (друга вісь list-scoped дій), бо домовлено робити це **разом** із фічею,
а не окремою спекулятивною задачею.

## Контекст (поточний стан коду)

- `url` уже є в моделі: [`StreamInfo.url`](../../../src/lib/tauri.ts) — копіюємо
  його напряму, окремий IPC/Rust-команда **не потрібні**.
- Буфера обміну в проєкті ще ніде не використовують: немає ні
  `navigator.clipboard`, ні `@tauri-apps/plugin-clipboard-manager`
  (відсутній у `package.json` та `src-tauri`).
- Контекстне меню рядка — `src/components/streams/StreamContextMenu.tsx`
  (react-aria `Menu`/`MenuItem`, диспетч через `handleAction(key)`), уже має
  колбек-пропси штибу `onCopyToProfile`, `onDelete` і icon `Copy` з lucide-react.
- Список — `src/components/streams/StreamList.tsx`; рядок —
  `src/components/streams/StreamItem.tsx`; обидва вже мають `useAnnounce`.
- Клавіатура списку — `src/hooks/useCompositeList.ts`: `onKeyDownCapture`
  (capture-фаза) емітить generic-екшени `onAction(type, itemId, segment, mods)`
  з типами `'primary' | 'toggle' | 'delete'`; `Shift+F10`/праве-клік/`Menu`
  опрацьовує `onContextMenu`. Є `activeItemId`, `modifiers(e)`.
- Реєстр шорткатів — `src/lib/shortcuts.ts`: чисте джерело правди для F1-help і
  `RESERVED_WEBVIEW_COMBOS`. Записи з `match` диспетчаться централно в App.tsx
  через `src/hooks/useGlobalShortcuts.ts` (capture на window); записи без `match`
  (`row-menu` Shift+F10, `row-listen` Shift+Enter, `row-record` Ctrl+Enter)
  обробляються власними хуками й присутні лише для довідки + reserved-guard.

## Ключові архітектурні рішення

### Р1. Буфер обміну — `navigator.clipboard.writeText`

Використовуємо `await navigator.clipboard.writeText(stream.url)`. Працює в
WebView2 (контекст застосунку безпечний), не додає залежності, відповідає
«webview-рівню» дії. Плагін `@tauri-apps/plugin-clipboard-manager`
**не** вводимо — це зайвий шар (npm + Cargo + capability) для цього кейса.

Уся логіка — один хелпер у `StreamList.tsx`, перевикористаний обома входами:

```ts
const copyStreamUrl = async (stream: StreamInfo) => {
  try {
    await navigator.clipboard.writeText(stream.url);
    addToast(m.stream_url_copied({ name: stream.name }), "info");
    announce(m.stream_url_copied({ name: stream.name }), "polite");
  } catch (err) {
    addToast(String(err), "error");
  }
};
```

`StreamList` уже має `addToast` та `announce` (`useAnnounce`), тож хелпер живе
саме тут — як єдина точка для toast + a11y-оголошення.

### Р2. Ctrl+C — list-scoped, НЕ глобальний реєстровий шорткат

На відміну від `Ctrl+N` (Tier 2, гейт на `$activeSection`), `Ctrl+C` **колізує
з копіюванням тексту**. Якби ми додали його в реєстр із `match` +
`when: activeSection === "streams"`, він перехоплював би Ctrl+C у будь-якому
текстовому полі секції. Тому Ctrl+C обробляється **в `useCompositeList`**, поряд
із `Delete` — там, де клавіша спрацьовує лише коли фокус усередині списку
(`role=application`, текстових полів нема). Це «list»-вісь (як
`row-menu`/`row-listen`/`row-record`), а не Tier 2.

Механіка зберігає generic-природу хука (його шарять кілька списків): емітимо
generic-екшен `"copy"`, а конкретику (копіювання саме URL) робить споживач.

### Р3. Реєстр — лише довідка + reserved-guard (без `match`)

`Ctrl+C` додаємо в `shortcuts.ts` як запис групи `"list"` **без `match`** —
точно як `row-menu`. Це: (а) показує комбо в F1-довідці; (б) включає його в
`RESERVED_WEBVIEW_COMBOS`, тож KeyRecorder не дасть призначити OS-глобальний
Tier-1 хоткей на Ctrl+C (запобіжник з ADR 2026-06-07). Central dispatcher
(`useGlobalShortcuts`) запис без `match` не чіпає — подія доходить до
capture-хендлера списку.

Нюанс (свідомо приймаємо): F1-help групує його під «list» загалом, хоча реально
дія працює тільки в потоках — узгоджено з тим, як уже подані `row-listen`/
`row-record`.

## Зміни по файлах

### `src/hooks/useCompositeList.ts`

У `onKeyDownCapture`, **перед** `switch (e.key)` (бо switch — на `e.key`, а для
літери на кирилиці треба `e.code`; конвенція accessibility.md §12), додати:

```ts
// Ctrl/Cmd+C → generic "copy" для активного рядка (споживач вирішує, що копіювати).
if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === "KeyC") {
  consume();
  onActionRef.current("copy", activeItemId, activeSegment, modifiers(e));
  return;
}
```

Розширити union типу екшена `onAction`: `... | "copy"`.

Колокований коментар-тригер (доко-гігієна) поряд із union/switch:
> 2 хардкод list-дії (Delete, Ctrl+C). На 3-4-ту — винести key→actionType в
> таблицю замість розсипу `if`/`switch`.

### `src/components/streams/StreamList.tsx`

- Додати хелпер `copyStreamUrl` (див. Р1).
- У `onAction`: на початку додати
  `if (type === "copy") { const s = streams.find((x) => x.id === itemId); if (s) copyStreamUrl(s); return; }`.
- У `renderRow` передати в `StreamItem` новий проп
  `onCopyUrl={() => copyStreamUrl(stream)}`.

### `src/components/streams/StreamItem.tsx`

- Додати в `Props` поле `onCopyUrl: () => void`.
- Прокинути його в `<StreamContextMenu onCopyUrl={onCopyUrl} … />`
  (дзеркало `onCopyToProfile`).

### `src/components/streams/StreamContextMenu.tsx`

- Додати в `Props` поле `onCopyUrl: () => void`.
- Імпортувати icon, відмінний від уже зайнятого `Copy` (наприклад `Link` або
  `ClipboardCopy` з lucide-react).
- Додати `<MenuItem id="copy-url">` з цим icon і текстом `m.copy_url()`
  (розмістити логічно — біля «copy-to-profile» або першим пунктом).
- У `handleAction` додати `case "copy-url": onCopyUrl(); break;`.

### `src/lib/shortcuts.ts`

Додати в масив `SHORTCUTS` (група list):

```ts
{ id: "copy-url", combo: "Ctrl+C", label: m.copy_url, group: "list", reserved: true },
```

(Без `match` і без `when` — обробляється `useCompositeList`.)

### i18n (paraglide)

Додати повідомлення:
- `copy_url` — текст пункту меню / label у довідці. Напр.: «Копіювати URL».
- `stream_url_copied` — toast + announce, з параметром `{name}`. Напр.:
  «Адресу потока «{name}» скопійовано».

Регенерувати через vite-plugin (не редагувати згенероване вручну).

### Документація / тригери

- Коментар у `useCompositeList.ts` (див. вище) — основне місце, бо там
  стоятиме розробник, коли тригер спрацює.
- Один рядок у секцію «## Коли переглянути»
  [ADR 2026-06-07](../../decisions/2026-06-07-shortcut-configurability-asymmetry.md):
  зафіксувати **list-вісь** (наразі обидва ADR описують лише Tier 2 /
  глобальний реєстр): «list-група в `useCompositeList` розростається (3-4+
  key→action) → винести в таблицю key→actionType».

## Поза обсягом (YAGNI)

- **Не** виокремлюємо `useContextualShortcuts` — реєстр `shortcuts.ts` уже є цією
  абстракцією в узагальненій формі; поріг (ріст Tier 2) не досягнуто.
- **Не** робимо key→actionType таблицю в `useCompositeList` — на двох діях
  (Delete, Ctrl+C) це передчасно; залишаємо коментар-тригер.
- **Не** вводимо плагін буфера обміну й окрему Rust-команду.
- **Не** робимо Ctrl+C конфігуровним (Tier 2/2′ — хардкод за ADR 2026-06-07).

## Критерії приймання

1. Фокус на рядку потока → **Ctrl+C** копіює `url` цього потока; з'являється toast
   і polite-оголошення; у текстовому полі поза списком Ctrl+C поводиться як
   звичайне копіювання (не перехоплене).
2. Контекстне меню рядка містить **«Копіювати URL»**; активація копіює той самий
   `url` з тим самим toast/оголошенням.
3. Помилка запису в буфер → error-toast, без падіння.
4. F1-довідка показує `Ctrl+C` у групі list; KeyRecorder відхиляє призначення
   OS-глобального хоткея на Ctrl+C.
5. Кирилична розкладка не ламає Ctrl+C (перевірка через `e.code`).
6. `pnpm test` і `pnpm vite:build` — зелені.

## План тестів (гейти: `pnpm test` + `pnpm vite:build`, НЕ `tsc`)

- `useCompositeList.test.tsx`: Ctrl+C з активним рядком → `onAction("copy", …)`;
  Ctrl+C без активного айтема → нічого (дзеркало наявного тесту для bare F10).
- `StreamContextMenu.test.tsx`: пункт «Копіювати URL» присутній; клік/активація →
  виклик `onCopyUrl`.
- `StreamList`/`StreamItem` тест: мок `navigator.clipboard.writeText`; «copy»-екшен
  і пункт меню викликають запис із правильним `url` + toast/announce.
- `useGlobalShortcuts.test.tsx`: Ctrl+C **не** дає хіта в central dispatcher.
