---
slug: hotkeys-expansion
title: "Нові гарячі клавіші: Ctrl+F (пошук), Ctrl+M (mute), F9 (що грає), F4 (теги)"
priority: P2
type: planned
status: ready
effort: M
kind: feature
target: 0.1.0
updated: 2026-08-07
a11y: true
depends_on: []
blocks: []
touches:
  - src/lib/shortcuts.ts
  - src/hooks/useCompositeList.ts
  - src/components/songs/SongsList.tsx
  - src/components/songs/SongsFilterBar.tsx
  - src/components/browser/SearchForm.tsx
  - src/stores/player.ts
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
  - docs/keyboard-shortcuts.md
gates: [pnpm test, pnpm vite:build]
notes:
  - "Модель — TapinRadio (еталонний доступний радіо-рекордер, розсилка pc-audio): голі F-клавіші + Ctrl+літери; F9-анонс — запозичення TapinRadio F11 (Announce currently playing song), F11 у WebView2 зайнятий fullscreen"
  - "Вільні голі F-клавіші у webview: F3, F4, F7, F8, F9 (F11=fullscreen, F12=DevTools — акселератори WebView2; F10 — семантика меню; NVDA голі F-клавіші не біндить)"
  - "Пул F3/F7 заміряно 2026-08-07 (NVDA-прогін webview-reload-guard, сценарій 15, Microsoft Edge — той самий рушій, що й WebView2): обидві інертні, приєднані до пулу вище. F11 підтверджено зайнятий (fullscreen спрацьовує) — лишається виключеним"
  - "Ctrl+F матчиться ГЛОБАЛЬНО (no-op на секціях без пошуку) — щоб дефолтний Find bar WebView2 ніколи не відкривався; find-in-page — скасовуваний акселератор Chromium"
  - "Ctrl+M НЕ закриває відкладений Tier-1 toggle_mute (Ctrl+Shift+U, OS-global): той потребує міст Rust→webview і лишається окремою задачею; Ctrl+M — webview-scoped, працює лише з фокусом у вікні"
---

# Нові гарячі клавіші: Ctrl+F (пошук), Ctrl+M (mute), F9 (що грає), F4 (теги)

> **Контекст:** друга хвиля аудиту шорткатів, рішення 2026-07-23 (перша —
> [streams-transfer-hotkeys](p2-streams-transfer-hotkeys.md): F5/Shift+F5).
> Прийнято чотири комбінації; відхилені кандидати і причини — у «Свідомо не
> додано» нижче.

## Опис

### `Ctrl+F` — фокус на пошук/фільтр поточного екрана (Tier 2)

Універсальна конвенція «знайти». Запис у `SHORTCUTS` **без** `when`-гейта:
матчиться на всіх секціях (інакше на секціях без пошуку спрацює дефолтний
Find bar WebView2), `run` — фокус поля пошуку активної секції або no-op:

- Browser → інпут [SearchForm.tsx](../../src/components/browser/SearchForm.tsx);
- Songs → інпут [SongsFilterBar.tsx](../../src/components/songs/SongsFilterBar.tsx);
- решта секцій — no-op (комбо все одно споживається, `preventDefault`).

Механізм фокусування — імперативний реквест (атом-подія або ref-реєстр за
зразком zone-проксі), деталі на імплементації. NVDA-конфлікту немає (пошук
NVDA — `NVDA+Ctrl+F`).

### `Ctrl+M` — вимкнути/увімкнути звук (Tier 2)

Прецеденти: TapinRadio `Ctrl+M`, YouTube `M`. Toggle `$muteState`
([player.ts](../../src/stores/player.ts)) + polite-анонс («Звук вимкнено» /
«Звук увімкнено»). Дешевий, бо mute-логіка вже у фронтенді — без моста
Rust→webview, через який відкладено OS-глобальний `Ctrl+Shift+U` (він
лишається окремою задачею; при імплементації додати перехресну примітку в
keyboard-shortcuts.md). З Teams/Discord не конфліктує (у них `Ctrl+Shift+M`).

### `F9` — озвучити «що зараз грає» (Tier 2)

Запозичення TapinRadio F11: разовий polite-анонс через `LiveAnnouncer` /
`useAnnounce`, **без руху фокуса** — зараз, щоб дізнатися стан, треба
F6-ходити в зону плеєра і назад. Зміст повідомлення з `$playerStatus` +
статуси записів: «Нічого не відтворюється» / станція + трек / файл (+ позиція)
/ «запис: N потоків». Споріднений із
[screen-reader-direct-speech](p3-screen-reader-direct-speech.md), але
незалежний: live region, не direct-speech API. Стандартне Tier-2 глушення в
модалях зберігається.

### `F4` — редактор тегів (Songs, Tier 2′)

Конвенція Total Commander/FAR «F4 = редагувати вміст» (F2 = rename уже
зайнятий). List-scoped за прецедентом `F2`: `resolveKeyAction` →
`onAction("tags")` (id `tags` уже існує в `SongContextMenu`), гілка лише в
`SongsList`, інші списки інтент ігнорують. `aria-keyshortcuts` рядка Songs
доповнюється `F4` — **координувати** з
[open-song-with-default-app](p1-open-song-with-default-app.md) (той додає
`Alt+Enter Control+Enter` на ті самі рядки; хто лендиться другим — зливає
рядок атрибута).

## Критерії готовності

- [ ] `Ctrl+F`: фокус пошуку на Browser/Songs; на інших секціях — no-op,
      Find bar WebView2 не відкривається ніде (`e.code === "KeyF"`, ctrlOrMeta)
- [ ] `Ctrl+M`: toggle `$muteState` + polite-анонс; `e.repeat` ігнорується
- [ ] `F9`: анонс станів idle / стрім (станція+трек) / файл / активні записи;
      фокус не рухається
- [ ] `F4` (Songs): відкриває TagEditorDialog фокусованого рядка; інші списки
      без падінь; `aria-keyshortcuts` оновлено (координація з open-song)
- [ ] Усі чотири — reserved у `SHORTCUTS` (гард KeyRecorder) + F1-довідник
      (групи global/list) + i18n-лейбли uk/en
- [ ] `docs/keyboard-shortcuts.md`: Tier 2 (+Ctrl+F, Ctrl+M, F9) і Tier 2′
      (+F4), примітка Ctrl+M ↔ відкладений Ctrl+Shift+U
- [ ] Тести: диспетч кожного комбо; Ctrl+F на секції без пошуку →
      `defaultPrevented` без падіння; F4 з модифікаторами не тригерить
- [ ] NVDA-прогін: анонси Ctrl+M/F9, фокус Ctrl+F, F4-діалог (мануально,
      перед релізом)
- [ ] `pnpm test` без регресій

## Свідомо не додано (рішення 2026-07-23)

- **Записати все / Зупинити все** — OS-хоткеї `Ctrl+Shift+R`/`Ctrl+Shift+S`
  працюють і при фокусі у вікні; дублікат = дві комбінації на одну дію.
- **Гучність in-app** — `Ctrl+Alt+Up/Down` (OS) + стрілки слайдера (Tier 3).
- **Глобальне перемикання профілів (Ctrl+цифра)** — руйнівна дія (зупиняє всі
  записи за моделлю профілів), one-keystroke небезпечний; Enter на рядку досить.
- **Duplicate профілю** — чинне рішення «тільки меню» (carve-out у реєстрі).
- **Ctrl+O імпорт, експорт, сортування, фільтр-чіпи** — не проходять критерій
  частоти; шлях — командна палітра (`Ctrl+K`, розширення в
  command-palette-phase-3).
- **Голі літери (Winamp-стиль Z/X/C/V)** — конфлікт із текстовими полями та
  browse mode; заборонено інваріантом реєстру.
- **F3/F7/F11/F12** — акселератори WebView2 (find next / caret browsing /
  fullscreen / DevTools); подавлення F3/F7/F11 — скоуп
  [webview-reload-guard](done/p2-webview-reload-guard.md). NVDA-прогін того
  запису (2026-08-07, сценарій 15, Edge) підтвердив: F3/F7 інертні — у пулі
  вільних голих F-клавіш вище; F11 зайнятий (fullscreen спрацьовує) —
  лишається виключеним.

## Документи

- Реєстр: [docs/keyboard-shortcuts.md](../keyboard-shortcuts.md) (Tier 2 / 2′,
  конвенції: `e.code`, capture, `e.repeat`)
- Код: `src/lib/shortcuts.ts` (реєстр + reserved), `src/hooks/useCompositeList.ts`
  (`resolveKeyAction`, прецедент F2), `src/stores/player.ts`
  (`$playerStatus`/`$muteState`), `src/components/common/LiveAnnouncer` /
  `useAnnounce` (F9)
- Суміжні: [p2-webview-reload-guard.md](done/p2-webview-reload-guard.md) (F3/F7/F11),
  [p1-open-song-with-default-app.md](p1-open-song-with-default-app.md)
  (координація aria-keyshortcuts Songs),
  [p3-screen-reader-direct-speech.md](p3-screen-reader-direct-speech.md) (F9 —
  споріднений, не залежить)
- [TapinRadio shortcut keys — pc-audio](https://www.mail-archive.com/pc-audio@pc-audio.org/msg56302.html) ·
  [TapinRadio help](http://www.tapinradio.com/help/lessons/General.html)
- [Overriding default browser shortcuts (Chromium)](https://www.robin-drexler.com/2015/07/07/overriding-default-browser-shortcuts)
- [NVDA Commands Quick Reference](https://download.nvaccess.org/documentation/keyCommands.html)
  — голі F4/F8/F9 і Ctrl+F/Ctrl+M не заброньовані
