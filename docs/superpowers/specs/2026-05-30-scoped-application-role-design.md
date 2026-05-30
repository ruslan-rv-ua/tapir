# Scoped `role="application"` — Design

> **Дата:** 2026-05-30
> **Гілка:** `feat/a11y-scope-application-role`
> **Стандарти:** WAI-ARIA `application` role best practices (MDN, ADG), WCAG 2.1 AA (desktop)
> **Скрінрідер мішень:** NVDA (browse mode / focus mode), WebView2

---

## 1. Проблема

Кореневий контейнер усього застосунку має глобальний `role="application"`:

```html
<!-- index.html:10 -->
<div id="root" role="application" aria-label="Tapir"></div>
```

`role="application"` на корені змушує NVDA **постійно** перебувати у focus (application) mode по всьому застосунку. Наслідки:

- Browse mode (віртуальний курсор) вимкнено скрізь — не працює навігація по лендмарках (`D`/`;`), ускладнене читання статичного тексту й оголошень.
- Лендмарки (`banner`/`navigation`/`main`/`contentinfo`/`complementary`) та структурні ролі (`list`, `toolbar`) фактично невидимі для AT, хоча їх навмисно побудовано.
- Це прямо суперечить best-practice: `role="application"` **ніколи** не ставлять на `<body>`/корінь — лише на найменший потрібний контейнер навколо складного віджета (MDN, Accessibility Developer Guide).

## 2. Мета

Привести застосунок до стандартного **гібридного** режиму NVDA:

- **browse mode** — на лендмарках, статичному тексті, оголошеннях, нативних формах і порожніх станах;
- **focus mode** — автоматично всередині інтерактивних віджетів зі стрілковою навігацією.

Це **не** «browse mode всюди» (це зламало б стрілкову навігацію, бо NVDA у browse mode перехоплює стрілки) і **не** «application всюди» (поточний стан). Application mode скоупиться до зон, яким він технічно потрібен.

## 3. Класифікація зон

У застосунку 13 зон (`data-zone-id`). Класифікація за навігаційною моделлю:

### 3.1. Стрілкова JS-навігація → ПОТРЕБУЮТЬ `role="application"`

Ці зони обробляють `ArrowUp/Down/Left/Right` через власні JS-обробники (`useCompositeList` / roving `onKeyDown`). У browse mode NVDA з'їдає стрілки → навігація зламається. Тому focus mode тут обов'язковий.

| Зона | Елемент / поточна роль | Механізм |
|---|---|---|
| `streams-list` | `<ul role="list">` ([StreamList.tsx:83](../../../src/components/streams/StreamList.tsx)) | Заміна ролі |
| `songs-list` | `<ul role="list">` ([SongsList.tsx:59](../../../src/components/songs/SongsList.tsx)) | Заміна ролі |
| `browser-results` | `<ul role="list">` ([StationList.tsx:77](../../../src/components/browser/StationList.tsx)) | Заміна ролі |
| `wishlist-list` | `<ul role="list">` ([PatternList.tsx:80](../../../src/components/wishlist/PatternList.tsx)) | Заміна ролі |
| `streams-toolbar` | `<div role="toolbar">` ([StreamsPanel.tsx:303](../../../src/components/streams/StreamsPanel.tsx)) | Заміна ролі |
| `activity-bar` | `<nav>` (navigation landmark) ([ActivityBar.tsx:64](../../../src/components/layout/ActivityBar.tsx)) | Вкладений wrapper |
| `status-bar` | `<footer>` (contentinfo landmark) ([StatusBar.tsx:95](../../../src/components/layout/StatusBar.tsx)) | Вкладений wrapper |

### 3.2. Нативна Tab-навігація → ЛИШАЮТЬСЯ в browse mode (без змін)

Ці зони використовують `useFocusBoundary` — нативний Tab між кількома контролами, без стрілкового roving. Tab працює в browse mode; нативні контроли (`input`/`select`/`button`) самі вмикають focus mode у NVDA при фокусуванні. `role="application"` тут шкідливий (зайве придушення browse mode).

- `browser-search` (`useFocusBoundary`)
- `songs-filter` (`useFocusBoundary`)
- `wishlist-controls` (`useFocusBoundary`)

### 3.3. Статичні / вже зроблені

- `streams-empty`, `streams-filter-empty` — статичний текст; browse mode корисний → без змін.
- `player` — уже має inner `role="application"` ([PlayerPanel.tsx:198](../../../src/components/player/PlayerPanel.tsx)); еталонний прецедент, без змін.

### 3.4. Корінь

- `#root` ([index.html:10](../../../index.html)) — прибрати `role="application"`, лишити `aria-label="Tapir"`.

## 4. Два механізми застосування

### 4.1. Заміна ролі (списки + тулбар)

На тому самому елементі змінити `role="list"` / `role="toolbar"` → `role="application"`. Усе інше (`aria-label`, `data-zone-id`, `onKeyDownCapture`/`onKeyDown`, `ref`/`listRef`, класи, діти) — без змін. Жодних нових DOM-вузлів.

**Обґрунтування:** ці елементи не є лендмарками; під focus mode `role="list"`/`role="toolbar"` усе одно невидимі для AT, тож заміна нічого не втрачає й уникає зайвого wrapper'а. `aria-label` зберігається й стає назвою application-регіону.

```diff
- <ul role="list" data-zone-id="streams-list" aria-label={m.zone_streams_list()} ...>
+ <ul role="application" data-zone-id="streams-list" aria-label={m.zone_streams_list()} ...>
```

### 4.2. Вкладений wrapper (лендмарки nav / footer)

Зовнішній елемент лишається лендмарком (`<nav>` = navigation, `<footer>` = contentinfo), щоб NVDA міг дістатися до нього в browse mode (`D`/`;`). Всередину додається обгортка `<div role="application" className="contents">` навколо всіх фокусованих дітей. Це точний прецедент плеєра ([PlayerPanel.tsx:197-203](../../../src/components/player/PlayerPanel.tsx)).

```diff
  <nav ref={navRef} aria-label={m.main_navigation()} data-zone-id="activity-bar"
       className="flex w-56 flex-col gap-1 ..." onKeyDown={onKeyDown}>
+   <div role="application" aria-label={m.main_navigation()} className="contents">
      {SECTIONS.map(...)}
+   </div>
  </nav>
```

**Деталі:**
- `className="contents"` (`display:contents`) — wrapper прозорий для CSS-layout; flex/grid-діти лишаються прямими учасниками розкладки. (Перевірений прийом плеєра.)
- `onKeyDown` лишається на зовнішньому `<nav>`/`<footer>` — keydown-події спливають від фокусованих дітей через wrapper. Roving-логіка недоторкана.
- `data-zone-id`, `ref` лишаються на зовнішньому елементі — `useZoneNavigation` (`closest('[data-zone-id]')`) не зачеплено.
- `aria-label` wrapper'а: для `activity-bar` — `m.main_navigation()` (реюз). Для `status-bar` — `m.zone_status()` (вже існує й використовується для оголошення зони на вході). Нові i18n-ключі не потрібні.

## 5. Чому навігація не ламається

- Змінюються **лише ARIA-ролі** (атрибути). Обробники клавіатури, roving-стан, `tabIndex`, `data-segment`, focus-логіка — без змін.
- Усередині `role="application"` NVDA у focus mode → стрілки доходять до JS-обробників так само, як зараз доходять через глобальний application. Поведінка ідентична поточній.
- Нативні Tab-зони (§3.2) і так працювали б у browse mode (Tab проходить; нативні контроли авто-перемикають focus mode).
- Лендмарки (§4.2) лишаються в DOM/a11y-дереві поза application-піддеревом → browse-навігація по них відновлюється.

## 6. Тестування

### 6.1. Автоматичні (jsdom / Testing Library)

- **Оновити** наявні тести, що очікують замінені ролі: `StreamList.test.tsx`, `StatusBar.test.tsx`, `useCompositeList.test.tsx` (та будь-які запити `getByRole('list'|'toolbar')` у зачеплених зонах).
- **Додати** перевірки:
  - кожна зона §3.1 має `role="application"` (на елементі або як нащадок-wrapper);
  - `activity-bar` `<nav>` зберігає роль `navigation` **і** містить нащадка `role="application"`;
  - `status-bar` `<footer>` зберігає роль `contentinfo` **і** містить нащадка `role="application"`;
  - зони §3.2 (`browser-search`, `songs-filter`, `wishlist-controls`) **не** містять `role="application"`.
- Стрілкова навігація у `useCompositeList.test.tsx` має проходити без змін (регресійна гарантія для roving-логіки).

### 6.2. Ручний чеклист NVDA (поза CI)

Перевірити з живим NVDA + WebView2:

1. Старт застосунку → фокус на Activity Bar → NVDA у focus mode, стрілки Up/Down перемикають секції.
2. `D` (next landmark) у browse mode проходить по `navigation` → `main` → `complementary` (player) → `contentinfo` (status).
3. У кожному списку (streams/songs/browser/wishlist): стрілки рухають roving-фокус, Enter/Space/Delete/контекст-меню працюють.
4. `browser-search` / `songs-filter`: Tab між контролами, поля вводу читаються й редагуються (focus mode авто), мітки озвучуються.
5. Порожні стани (`streams-empty`) читаються віртуальним курсором у browse mode.
6. Esc виходить із focus mode у списках (доступно, бо це не application на корені).
7. Немає «застрягання» фокуса; F6/Shift+F6 циклює зони.

## 7. Поза скоупом (YAGNI)

- Перехід композиційних списків на семантику `role="grid"`/`listbox` (варіант B) — не робимо; суперечить FRD і несе високий ризик.
- Будь-які зміни roving-логіки, zone-навігації чи layout.
- Автоматизоване тестування режимів NVDA (browse/focus) — технічно неможливе в jsdom; покривається ручним чеклистом.

## 8. Зачеплені файли

| Файл | Зміна |
|---|---|
| `index.html` | Прибрати `role="application"` з `#root` |
| `src/components/streams/StreamList.tsx` | `role="list"` → `role="application"` |
| `src/components/songs/SongsList.tsx` | `role="list"` → `role="application"` |
| `src/components/browser/StationList.tsx` | `role="list"` → `role="application"` |
| `src/components/wishlist/PatternList.tsx` | `role="list"` → `role="application"` |
| `src/components/streams/StreamsPanel.tsx` | `role="toolbar"` → `role="application"` (streams-toolbar) |
| `src/components/layout/ActivityBar.tsx` | Вкладений `role="application"` wrapper |
| `src/components/layout/StatusBar.tsx` | Вкладений `role="application"` wrapper (`aria-label={m.zone_status()}`) |
| Відповідні `*.test.tsx` | Оновити/додати перевірки (§6.1) |
