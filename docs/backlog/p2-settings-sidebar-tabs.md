---
slug: settings-sidebar-tabs
title: "Налаштування — вертикальні вкладки в бічній панелі (як у HelpDialog)"
priority: P2
type: planned
status: ready
effort: S
kind: feature
target: 0.1.0
updated: 2026-07-23
a11y: true
depends_on: []
blocks: []
touches:
  - src/components/settings/SettingsDialog.tsx
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

Обсяг змін — лише [SettingsDialog.tsx](../../src/components/settings/SettingsDialog.tsx) (~10 рядків, без змін логіки):

1. `<Tabs>`: додати `orientation="vertical"`, у className `flex-col` → рядковий
   flex (`flex flex-1 overflow-hidden`).
2. `<TabList>`: класи з HelpDialog — `flex w-48 flex-col gap-1 overflow-y-auto
   border-r border-slate-700 px-2 py-4`.
3. `TAB_CLS`: `border-b-2` → `rounded border-l-2` + `text-left` (як у
   HelpDialog).

## Критерії готовності

- [ ] `SettingsDialog` використовує `orientation="vertical"` у React Aria `Tabs`
- [ ] Вертикальна бічна панель стилізована аналогічно `HelpDialog`
- [ ] Навігація ↑/↓ між вкладками (автоматично від RAC)
- [ ] ←/→ на вертикальному таблисті теж переходять між вкладками — страхування
      для NVDA, який не озвучує орієнтацію (поведінка вбудована в RAC,
      перевірити прогоном)
- [ ] NVDA: вкладки озвучуються коректно («вкладка, N з 4»); активна вкладка =
      `aria-selected="true"`
- [ ] `pnpm test` без регресій

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
4. **Прецедент:** [HelpDialog.tsx:42-54](../../src/components/common/HelpDialog.tsx#L42-L54)
   — робочий вертикальний патерн (7 вкладок).
5. **Консистентність:** головний аргумент «за» — одна ментальна модель для
   обох діалогів; сильніший за сам напрямок стрілок.

## Документи

- Прецедент: `src/components/common/HelpDialog.tsx` (вертикальні вкладки)
- `src/components/settings/SettingsDialog.tsx`
- [React Aria `Tabs` — prop `orientation`](https://react-aria.adobe.com/Tabs)
- [WAI-APG: Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- [w3c/aria-practices#2281](https://github.com/w3c/aria-practices/issues/2281) —
  aria-orientation: підтримка AT, рекомендація «подвоєних стрілок» (Bootstrap)
