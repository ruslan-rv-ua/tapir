---
slug: optional-library-swaps
title: "Необов'язкові заміни: wildmatch замість власного DP, use-debounce замість useAutoSave"
priority: P3
type: planned
status: done
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-05
completed: 2026-09-05
a11y: false
depends_on: []
blocks: []
touches:
  - src-tauri/src/wishlist/matcher.rs
  - src-tauri/Cargo.toml
  - src/hooks/useAutoSave.ts
  - package.json
gates: [cargo test, cargo clippy --all-targets, pnpm test, pnpm vite:build]
notes:
  - "Аудит 2026-09-04: обидві заміни один в один, обидві не обов'язкові. Записано, щоб рішення «робити» або «не робити» було зафіксоване, а не переглядалося при кожному аудиті."
  - "Рішення 2026-09-05: обидва — не робити. Власний код малий, покритий тестами й без відомих багів; заміна прибирає те, що не ламалось, і додає залежність. Тригер повернення — справжній баг у wildcard_match або useAutoSave."
---

# Необов'язкові заміни: wildmatch замість власного DP, use-debounce замість useAutoSave

> **Контекст:** знахідка аудиту 2026-09-04. Два шматки власного коду мають точні,
> підтримувані відповідники в бібліотеках. Виграш малий, ризик нульовий, тож це
> питання смаку. `draft`, поки розробник не скаже «так» або «ні» по кожному.
>
> **Результат (2026-09-05):** «ні» по обох. Власний DP у `matcher.rs` і `useAutoSave`
> лишаються як є; запис закрито, щоб наступний аудит не відкривав питання знову.
> Повернутись лише за справжнім багом в одному з двох шматків.

## Опис

**wildmatch 2.6** замість `wildcard_match` у
[matcher.rs](../../../src-tauri/src/wishlist/matcher.rs). Крейт без залежностей,
`WildMatch::new_case_insensitive(pattern).matches(text)`: `*` і `?`, збіг на весь
рядок, порівняння через Unicode `to_lowercase`, є тест на кирилицю. Це та сама
семантика, що й у 40 рядках DP, включно з правилом «якір на весь рядок», яке стереже
тест `anchored_to_the_whole_string_not_a_substring`. Усі наявні тести матчера
лишаються як є і мусять пройти на крейті.

**use-debounce 10.1** замість [useAutoSave.ts](../../../src/hooks/useAutoSave.ts).
`useDebouncedCallback(save, 300, { flushOnExit: true })` дає те, що хук робить
руками: дебаунс і виклик на розмонтуванні. Обробка помилки з тостом лишається в
обгортці. Альтернатива `usehooks-ts` не підходить: на розмонтуванні вона робить
`cancel`, і остання правка налаштувань губиться.

Аргумент «не робити»: обидва власні шматки маленькі, покриті тестами й не мають
відомих багів. Заміна прибирає код, який ніколи не ламався, і додає залежність,
за оновленнями якої треба стежити.

## Рішення, яке потрібне

- [x] wildmatch: **ні** (2026-09-05)
- [x] use-debounce: **ні** (2026-09-05)

## Критерії готовності (для тих пунктів, де «робити»)

Обидва рішення — «ні», тож пункти для «робити» не застосовуються.

- [ ] `docs/help/` — запис видимої поведінки не змінює
- [ ] wildmatch: `wildcard_match` видалено, усі тести `matcher.rs` зелені на крейті,
      `check_track` не змінився
- [ ] use-debounce: `useAutoSave` став обгорткою над `useDebouncedCallback` із
      `flushOnExit`, тест на flush при розмонтуванні лишається
- [x] Для пункту «ні»: рядок у `notes:` цього запису з датою рішення, запис
      закривається

## Документи

- https://docs.rs/wildmatch/latest/wildmatch/ — `WildMatchPattern`, `new_case_insensitive`
- https://github.com/xnimorz/use-debounce/blob/master/CHANGELOG.md — `flushOnExit` з 10.1.0
