---
slug: key-recorder-bare-key
title: "Рекордер приймає голу клавішу як глобальну комбінацію"
priority: P1
type: planned
status: ready
effort: S
kind: bug
target: 0.1.0
updated: 2026-09-02
a11y: false
depends_on: [key-recorder-silent-rejection]
blocks: []
touches:
  - src/components/settings/KeyRecorder.tsx
  - src/components/settings/KeyRecorder.test.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
  - docs/help/uk/settings.md
  - docs/help/en/settings.md
gates: [pnpm test, pnpm vite:build]
notes:
  - "Знахідка grilling key-recorder-silent-rejection (2026-09-02); перевірено тестом — голе Q записується як \"Q\"."
---

# Рекордер приймає голу клавішу як глобальну комбінацію

> **Контекст:** знайдено під час grilling `key-recorder-silent-rejection`. Потребує
> власного grilling: розвилка «які голі клавіші законні» тут не вирішена. Механізм
> відмови (текст у `role="alert"`, вихід із режиму запису) заводить батьківський запис —
> звідси `depends_on`.

## Опис

`codeToToken` не вимагає модифікатора, а `validateHotkey` перевіряє лише резерв і дублікат
([HotkeysTab.tsx:84](../../src/components/settings/HotkeysTab.tsx:84)). Тож натискання
голої `Q` в озброєному рекордері записує комбінацію `"Q"`, `registerHotkeys` віддає її
плагіну як є, і Windows реєструє її **системно**: кожне `Q` в будь-якій програмі перемикає
запис. Перевірено тестом 2026-09-02: `onChange` викликано з `"Q"`.

Що вже відомо про межі:

- реєстр шорткатів **свідомо** дозволяє голі `Pause` і `F13`–`F24` (keyboard-shortcuts.md:
  «фізично відсутні; для програмованих клавіатур», `Pause` семантично ідеальна для
  відтворення) — тест `records bare Pause` це закріплює;
- голі `F1`, `F2`, `F4`, `F5`, `F6`, `F9` ловить перевірка резерву; голі `F3`, `F7`, `F8`,
  `F10`–`F12` — ні (`F10` активує меню Windows, `F11` зайнятий
  повноекранним режимом — див. `window-fullscreen-f11`);
- довідка `settings.md` і підказка над списком (батьківський запис) кажуть «Ctrl, Shift або
  Alt плюс…», тобто описують правило, якого поле не тримає.

## Відкриті питання

- Які голі клавіші законні: лише `Pause` і `F13`–`F24`? весь F-ряд поза резервом? стрілки —
  точно ні (лишили б людину без навігації в усіх програмах).
- Відмова («Потрібен модифікатор: Ctrl, Shift або Alt») чи попередження з дозволом? Голі
  літери й цифри — очевидна відмова; спірна зона — F-ряд.
- Чи міняється формулювання позитивного переліку в довідці (виняток для `Pause` і
  `F13`+ треба або назвати, або залишити неявним).

## Критерії готовності

- [ ] Правило «які голі клавіші законні» огрилено й записано тут
- [ ] Гола літера/цифра/стрілка не записується як комбінація — відмова видима й озвучена,
      тим самим механізмом, що й у батьківському записі
- [ ] `docs/help/` оновлено — або зазначено, що запис видимої поведінки не змінює
- [ ] `pnpm test`, `pnpm vite:build` — без помилок

## Документи

- [key-recorder-silent-rejection](done/p1-key-recorder-silent-rejection.md) — механізм відмови,
  рішення 8
- [keyboard-shortcuts.md](../keyboard-shortcuts.md) — правило дефолтів №4 і абзац про
  `F13`–`F24`/`Pause`
- [ADR про асиметрію конфігурованості](../decisions/2026-06-07-shortcut-configurability-asymmetry.md)
- `src/components/settings/KeyRecorder.tsx`, `src/components/settings/HotkeysTab.tsx`,
  `src-tauri/src/shortcuts.rs`
