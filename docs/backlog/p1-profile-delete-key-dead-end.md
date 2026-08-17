---
slug: profile-delete-key-dead-end
title: "Delete на профілі Default або активному веде в глухий кут із нелокалізованою помилкою"
priority: P1
type: planned
status: ready
effort: S
kind: bug
target: 0.1.0
a11y: false
updated: 2026-08-17
depends_on: []
blocks: []
touches:
  - src/components/profile/ProfileList.tsx
  - src/components/profile/ProfilesPanel.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
gates: [pnpm test, pnpm vite:build]
notes:
  - "Знахідка grilling help-config (2026-08-13). Миша й меню гейтяться, клавіатура — ні: класична дірка одного шляху вводу."
---

# Delete на профілі Default або активному веде в глухий кут із нелокалізованою помилкою

> **Контекст:** знайдено під час grilling `help-config`. Заборона реалізована в трьох
> місцях із чотирьох; четверте — клавіатурний шлях.

## Опис

Видалити `Default` або **активний** профіль не можна: перевірки стоять у бекенді
([profile.rs:675](../../src-tauri/src/profile.rs:675),
[profile_commands.rs:48](../../src-tauri/src/commands/profile_commands.rs:48)).
Інтерфейс це поважає — але не скрізь:

- інлайн-кнопки «Перейменувати» й «Видалити» для таких рядків **не рендеряться** взагалі
  ([ProfileItem.tsx:134](../../src/components/profile/ProfileItem.tsx:134)) і не є
  фокус-стопами;
- пункти контекстного меню **неактивні**
  ([ProfileContextMenu.tsx:66](../../src/components/profile/ProfileContextMenu.tsx:66));
- клавіша `Delete` **не гейтиться нічим**
  ([ProfileList.tsx:119](../../src/components/profile/ProfileList.tsx:119)).

Тож клавіатурний шлях проходить далі всіх: відкривається звичайне підтвердження
«Видалити профіль "Default"? Ця дія незворотна.», людина погоджується — і **після**
згоди отримує тост із сирим рядком помилки бекенда:
`Forbidden: Cannot delete 'Default' profile`
([ProfilesPanel.tsx:165](../../src/components/profile/ProfilesPanel.tsx:165),
[errors.rs:38](../../src-tauri/src/errors.rs:38)).

Дві вади в одному місці: заборона повідомляється **після** підтвердження незворотної дії
(тобто підтвердження нічого не підтверджує), і повідомлення англійське та технічне —
воно ніколи не мало потрапити користувачу.

Масове видалення поводиться правильно й дає зразок: активний профіль пропускається, і
про це є людський текст «активний профіль пропущено» (`bulk_skipped_active`).

## Критерії готовності

- [ ] `Delete` на рядку `Default` або активного профілю не відкриває підтвердження, а
      одразу пояснює, чому дія недоступна — тим самим текстом, що й решта інтерфейсу
- [ ] Жоден шлях видалення не показує сирих рядків бекенда (`Forbidden: …`); якщо така
      помилка все ж дійшла до інтерфейсу, вона мапиться на локалізований текст
- [ ] Пояснення озвучується, а не лише показується
- [ ] Тест закриває обидва рядки-винятки саме клавіатурним шляхом
- [ ] `pnpm vite:build`, `pnpm test` — без помилок

## Документи

- [help-config](done/p1-help-config.md) — довідка описує робочий шлях і про глухий кут мовчить
- [help-content-polish](done/p1-help-content-polish.md) — мапа `profiles.md`
- `src/components/profile/`
