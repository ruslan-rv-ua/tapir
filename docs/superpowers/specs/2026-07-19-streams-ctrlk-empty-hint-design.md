# Бейдж-підказка `Ctrl+K` у порожньому стані Streams — дизайн

- **Дата:** 2026-07-19
- **Гілка:** `feature/streams-ctrlk-empty-hint` (від `develop`)
- **Джерела:** [беклог `p2-streams-ctrlk-empty-hint`](../../backlog/done/p2-streams-ctrlk-empty-hint.md),
  [ADR 2026-05-31 «Командна палітра і пошук/фільтр»](../../decisions/2026-05-31-command-palette-and-search-ux.md) §6 (S3, конкретна зміна #3), §7

## 1. Задача

ADR §6 ухвалив для екрана Streams дві зчеплені зміни: **S2** — прибрати видиму кнопку
«Команди» (зроблено) і **S3** — натомість показувати приглушений `kbd`-бейдж `Ctrl+K`
у порожньому стані (не зроблено). Реалізували лише S2, тож `Ctrl+K` на Streams зараз
не виявний ніде, крім F1-довідки. Уся a11y-аргументація S4 (відмова від
`aria-keyshortcuts` і від перемикача в Settings) трималася саме на тому, що
відкривність несе порожній стан.

Мета: додати бейдж, довести до протестованого коду, закрити S3.

## 2. Рішення

### 2.1 Розмітка

У гілці `isEmpty` порожнього стану
([StreamsPanel.tsx:669-687](../../../src/components/streams/StreamsPanel.tsx#L669-L687)),
**після** кнопки CTA «Додати приклади потоків»:

```jsx
<p className="text-xs text-slate-500 forced-colors:text-[ButtonText]">
  {m.streams_empty_palette_hint()}{" "}
  <kbd className="rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 font-mono text-slate-300 forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]">
    {PALETTE_COMBO}
  </kbd>
</p>
```

### 2.2 Текст і джерело комбінації

- i18n-ключ `streams_empty_palette_hint` — **лише підпис**: `"Команди —"` / `"Commands —"`.
- Сама комбінація **не локалізується** і не хардкодиться в компоненті: береться з
  `SHORTCUTS` ([shortcuts.ts](../../../src/lib/shortcuts.ts), запис `id: "command-palette"`,
  `combo: "Ctrl+K"`) — того самого масиву, що живить F1-довідку. Так бейдж і довідка
  не розійдуться, якщо комбінацію колись змінять.
- `PALETTE_COMBO` — модульна константа в `StreamsPanel.tsx`:
  `SHORTCUTS.find((s) => s.id === "command-palette")?.combo ?? "Ctrl+K"` (фолбек, щоб
  відсутність запису не ламала рендер порожнього стану).
- Підсумок для NVDA: «Команди — Ctrl+K» — користувач чує і **що** це, і **як** викликати.

### 2.3 Доступність

- Не Tab-стоп: звичайні `<p>` + `<kbd>`, без `tabIndex`, без `role`, без `aria-*`.
- Читається NVDA природно, у порядку читання, одразу після CTA.
- Roving-focus тулбара (`toolbarRefs`) і зона `streams-empty` (фокусує
  `addExamplesBtnRef`) **не змінюються**.
- `forced-colors` — як у сусідніх елементах порожнього стану.

### 2.4 Обсяг

Лише порожній профіль. Filter-empty стан
([StreamsPanel.tsx:688-704](../../../src/components/streams/StreamsPanel.tsx#L688-L704))
не чіпаємо: ADR §7 відкинув «бейдж завжди видимий / біля заголовка» на користь
«лише порожній стан», і там уже є власний CTA «Скинути фільтр».

Рушій `Ctrl+K` ([App.tsx](../../../src/App.tsx)) не чіпаємо — працює глобально.

## 3. Тести (TDD, `StreamsPanel.test.tsx`)

1. Бейдж рендериться в порожньому стані й містить комбінацію з `SHORTCUTS`.
2. Бейдж не фокусується: не з'являється серед `role="button"`, не має `tabindex`.
3. Зона `streams-empty` при фокусуванні досі веде на кнопку прикладів (регресія).
4. Бейджа немає у filter-empty стані.

## 4. Гейти

- `pnpm test` — зелений.
- `pnpm vite:build` — зелений.
- i18n генерується vite-плагіном paraglide; згенеровані файли вручну не правимо.
- Після завершення — оновити критерії готовності в записі беклогу (запис можна
  видалити, історія лишається в git).
