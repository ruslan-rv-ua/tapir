---
slug: plural-form-single-source
title: "Одне джерело форми множини замість шести Intl.PluralRules із трьома входами"
priority: P2
type: planned
status: done
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-05
completed: 2026-09-05
a11y: false
depends_on: [paraglide-native-plurals]
blocks: [profile-stream-count-label-duplicated]
touches:
  - src/lib/plural.ts
  - src/components/layout/StatusBar.tsx
  - src/components/profile/ProfileItem.tsx
  - src/components/songs/SongsPanel.tsx
  - src/components/streams/StreamsPanel.tsx
  - src/components/streams/StreamTransferDialog.tsx
  - src/hooks/useCrashResumeFeedback.ts
  - src/hooks/useCrashResumeFeedback.test.tsx
  - src-tauri/src/i18n.rs
  - docs/decisions/2026-08-17-native-layer-localisation.md
gates: [pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Рішення дослідження paraglide-native-plurals (2026-09-04): варіант (в). JSON, i18n.rs і cargo test не чіпаємо — варіанти paraglide відкладено."
  - "Єдине джерело локалі — getLocale(): саме воно обирає ТЕКСТ, який форма мусить узгодити. Хелпер не приймає параметр locale, інакше стане сьомим джерелом."
  - "Хелпер приймає категорію CLDR і мапить other → _many в одному місці: CLDR для en дає one/other, а ключі звуться _many."
  - "Закрито 2026-09-05 з одним відступом від критеріїв: i18n.rs таки змінений — на один док-коментар, який називав видалену StreamsPanel.pluralize. Ключів, логіки й cargo test це не торкнулось."
---

# Одне джерело форми множини замість шести Intl.PluralRules із трьома входами

> **Контекст:** прямий наслідок дослідження
> [paraglide-native-plurals](p2-paraglide-native-plurals.md) — обрано варіант (в).
> Читати спершу секцію «Результати дослідження» там: вона пояснює, чому варіанти
> Paraglide відкладено і чому вхід має бути саме `getLocale()`.

## Опис

Форму множини обирають **шість** копій того самого алгоритму, з **трьома** різними
входами:

| Місце | Вхід |
|-------|------|
| [StatusBar.tsx:58](../../../src/components/layout/StatusBar.tsx:58) | `document.documentElement.lang \|\| "uk"`, нові правила щорендеру |
| [SongsPanel.tsx:130](../../../src/components/songs/SongsPanel.tsx:130) | те саме, але `useMemo` з `deps: []` |
| [StreamsPanel.tsx:89](../../../src/components/streams/StreamsPanel.tsx:89) | `settings?.language \|\| document.documentElement.lang \|\| "uk"` |
| [useCrashResumeFeedback.ts:30](../../../src/hooks/useCrashResumeFeedback.ts:30) | `getLocale()` — переведено на нього окремо, див. [crash-resume-plural-english-rules](p2-crash-resume-plural-english-rules.md) |
| [ProfileItem.tsx:39](../../../src/components/profile/ProfileItem.tsx:39) | `getLocale()` |
| [StreamTransferDialog.tsx:10](../../../src/components/streams/StreamTransferDialog.tsx:10) | `getLocale()` |

Запасне `"uk"` — мертвий код: [index.html](../../../index.html) віддає `<html lang="en">`,
і перезаписує його лише [App.tsx:146](../../../src/App.tsx:146) **після** резолву
`getSettings()`. Тобто реальний дефолт трьох, що лишились на атрибуті, — англійський.
(Четвертим був `useCrashResumeFeedback`; його перевели на `getLocale()` окремо —
запис [crash-resume-plural-english-rules](p2-crash-resume-plural-english-rules.md).)

Текст же в усіх шести дістає `m.*()`, тобто **`getLocale()`** зі стратегією
`["cookie", "globalVariable", "baseLocale"]`. Форму і текст обирають два незалежні
входи в одне речення — ось що треба звести, а не суфікси ключів.

## Що зробити

- Модуль `src/lib/plural.ts` з однією функцією, яка приймає число і **набір форм**, що
  їх дає викликач, і повертає обрану. Локаль бере всередині з `getLocale()`.
- **Параметра `locale` в неї немає.** Дати його означає завести сьоме джерело.
- Набором форм, а не готовим суфіксом, — бо родини різні: `crash_resume_all` має лише
  `_one/_few/_many`, а `profile_stream_count` — ще й справжній `_other`
  ([ProfileItem.tsx:38](../../../src/components/profile/ProfileItem.tsx:38)). Хелпер, який
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

- [x] `docs/help/` — запис видимої поведінки не змінює (форми в `uk` лишаються ті самі)
- [x] `src/lib/plural.ts` існує, `getLocale()` — його єдиний вхід, параметра `locale` немає
- [x] Усі шість місць із таблиці вище перейшли на хелпер
- [x] `grep -rn "Intl.PluralRules" src/ --include=*.ts --include=*.tsx` поза
      `src/lib/plural.ts` і його тестом дає порожньо
- [x] Тест хелпера, обидві локалі: `uk` — 1/2/5/21/22 → `one`/`few`/`many`/`one`/`few`;
      `en` — 1/2 → `one` і запасний хід у `many` за відсутності форми `other`
- [x] Тест запасного ходу: коли форму `other` передано (`profile_stream_count`), вона й
      обирається, а не `many`
- [x] Сім тестів, що мокають ключі з суфіксами поіменно (`ProfileItem`, `ProfileList`,
      `ProfilesPanel`, `StreamTransferDialog`, `useBrowserProbeFeedback`,
      `useCrashResumeFeedback`, `scheduleFormat`), лишаються зеленими або оновлені
- [x] JSON повідомлень не змінені (`git diff` порожній). `src-tauri/src/i18n.rs` —
      **з одним відступом**: док-коментар `plural_suffix` називав видалену
      `StreamsPanel.pluralize`, і вказівник переписано на `plural()`. Ані ключів, ані
      логіки вибору форми, ані `cargo test` правка не торкається

## Документи

- [paraglide-native-plurals](p2-paraglide-native-plurals.md) — дослідження й обґрунтування (в)
- [crash-resume-plural-english-rules](p2-crash-resume-plural-english-rules.md) — та сама вада, закрита точково 2026-09-05; тест форми лишився в `useCrashResumeFeedback.test.tsx`
- [ADR: локалізація нативного шару](../../decisions/2026-08-17-native-layer-localisation.md) — чому Rust лишається на суфіксах
- [profile-stream-count-label-duplicated](../p3-profile-stream-count-label-duplicated.md) — хвіст: два власники одного рядка «N потоків»

## Результат (2026-09-05)

Хелпер — [src/lib/plural.ts](../../../src/lib/plural.ts): `plural(count, forms)`, локаль
лише з `getLocale()`, параметра `locale` немає. Форми — **танки**, а не готові рядки й не
функції повідомлень: `crash_resume_all` має тільки `_one/_few/_many`, а
`profile_stream_count` — ще й справжній `_other`, і саме на цій парі ламається хелпер, що
віддає суфікс. Побічний виграш замикання: підстановки понад `{count}` (`{label}` у
`streams_filter_changed`, `{names}` у `streams_examples_added`) просто закриваються в
танку — зникла причина, через яку `StreamsPanel` тримав власну обгортку поверх правил.

**Сайтів шість, викликів одинадцять.** Таблиця вище рахувала конструктори
`Intl.PluralRules`; у `StreamsPanel` за одним конструктором стояла локальна обгортка
`pluralize` і **шість** її викликів, три з них у `useCallback`
(`filterAnnouncement`, `addedAnnouncement`, `recordAllAnnouncement`). Грепом за
`Intl.PluralRules` — тобто критерієм цього запису — їх не видно; знайшов їх
`pnpm typecheck` після зняття обгортки.

Ту саму ваду того самого дня закрив точковий запис
[crash-resume-plural-english-rules](p2-crash-resume-plural-english-rules.md) — паралельно
й раніше на кілька хвилин. Обидві гілки дійшли до `getLocale()` незалежно; при злитті
взято версію через хелпер, а тест лишився **його** — сильніший за наш, бо пришпилює
`<html lang="en">` у `beforeEach` на всі випадки, а не на один, і мокає `getLocale()`
замість покладатись на `baseLocale`. Це рівно те, що записи домовились наперед:
«хто йде першим, той і лишає тест; другий підбирає його під себе».

Перейменування зламало три вказівники на стару конвенцію, усі три переписані на
`src/lib/plural.ts`: два в [ADR](../../decisions/2026-08-17-native-layer-localisation.md)
(вступний перелік і §4) і док-коментар `plural_suffix` у
[i18n.rs](../../../src-tauri/src/i18n.rs). Жоден із них не стереже тест: `docsLinks`
перевіряє існування файлу, а не рядок, а імені функції в коментарі не перевіряє ніщо.
Заразом §4 ADR дістав межу, яку доти замовчував: Rust віддає `_zero` на нулі **завжди**,
фронтенд — лише там, де ключ є.

Хвіст, свідомо не взятий: `streamCountLabel` і далі стоїть двома однаковими копіями в
`ProfileItem.tsx` і `StreamTransferDialog.tsx`. Кожна стала вдвічі коротшою, але копія
лишилась копією — цей запис просив звести вибір **форми**, а не власників **рядка**.
Винесено окремо:
[profile-stream-count-label-duplicated](../p3-profile-stream-count-label-duplicated.md).
