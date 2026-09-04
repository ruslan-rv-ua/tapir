---
slug: eslint-adoption
title: "ESLint у проєкті: react-hooks і jsx-a11y або прибрати мертві eslint-disable"
priority: P2
type: research
status: ready
effort: M
kind: chore
target: 0.1.0
updated: 2026-09-04
a11y: true
depends_on: []
blocks: []
touches:
  - package.json
  - src/components/common/composite-list/CompositeList.tsx
  - src/components/profile/ProfilesPanel.tsx
  - src/components/schedule/SchedulePanel.tsx
  - src/components/songs/SongsFilterBar.tsx
gates: [pnpm test, pnpm vite:build]
notes:
  - "Аудит 2026-09-04: у чотирьох файлах є коментарі eslint-disable-next-line react-hooks/exhaustive-deps, а ESLint у проєкті не встановлений; коментарі нічого не вимикають."
  - "accessibility-doc-audit 2026-09-03 уже зафіксував: eslint-plugin-jsx-a11y не підключений, бо ESLint немає взагалі."
---

# ESLint у проєкті: react-hooks і jsx-a11y або прибрати мертві eslint-disable

> **Контекст:** знахідка аудиту 2026-09-04. Дослідження з двома чесними виходами:
> завести ESLint із двома плагінами або визнати, що лінтера не буде, і прибрати
> коментарі, які до нього звертаються. Результат: звіт і рішення розробника.

## Опис

У [package.json](../../package.json) немає ні `eslint`, ні конфігу. При цьому чотири
файли несуть `// eslint-disable-next-line react-hooks/exhaustive-deps`: автор кожного
свідомо пропустив залежність ефекту й попередив лінтер, якого немає. Ці коментарі
документують намір, але не перевіряються.

Два плагіни мають для цього проєкту особливу вагу:

- `eslint-plugin-react-hooks`: саме ті `exhaustive-deps`, які проєкт уже намагається
  контролювати вручну; чотири наявні винятки стануть перевіреними винятками.
- `eslint-plugin-jsx-a11y`: автоматична частина a11y-рев'ю. Не замінить NVDA-прогін,
  але ловить клас помилок, які прогін знаходить найдорожче: інтерактивний елемент без
  імені, `onClick` на `div`, `aria-*` з хибним значенням, зайвий `tabIndex`.
  Розробник незрячий, тож кожна помилка, яку ловить машина до прогону, економить
  прогін.

Ціна: ще один інструмент у ланцюжку, початковий шум правил на кодовій базі в 17
тисяч рядків, і конфлікт стилю з react-aria (частина правил jsx-a11y не знає про
`role="application"` і композитні списки, доведеться вимикати точково).

## Що з'ясувати

- [ ] ESLint 9 з flat config, `typescript-eslint`, `eslint-plugin-react-hooks` і
      `eslint-plugin-jsx-a11y` сумісні з React 19 і Vite 8 у поточних версіях
- [ ] Скільки порушень дає рекомендований набір правил на HEAD; які з них справжні
      проблеми, а які шум від композитних списків і `role="application"`
- [ ] Чи ловить `jsx-a11y` хоч одну знахідку з чеклістів NVDA у `done/`, тобто чи
      окупається він у цьому проєкті
- [ ] Чи потрібен `prettier`, або досить форматера редактора

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює
- [ ] Звіт у цьому записі: кількість порушень за правилами, три найцінніші знахідки,
      рекомендація «заводити» або «не заводити»
- [ ] Якщо рішення «заводити»: окремий запис `type: planned` з конфігом, скриптом
      `pnpm lint` і місцем у `gates:`
- [ ] Якщо рішення «не заводити»: чотири коментарі `eslint-disable-next-line`
      замінено звичайними коментарями з тим самим поясненням

## Документи

- [accessibility-doc-audit](done/p2-accessibility-doc-audit.md) — де вперше зафіксовано відсутність ESLint
- [accessibility.md](../accessibility.md) — які правила a11y проєкт тримає вручну
