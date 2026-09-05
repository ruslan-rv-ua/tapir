---
slug: profile-stream-count-label-duplicated
title: "«N потоків» біля профілю зібрано двома однаковими копіями"
priority: P3
type: planned
status: ready
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-05
a11y: false
depends_on: [plural-form-single-source]
blocks: []
touches:
  - src/components/profile/ProfileItem.tsx
  - src/components/streams/StreamTransferDialog.tsx
  - src/components/profile/ProfileItem.test.tsx
  - src/components/streams/StreamTransferDialog.test.tsx
gates: [pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Хвіст plural-form-single-source (2026-09-05): хелпер скоротив обидві копії вдвічі, але копією вони бути не перестали."
  - "a11y: false свідомо — правка мусить не змінити ЖОДНОГО символу вихідного рядка; сторожі — два наявні тести, які вже перевіряють доступні назви. Новий рядок = інший запис."
  - "Мокання лишається робочим: vi.mock резолвить модуль повідомлень за тим самим id, тож спільний модуль у src/lib/ дістає ті самі моки, що й компонент."
---

# «N потоків» біля профілю зібрано двома однаковими копіями

> **Контекст:** хвіст запису
> [plural-form-single-source](done/p2-plural-form-single-source.md), свідомо не взятий
> там — той запис просив звести вибір **форми**, а не власників **рядка**.

## Опис

`streamCountLabel(count)` стоїть двічі, побайтово однаково:

| Місце | Куди йде рядок |
|-------|----------------|
| [ProfileItem.tsx:38](../../src/components/profile/ProfileItem.tsx:38) | у `rowLabel` — доступна назва рядка профілю |
| [StreamTransferDialog.tsx:9](../../src/components/streams/StreamTransferDialog.tsx:9) | у `aria-label` кнопки цільового профілю |

Друга копія сама зізнається коментарем: «mirrors ProfileItem so NVDA hears the same
phrasing everywhere». Тобто однаковість тут — **інваріант**, а не збіг: на обох
поверхнях видно лише голе число ([StreamTransferDialog.tsx:69](../../src/components/streams/StreamTransferDialog.tsx:69)
і лічильник у рядку профілю, обидва `aria-hidden`), а слово «потік / потоки / потоків»
існує тільки в доступній назві. Розійдуться копії — розійдеться те, що чує людина, і
жоден тест цього не назве: кожен перевіряє свій компонент окремо, обидва лишаться
зеленими.

Родина `profile_stream_count` — єдина з `_other`, тож копія несе ще й чотиригілковий
набір форм, а не три.

## Що зробити

- Один власник рядка — маленький модуль у `src/lib/` (рекомендація:
  `src/lib/profileStreamCount.ts` з `streamCountLabel`). Ім'я не несуче, аби модуль був
  один; обидва компоненти імпортують його.
- **Не в `src/lib/plural.ts`**: там свідомо одна функція, і вона не знає про ключі
  повідомлень. Затягти `m.*` туди означає зв'язати вибір форми з конкретною родиною.
- **Не експорт із `ProfileItem.tsx`**: діалог потоків не має залежати від компонента
  профілю заради рядка.
- Одна родина, а не механізм: узагальнювати «родина ключів + число → рядок» не треба —
  решта родин уже викликають [`plural`](../../src/lib/plural.ts) напряму й другого шару
  не просять.

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює (рядок той самий до символу)
- [ ] `streamCountLabel` існує в одному місці; обидва компоненти імпортують його
- [ ] `grep -rn "profile_stream_count" src/ --include=*.tsx` поза тестами дає порожньо
- [ ] Обидва наявні тести (`ProfileItem.test.tsx`, `StreamTransferDialog.test.tsx`)
      лишаються зеленими **без правок моків** — або правка пояснена в комміті
- [ ] Тест самого модуля: `1` → `_one`, `2` → `_few`, `5` → `_many`; локаль `uk`

## Документи

- [plural-form-single-source](done/p2-plural-form-single-source.md) — звідки хвіст; там же чому хелпер бере набір форм, а не суфікс
- [ADR: локалізація нативного шару](../decisions/2026-08-17-native-layer-localisation.md) — чому ключі лишаються на суфіксах
