# Design: спільна картка-обгортка списків (ListCard) — Етап 1

> Статус: approved
> Дата: 2026-06-03
> Гілка: `refactor/composite-list-shell`
> Пов'язане: [FRD-navigation.md](../../FRD-navigation.md), [composite-list-shell-design](2026-06-03-composite-list-shell-design.md)

## 1. Контекст і мета

Усі п'ять спискових екранів уже використовують один механізм навігації (`CompositeList` з roving-фокусом). Але **візуальне** оформлення контейнера списку розійшлося на три варіанти:

- **Картка** (рамка + заокруглені кути + фон + поля навколо) — лише Потоки;
- **Лише поля** (`px-4 py-3`, без рамки) — лише Профілі;
- **Впритул** (на всю ширину, без рамки й полів) — Браузер, Пісні, Вішліст.

Розмітка картки Потоків живе інлайном у `StreamsPanel` ([StreamsPanel.tsx:354-356](../../../src/components/streams/StreamsPanel.tsx#L354)).

**Мета Етапу 1:** звести всі п'ять екранів до **єдиного вигляду контейнера** («картка», як у Потоків) через спільний компонент, не чіпаючи навігацію. Це прибирає візуальний drift і дає одне джерело правди для рамки.

Користувач підтвердив: повідомлення про порожній/завантаження/помилку показуються **всередині** картки (рамка видима завжди), центровані по обох осях.

## 2. Поза межами (не входить в Етап 1)

- Колонки та заголовки колонок (це Етап 2). Наявні колонки Потоків переїжджають усередину `ListCard` **без змін**.
- Будь-які зміни навігації, зон, roving-фокуса, a11y-семантики елементів списку.
- Metrics-bar і тулбари над списком.
- Командна палітра, діалоги, інші поверхні.

## 3. Компоненти

Обидва — у новому файлі `src/components/common/ListCard.tsx`. Суто презентаційні, без стану, без впливу на навігацію.

### 3.1. `ListCard`

Обрамлений контейнер, що заповнює залишок висоти й кліпує overflow. Скрол лишається на `<ul>` всередині (CompositeList зі своїм `flex-1 overflow-*`).

```tsx
import type { ReactNode } from "react";

/**
 * Shared framed container for every list screen: outer padding + a rounded,
 * bordered card that fills remaining height and clips overflow. The list's own
 * scroll lives on its <ul> (CompositeList) inside. Visual only — does not affect
 * zone / roving navigation. See docs/FRD-navigation.md.
 */
export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden px-4 py-3">
      <div className={
        "flex flex-1 flex-col overflow-hidden rounded-[18px] border border-slate-700/60 bg-white/[.02] forced-colors:border-[ButtonText]"
        + (className ? " " + className : "")
      }>
        {children}
      </div>
    </div>
  );
}
```

Класи дослівно ті, що зараз інлайном у Потоків. `className` — запас на майбутні винятки (рідко).

### 3.2. `ListCardState`

Центроване повідомлення для не-наповнених станів (empty / loading / error) всередині `ListCard`.

```tsx
import type { ReactNode, HTMLAttributes } from "react";

/** Centered message shown inside a ListCard for empty / loading / error states. */
export function ListCardState(
  { children, className, ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>,
) {
  return (
    <div
      {...rest}
      className={"flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center text-sm " + (className ?? "text-slate-500")}
    >
      {children}
    </div>
  );
}
```

- Центрування по обох осях (`flex-1 items-center justify-center`) — як filter-empty Потоків.
- `...rest` пропускає `role` / `aria-live` / `aria-label`; кожне місце зберігає власну a11y-семантику.
- Колір тексту — через `className` (типовий `text-slate-500`; loading — `text-slate-400`; error — `text-red-400`).

## 4. Інтеграція по екранах

Скрол усюди лишається на `<ul>` CompositeList (`flex-1 overflow-*`); `ListCard` лише кліпує.

| Екран | Файл | Зміна контейнера | Стани |
| --- | --- | --- | --- |
| Потоки | `StreamsPanel.tsx` | Дві вкладені `<div>` (pad + картка, рядки 354-356) → `<ListCard>`. Колонки + список + filter-empty лишаються всередині. | filter-empty (окрема фокусована зона з кнопкою) лишається **як є**; у `ListCardState` не переноситься |
| Профілі | `ProfilesPanel.tsx` | `<div className="…px-4 py-3">` (рядок 235) → `<ListCard>`. Отримує рамку. | немає (профілів завжди ≥1) |
| Браузер | `BrowserPanel.tsx`, `StationList.tsx` | `<StationList>` загорнути в `<ListCard>`. `<h2>Популярні станції</h2>` лишається **над** карткою (секційний підзаголовок). | у `StationList`: loading/error/empty → `ListCardState` (×3) |
| Вішліст | `WishlistPanel.tsx`, `PatternList.tsx` | Кожен `<PatternList>` у двох `<TabPanel>` → у `<ListCard>`. | у `PatternList`: empty-слот → `ListCardState` (×1) |
| Пісні | `SongsPanel.tsx` | Загорнути весь блок (повідомлення + `<SongsList>`) у `<ListCard>`. **API `SongsList` не чіпаємо.** | 3 `<p>` (loading/error/empty) → `ListCardState` (×3) |

Разом: 7 не-наповнених станів переходять на `ListCardState`.

## 5. Граничні випадки та ризики

- **Висота/flex:** `ListCard` — `flex flex-1 flex-col overflow-hidden`. Батьківські контейнери всіх п'яти екранів уже `flex flex-1 flex-col`, тож картка заповнює залишок висоти. Перевірити ланцюг flex на кожному екрані під час реалізації.
- **`ListCardState` всередині CompositeList:** CompositeList рендерить стан **замість** `<ul>`, тож стан стає прямим flex-нащадком внутрішнього `<div>` `ListCard` → `flex-1` центрує по вертикалі. Для Пісень стан рендериться в панелі прямо в `ListCard` — так само прямий нащадок.
- **High Contrast:** `ListCard` має `forced-colors:border-[ButtonText]`, тож рамка видима у Windows High Contrast.
- **Браузер «Популярні станції»:** `<h2>` поза карткою показується лише в режимі популярних (не під час пошуку) — поведінка без змін, просто тепер над карткою.
- **Низький ризик:** усе презентаційне; жодних змін у логіці, навігації чи store.

## 6. Перевірка

- **Автоматичні гейти:** `pnpm test` (очікувано 154 passed) + `pnpm vite:build`. Існуючі тести не перевіряють картку, тож мають лишитися зеленими без правок.
- **Ручна (виконує користувач):** збірка + запуск, перегляд усіх п'яти екранів — повні списки, порожні/завантаження/помилка стани, Windows High Contrast.
- Нові юніт-тести не потрібні (компоненти суто візуальні).

## 7. Наступний крок

Етап 2 (окрема спека): слоти `ListCard` під заголовки колонок і колонкові рядки там, де дані табличні (Пісні, частково Вішліст); Браузер/Профілі — рішення після перегляду вживу.
