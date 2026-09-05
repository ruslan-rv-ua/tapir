---
slug: plural-form-single-source
title: "Одне джерело форми множини замість шести Intl.PluralRules із трьома входами"
priority: P2
type: planned
status: ready
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-05
a11y: false
depends_on: [paraglide-native-plurals]
blocks: []
touches:
  - src/lib/plural.ts
  - src/components/layout/StatusBar.tsx
  - src/components/profile/ProfileItem.tsx
  - src/components/songs/SongsPanel.tsx
  - src/components/streams/StreamsPanel.tsx
  - src/components/streams/StreamTransferDialog.tsx
  - src/hooks/useCrashResumeFeedback.ts
gates: [pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Рішення дослідження paraglide-native-plurals (2026-09-04): варіант (в). JSON, i18n.rs і cargo test не чіпаємо — варіанти paraglide відкладено."
  - "Єдине джерело локалі — getLocale(): саме воно обирає ТЕКСТ, який форма мусить узгодити. Хелпер не приймає параметр locale, інакше стане сьомим джерелом."
  - "Хелпер приймає категорію CLDR і мапить other → _many в одному місці: CLDR для en дає one/other, а ключі звуться _many."
---

# Одне джерело форми множини замість шести Intl.PluralRules із трьома входами

> **Контекст:** прямий наслідок дослідження
> [paraglide-native-plurals](done/p2-paraglide-native-plurals.md) — обрано варіант (в).
> Читати спершу секцію «Результати дослідження» там: вона пояснює, чому варіанти
> Paraglide відкладено і чому вхід має бути саме `getLocale()`.

## Опис

Форму множини обирають **шість** копій того самого алгоритму, з **трьома** різними
входами:

| Місце | Вхід |
|-------|------|
| [StatusBar.tsx:58](../../src/components/layout/StatusBar.tsx:58) | `document.documentElement.lang \|\| "uk"`, нові правила щорендеру |
| [SongsPanel.tsx:130](../../src/components/songs/SongsPanel.tsx:130) | те саме, але `useMemo` з `deps: []` |
| [StreamsPanel.tsx:89](../../src/components/streams/StreamsPanel.tsx:89) | `settings?.language \|\| document.documentElement.lang \|\| "uk"` |
| [useCrashResumeFeedback.ts:30](../../src/hooks/useCrashResumeFeedback.ts:30) | `getLocale()` — переведено на нього окремо, див. [crash-resume-plural-english-rules](done/p2-crash-resume-plural-english-rules.md) |
| [ProfileItem.tsx:39](../../src/components/profile/ProfileItem.tsx:39) | `getLocale()` |
| [StreamTransferDialog.tsx:10](../../src/components/streams/StreamTransferDialog.tsx:10) | `getLocale()` |

Запасне `"uk"` — мертвий код: [index.html](../../index.html) віддає `<html lang="en">`,
і перезаписує його лише [App.tsx:146](../../src/App.tsx:146) **після** резолву
`getSettings()`. Тобто реальний дефолт трьох, що лишились на атрибуті, — англійський.
(Четвертим був `useCrashResumeFeedback`; його перевели на `getLocale()` окремо —
запис [crash-resume-plural-english-rules](done/p2-crash-resume-plural-english-rules.md).)

Текст же в усіх шести дістає `m.*()`, тобто **`getLocale()`** зі стратегією
`["cookie", "globalVariable", "baseLocale"]`. Форму і текст обирають два незалежні
входи в одне речення — ось що треба звести, а не суфікси ключів.

## Що зробити

- Модуль `src/lib/plural.ts` з однією функцією, яка приймає число і **набір форм**, що
  їх дає викликач, і повертає обрану. Локаль бере всередині з `getLocale()`.
- **Параметра `locale` в неї немає.** Дати його означає завести сьоме джерело.
- Набором форм, а не готовим суфіксом, — бо родини різні: `crash_resume_all` має лише
  `_one/_few/_many`, а `profile_stream_count` — ще й справжній `_other`
  ([ProfileItem.tsx:38](../../src/components/profile/ProfileItem.tsx:38)). Хелпер, який
  віддає рядок-суфікс, на цій парі ламається.
- Тому мапінг `other → _many` живе всередині хелпера як **запасний хід**: коли CLDR дав
  `other`, а форми `other` викликач не передав. Одне місце, з коментарем, чому так —
  CLDR для `en` має `one` і `other`, а ключі Tapir звуться `_many`; конвенція старша за
  CLDR і лишається до міграції на варіанти.
- Нуль лишається **випадком застосунку**, а не формою мови: форма `zero` (де вона є)
  обирається за `count === 0` до звернення до `Intl.PluralRules`, як і зараз.
- Шість місць переходять на хелпер. `Intl.PluralRules` за межами `src/lib/plural.ts` не
  лишається — це перевіряється grep'ом у критеріях.

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює (форми в `uk` лишаються ті самі)
- [ ] `src/lib/plural.ts` існує, `getLocale()` — його єдиний вхід, параметра `locale` немає
- [ ] Усі шість місць із таблиці вище перейшли на хелпер
- [ ] `grep -rn "Intl.PluralRules" src/ --include=*.ts --include=*.tsx` поза
      `src/lib/plural.ts` і його тестом дає порожньо
- [ ] Тест хелпера, обидві локалі: `uk` — 1/2/5/21/22 → `one`/`few`/`many`/`one`/`few`;
      `en` — 1/2 → `one` і запасний хід у `many` за відсутності форми `other`
- [ ] Тест запасного ходу: коли форму `other` передано (`profile_stream_count`), вона й
      обирається, а не `many`
- [ ] Сім тестів, що мокають ключі з суфіксами поіменно (`ProfileItem`, `ProfileList`,
      `ProfilesPanel`, `StreamTransferDialog`, `useBrowserProbeFeedback`,
      `useCrashResumeFeedback`, `scheduleFormat`), лишаються зеленими або оновлені
- [ ] JSON повідомлень і `src-tauri/src/i18n.rs` не змінені (`git diff` порожній для них)

## Документи

- [paraglide-native-plurals](done/p2-paraglide-native-plurals.md) — дослідження й обґрунтування (в)
- [crash-resume-plural-english-rules](done/p2-crash-resume-plural-english-rules.md) — та сама вада, закрита точково 2026-09-05; тест форми лишився в `useCrashResumeFeedback.test.tsx`
- [ADR: локалізація нативного шару](../decisions/2026-08-17-native-layer-localisation.md) — чому Rust лишається на суфіксах
