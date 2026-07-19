---
slug: activity-bar-help-button
title: "Кнопка довідки в ActivityBar"
priority: P1
type: planned
status: done
effort: S
kind: feature
target: 0.2.0
updated: 2026-07-19
completed: 2026-07-19
a11y: true
depends_on: []
blocks: []
touches: [src/components/layout/ActivityBar.tsx, src/stores/navigation.ts, src/components/common/HelpDialog.tsx]
gates: [pnpm test, pnpm vite:build]
notes: ["реалізовано у feature/activity-bar-help-button"]
---

# Кнопка довідки в ActivityBar

> **Контекст:** виконано, реалізовано у `feature/activity-bar-help-button`. Один пункт лишається без ручного NVDA-прогону.

## Опис

Довідка відкривається по `F1`, але в ActivityBar немає видимої кнопки.
Для NVDA-користувача при першому використанні `F1` не очевидний.

Додати кнопку `?` (Help) поруч з кнопкою Settings у footer ActivityBar.
Клік → `$helpOpen.set(true)`.

**Що вже є:**
- `HelpDialog` компонент (`src/components/common/HelpDialog.tsx`)
- `$helpOpen` atom у `src/stores/navigation.ts`
- `Settings` кнопка у footer ActivityBar як зразок

## Технічна реалізація

`src/components/layout/ActivityBar.tsx` footer — додати кнопку поряд з Settings:

```tsx
<Button
  ref={helpRef}
  aria-label={m.help_title()}
  onPress={() => $helpOpen.set(true)}
  className={/* same styles as Settings button */}
>
  <HelpCircle size={20} aria-hidden={true} />
  <span className="text-sm font-bold leading-tight">{m.help_title()}</span>
</Button>
```

- Іконка: `HelpCircle` (lucide-react, вже є в deps)
- Roving focus: додати `helpRef` до `allRefs`
- i18n: `m.help_title()` вже є

## Критерії готовності

- [x] Кнопка `?` у footer ActivityBar поряд з Settings (над Settings — Settings лишається останнім)
- [x] Клік відкриває `HelpDialog` (`$helpOpen.set(true)`)
- [ ] NVDA озвучує `aria-label` при фокусі — потребує ручного прогону; розмітка ідентична
      кнопці Settings (`aria-label` + `aria-hidden` іконка)
- [x] Входить у roving-focus order ActivityBar (індекс `sectionItems.length + 1`, перед Settings)
- [x] F1 і кнопка відкривають одну і ту ж HelpDialog (спільний атом `$helpOpen`)

## Документи

- Код: `src/components/layout/ActivityBar.tsx`
- Код: `src/stores/navigation.ts` — `$helpOpen`
- Код: `src/components/common/HelpDialog.tsx`
