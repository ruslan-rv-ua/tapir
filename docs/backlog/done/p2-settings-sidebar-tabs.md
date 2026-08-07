---
slug: settings-sidebar-tabs
title: "Налаштування — вертикальні вкладки в бічній панелі (як у HelpDialog)"
priority: P2
type: planned
status: done
effort: S
kind: feature
target: 0.1.0
updated: 2026-08-07
completed: 2026-08-07
a11y: true
depends_on: []
blocks: []
touches:
  - src/components/settings/SettingsDialog.tsx
  - src/components/settings/SettingsDialog.test.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
gates: [pnpm test, pnpm vite:build]
notes:
  - "NVDA НЕ озвучує aria-orientation (JAWS — так; NVDA/VoiceOver — ні; w3c/aria-practices#2281) — користувач не дізнається, що таблист вертикальний"
  - "React Aria знімає цей ризик: у vertical-режимі ←/→ теж працюють як prev/next (TabsKeyboardDelegate.getKeyLeftOf/RightOf без orientation-guard; перевірено в коді @react-aria/tabs 3.11.1) — фактично модель «подвоєних стрілок» Bootstrap. У horizontal-режимі ↑/↓ мертві"
  - "aria-orientation=\"vertical\" RAC виставляє автоматично (useTabList)"
  - "Зараз 4 вкладки; кандидати на зростання: lastfm-scrobbling (окрема вкладка/секція), recording-stats — вертикальна панель масштабується краще (HelpDialog уже має 7)"
---

# Налаштування — вертикальні вкладки в бічній панелі (як у HelpDialog)

> **Контекст:** дослідження проведено 2026-07-23, рішення — **«так»**.
> SettingsDialog переходить на вертикальні вкладки ліворуч за зразком
> HelpDialog. Обсяг мінімальний, ризики для NVDA зняті (див. notes і
> «Результат дослідження» нижче).

## Опис

`SettingsDialog` має 4 вкладки (Загальні, Запис, Відтворення, Гарячі клавіші)
горизонтальним рядком зверху; `HelpDialog` — 7 вкладок вертикально ліворуч
(`orientation="vertical"`). Два структурно однакові діалоги (та сама оболонка
ModalOverlay/Modal 80vh/max-w-3xl) з різною орієнтацією вкладок — різні
ментальні моделі для користувача NVDA без видимої причини. Уніфікуємо за
зразком HelpDialog.

Обсяг змін — лише [SettingsDialog.tsx](../../../src/components/settings/SettingsDialog.tsx) (~10 рядків, без змін логіки):

1. `<Tabs>`: додати `orientation="vertical"`, у className `flex-col` → рядковий
   flex (`flex flex-1 overflow-hidden`).
2. `<TabList>`: класи з HelpDialog — `flex w-48 flex-col gap-1 overflow-y-auto
   border-r border-slate-700 px-2 py-4`.
3. `TAB_CLS`: `border-b-2` → `rounded border-l-2` + `text-left` (як у
   HelpDialog).
4. `TabList` дістає власну мітку `settings_sections_label` («Розділи
   налаштувань» / «Settings sections») замість повторного `settings_title` —
   симетрично до `help_sections_label` у HelpDialog. У бічній панелі таблист
   стає окремою зоною, і мітка, тотожна заголовку діалогу, змушує NVDA двічі
   поспіль вимовити «Налаштування».

## Критерії готовності

- [x] `SettingsDialog` використовує `orientation="vertical"` у React Aria `Tabs`
- [x] Вертикальна бічна панель стилізована аналогічно `HelpDialog`
- [x] Навігація ↑/↓ між вкладками (автоматично від RAC)
- [x] ←/→ на вертикальному таблисті теж переходять між вкладками — страхування
      для NVDA, який не озвучує орієнтацію (поведінка вбудована в RAC,
      перевірити прогоном)
- [x] `TabList` має власну мітку `settings_sections_label`, відмінну від
      `settings_title`
- [x] `SettingsDialog.test.tsx` фіксує `aria-orientation="vertical"`, окрему
      мітку таблиста і рух вибору всіма чотирма стрілками
- [x] NVDA: вкладки озвучуються коректно («вкладка, N з 4»); активна вкладка =
      `aria-selected="true"`
- [x] NVDA-прогін проведено 2026-08-07, усі 5 сценаріїв пройдено, зауважень
      немає (чекліст видалено при прийманні)
- [x] `pnpm test` без регресій

## Результат дослідження (2026-07-23)

1. **Чи краще для NVDA?** Прямої переваги напрямку немає, але: NVDA не
   озвучує `aria-orientation` (JAWS озвучує; NVDA/VoiceOver — ні), тож
   зміна клавіш без попередження — головний ризик вертикальних вкладок
   узагалі. Для React Aria ризик знятий: у vertical-режимі працюють **усі
   чотири стрілки** (←/→ як prev/next — у `TabsKeyboardDelegate`
   `getKeyLeftOf/RightOf` без orientation-guard; перевірено в
   `@react-aria/tabs` 3.11.1). Натомість у поточному horizontal-режимі ↑/↓
   мертві. Вертикальний режим RAC — «поблажливіший» з двох.
2. **Кількість вкладок:** 4. Кандидати на зростання: `lastfm-scrobbling`,
   `recording-stats` (5–6 реалістичні). Вертикальна панель масштабується
   краще — HelpDialog уже тримає 7.
3. **Реалізація в RAC:** `orientation="vertical"` + CSS; `aria-orientation`
   виставляється автоматично (`useTabList`). Обсяг — див. «Опис».
4. **Прецедент:** [HelpDialog.tsx:42-54](../../../src/components/common/HelpDialog.tsx#L42-L54)
   — робочий вертикальний патерн (7 вкладок).
5. **Консистентність:** головний аргумент «за» — одна ментальна модель для
   обох діалогів; сильніший за сам напрямок стрілок.

## Підтвердження при реалізації (2026-08-07)

Заявку про «всі чотири стрілки» перевірено двічі й незалежно:

1. У сорсах встановленого `@react-aria/tabs@3.11.1`:
   `TabsKeyboardDelegate.getKeyLeftOf/getKeyRightOf` не мають orientation-guard
   (лише rtl-flip), `getKeyAbove/getKeyBelow` повертають `null` при
   `orientation === "horizontal"`; `useTabList` передає делегат у
   `useSelectableCollection` **без** `orientation`, тож обробник стрілок нічим
   не звужений.
2. Негативним контролем: із тимчасово знятим `orientation="vertical"` усі три
   нові тести падають, причому `{ArrowDown}` не рухає вибір узагалі — тобто
   тест справді стереже саме цю властивість, а не проходить випадково.

## Документи

- Прецедент: `src/components/common/HelpDialog.tsx` (вертикальні вкладки)
- `src/components/settings/SettingsDialog.tsx`
- [React Aria `Tabs` — prop `orientation`](https://react-aria.adobe.com/Tabs)
- [WAI-APG: Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- [w3c/aria-practices#2281](https://github.com/w3c/aria-practices/issues/2281) —
  aria-orientation: підтримка AT, рекомендація «подвоєних стрілок» (Bootstrap)
