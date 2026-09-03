---
slug: tray-toggle-label-vs-action
title: "Пункт трея зветься «Пауза», а живий звук зупиняє"
priority: P2
type: planned
status: draft
effort: S
kind: bug
target: 0.1.0
updated: 2026-09-03
a11y: false
depends_on: [preview-player-presentation]
blocks: []
touches:
  - src-tauri/src/tray/menu.rs
  - src-tauri/src/tray/mod.rs
  - docs/help/uk/background.md
  - docs/help/en/background.md
gates: [pnpm test, pnpm vite:build]
notes:
  - "Знахідка grilling preview-player-presentation (2026-09-03) — четверта поверхня того самого жесту."
  - "Зачіпає ПОТОКИ, не лише прев'ю: мітка бреше щоразу, коли грає живий звук."
  - "a11y: false поки правка суто текстова; якщо грумінг вирішить прибирати пункт меню — перевести в true."
---

# Пункт трея зветься «Пауза», а живий звук зупиняє

> **Контекст:** знайдено під час grilling
> [preview-player-presentation](done/p2-preview-player-presentation.md). Той самий жест, четверта
> поверхня — але дефект інший: тут розходяться **слово й дія**, а не предикат.
> Розвилка внизу не закрита — запис треба огрилити перед кодом.

## Опис

Мітка пункту трея залежить **лише від стану плеєра**, не від джерела:

```rust
let play_label = match snap.player_state {
    PlaybackState::Playing => i18n::t(Key::TrayPause),   // «Пауза»
    _ => i18n::t(Key::TrayPlay),                         // «Грати»
};
```
([menu.rs:71](../../src-tauri/src/tray/menu.rs:71))

А натискання йде в `toggle_playback` → `decide_toggle`, який для живого джерела віддає
`StopStream` або `StopPreview` ([playback_control.rs:64](../../src-tauri/src/playback_control.rs:64)).
Тобто поки грає станція, меню обіцяє «Пауза», а робить «Зупинити» — і повернутись «з паузи»
нікуди, бо з'єднання закрито.

Це **не** дефект прев'ю: він спрацьовує щоразу, коли грає будь-який живий звук, тобто в
основному сценарії застосунку.

Сусідній запис [preview-player-presentation](done/p2-preview-player-presentation.md) прибирає паузу
живого звуку з панелі й з медіаклавіш. Після нього трей лишається **єдиним** місцем, де слово
«Пауза» ще стосується ефіру.

## Чому окремим записом

Батьківський запис лікує **предикат**: `type === 'stream'` там, де питання «це живе?».
Тут предикат ні до чого — джерела в знімку меню взагалі немає
([`MenuSnapshot`](../../src-tauri/src/tray/mod.rs:16) несе `player_state`, `now_playing_label`,
`active_recordings`, `window_visible`). Дефект у тому, що мітка вибирається за станом, хоча
дія вибирається за джерелом.

Різні причини, різні користувачі (там прев'ю, тут потоки), різне приймання — тож окремо.

## Що вже відомо

- `build_snapshot` тримає `player_status` у руках ([mod.rs:63](../../src-tauri/src/tray/mod.rs:63)),
  тож додати в знімок ознаку живого джерела — один рядок.
- Предикат для цього дає батьківський запис: `PlaybackSource::is_live()`. Звідси `depends_on`.
- Ключ на «Зупинити» вже є — `Key::TrayStop` (`tray_stop`), його ж бере окремий пункт «Зупинити».
- Системний оверлей відтворення Windows сюди **не** входить: кнопку там малює сама система за
  `MediaPlaybackStatus`, перейменувати її не можна. Її натискання після батьківського запису
  зупиняє — це прийнята поведінка, а не дефект.

## Розвилка, яку треба закрити грилінгом

Якщо пункт-перемикач для живого звуку назвати «Зупинити», у меню стане **два пункти
«Зупинити»**: перемикач і окремий `ID_STOP_PLAYBACK`, який показується завжди, поки плеєр не
зупинено ([menu.rs:80](../../src-tauri/src/tray/menu.rs:80)).

Це рівно та колізія, яку панель плеєра вже вирішила — там окрему «Зупинити» для живого джерела
**не малюють**, бо «a second Stop would be a redundant, identically-labelled button for
screen-reader users». Варіанти:

- прибирати окремий пункт «Зупинити», поки грає живе джерело (симетрично панелі);
- прибирати натомість пункт-перемикач, лишаючи «Зупинити» єдиним;
- лишити обидва, розвівши тексти.

## Критерії готовності

- [ ] Мітка пункту-перемикача не обіцяє паузу там, де дія зупиняє
- [ ] У меню немає двох пунктів з однаковим текстом
- [ ] `docs/help/` оновлено — або зазначено, що запис видимої поведінки не змінює
      (`background.md` описує трей; звірити обидві локалі)
- [ ] `pnpm test`, `pnpm vite:build` зелені

## Документи

- [preview-player-presentation](done/p2-preview-player-presentation.md) — батьківський запис, звідки знахідка
- [ADR 2026-08-17](../decisions/2026-08-17-tray-toast-categories.md) — модель фонового шару
- Код: `src-tauri/src/tray/menu.rs`, `src-tauri/src/tray/mod.rs`,
  `src-tauri/src/playback_control.rs`
