# Кнопка довідки в ActivityBar

- **Слаг:** `activity-bar-help-button`
- **Тип:** заплановано
- **Стан:** ready
- **Зусилля:** S
- **Оновлено:** 2026-06-15
- **Залежності:** Phase 1 (ActivityBar ✅), HelpDialog (✅ реалізовано)

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

- [ ] Кнопка `?` у footer ActivityBar поряд з Settings
- [ ] Клік відкриває `HelpDialog`
- [ ] NVDA озвучує `aria-label` при фокусі
- [ ] Входить у roving-focus order ActivityBar
- [ ] F1 і кнопка відкривають одну і ту ж HelpDialog

## Документи

- Код: `src/components/layout/ActivityBar.tsx`
- Код: `src/stores/navigation.ts` — `$helpOpen`
- Код: `src/components/common/HelpDialog.tsx`

## Промпт для агента

```text
Реалізуй цей запис. Рішення вже прийняте — мета довести до робочого, протестованого коду.

Що реалізуємо: Кнопка довідки в ActivityBar

Почни зі скіла `superpowers:brainstorming` — пройди його, щоб узгодити вимоги й дизайн перед кодом, а далі веди роботу за процесом superpowers: план → реалізація через TDD → перевірка.

Перед стартом звірся з контекстом: цей запис беклогу, його критерії готовності та залежності, пов'язаний код і документи (AGENTS.md, implementation-phases.md та ін.).

Дотримуйся конвенцій проєкту з AGENTS.md. Де доречно — закладай доступність/NVDA від початку, не як доробку.

Питання, якщо виникають, став по одному: контекст, варіанти відповіді, рекомендований. Дочекайся відповіді перед наступним.

Гейти перед завершенням: `pnpm test` і `pnpm vite:build` мають проходити. Онови критерії готовності в записі; коли все зроблено — запис можна видаляти (історія лишається в git).
```
