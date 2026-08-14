---
slug: hotkeys-expansion
title: "Клавіші плеєра і рядків Songs: Ctrl+M (mute), F9 (що грає), F4 (теги), F2 (перейменувати)"
priority: P2
type: planned
status: ready
effort: M
kind: feature
target: 0.1.0
updated: 2026-08-14
a11y: true
depends_on: []
blocks: []
touches:
  - src/lib/shortcuts.ts
  - src/lib/muteControl.ts
  - src/lib/playbackDescription.ts
  - src/hooks/useGlobalShortcuts.ts
  - src/hooks/useCompositeList.ts
  - src/components/player/PlayerPanel.tsx
  - src/components/songs/SongsList.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
  - docs/keyboard-shortcuts.md
gates: [pnpm test, pnpm vite:build]
notes:
  - "Модель — TapinRadio (еталонний доступний радіо-рекордер, розсилка pc-audio): голі F-клавіші + Ctrl+літери; F9-анонс — запозичення TapinRadio F11 (Announce currently playing song), F11 у WebView2 зайнятий fullscreen"
  - "Вільні голі F-клавіші у webview: F3, F4, F7, F8, F9 (F11=fullscreen, F12=DevTools — акселератори WebView2; F10 — семантика меню; NVDA голі F-клавіші не біндить). Після цього запису вільними лишаються F3, F7, F8"
  - "Пул F3/F7 заміряно 2026-08-07 (NVDA-прогін webview-reload-guard, сценарій 15, Microsoft Edge — той самий рушій, що й WebView2): обидві інертні, приєднані до пулу вище. F11 підтверджено зайнятий (fullscreen спрацьовує) — лишається виключеним"
  - "Ctrl+F виїхав окремим записом (search-focus-hotkey, grilling 2026-08-14): йому потрібна нова інфраструктура фокуса й правка переліку гарда — тут би він блокував три дрібні клавіші"
  - "Ctrl+M НЕ закриває відкладений Tier-1 toggle_mute (Ctrl+Shift+U, OS-global): той потребує міст Rust→webview і лишається окремою задачею. Але цей запис готує для нього ґрунт — виносить mute-логіку в src/lib/muteControl.ts, куди міст і буде дзвонити"
  - "Лічильник активних записів голосом («пишеться N потоків») у F9 свідомо не входить (grilling 2026-08-14) — якщо потреба підтвердиться, це окрема клавіша з пулу (F8)"
---

# Клавіші плеєра і рядків Songs: Ctrl+M (mute), F9 (що грає), F4 (теги), F2 (перейменувати)

> **Контекст:** друга хвиля аудиту шорткатів, рішення 2026-07-23 (перша —
> [streams-transfer-hotkeys](done/p2-streams-transfer-hotkeys.md): F5/Shift+F5).
> Запис прогрильовано 2026-08-14; `Ctrl+F` за результатом відщеплено в
> [search-focus-hotkey](p2-search-focus-hotkey.md), сюди додано `F2` на Songs.
> Відхилені кандидати — у «Свідомо не додано» нижче.

## Опис

### `Ctrl+M` — вимкнути/увімкнути звук (Tier 2)

Прецеденти: TapinRadio `Ctrl+M`, YouTube `M`. З Teams/Discord не конфліктує (у них
`Ctrl+Shift+M`).

Mute — **не** `$muteState.set`: це async `tauri.setVolume`, обчислення `savedVolume`
і прапорець проти подвійного натискання, і сьогодні все це живе всередині
[PlayerPanel.tsx:174](../../src/components/player/PlayerPanel.tsx#L174). Тому перший
крок — винести його в **`src/lib/muteControl.ts`** (за зразком `transportControl.ts`):
`toggleMute(announce)` володіє викликом у бекенд, `savedVolume`, приватним
pending-прапорцем і формулюванням. Далі з нього їдять і кнопка плеєра, і `Ctrl+M`, і —
згодом — міст Rust→webview для відкладеного `Ctrl+Shift+U`.

**Заразом лікується наявний баг.** Кнопка озвучує *назву команди*, а не стан:
`announce(m.player_mute_action())` = «Вимкнути звук» **після** того, як звук уже
вимкнено, тоді як `aria-label` тієї ж кнопки в ту саму мить стає протилежним —
«Увімкнути звук» ([PlayerPanel.tsx:396](../../src/components/player/PlayerPanel.tsx#L396)).
Анонс переходить на станові формулювання («Звук вимкнено» / «Звук увімкнено»), лейбл
кнопки лишається імперативним — це різні речі й різні ключі i18n.

### `F9` — озвучити «що зараз грає» (Tier 2)

Запозичення TapinRadio F11: разовий анонс через `useAnnounce`, **без руху фокуса** —
зараз, щоб дізнатися стан, треба F6-ходити в зону плеєра й назад. Це не «озвучити те,
що мовчить»: блок «Зараз грає» уже має `aria-live`
([PlayerPanel.tsx:281](../../src/components/player/PlayerPanel.tsx#L281)) — `F9` дає
**повтор на вимогу** того, що прозвучало колись і пролетіло.

Речення відповідає рівно на одне питання — «що я зараз чую», без стану запису
(див. «Свідомо не додано»). Складається чистими хелперами в новому
**`src/lib/playbackDescription.ts`**:

- `sourceName(source, streams)` — переїзд приватного `useSourceLabel`
  ([PlayerPanel.tsx:60](../../src/components/player/PlayerPanel.tsx#L60)), який чистою
  функцією вже і є; після переїзду панель бере назву джерела **звідти ж**, тож
  розійтися дві версії не можуть;
- `describePlayback(...)` — саме речення, потрібне лише для `F9` (панель виражає той
  самий факт структурно, вузлами розмітки).

Перекривати треба **всі** дев'ять комбінацій: три джерела (`stream` / `file` /
`preview` — прев'ю у [CONTEXT.md](../../CONTEXT.md) є повноправним третім видом
джерела) × три стани (`stopped` / `playing` / `paused`). Трек для потоку живе не в
`$playerStatus`, а в `$statuses[streamId].currentTrack`.

**Клауза про звук.** Коли `$muteState.muted` — речення отримує суфікс «звук вимкнено».
Це єдиний стан, у якому відповідь без клаузи є прямою дезінформацією: користувач,
що сидить у тиші, натискає `F9` саме щоб зрозуміти тишу. У решті випадків
`describePlayback` до `$muteState` не звертається й речення лишається коротким.

### `F4` — редактор тегів, `F2` — перейменувати (Songs, Tier 2′)

Конвенція Total Commander/FAR: **`F2` = ім'я, `F4` = вміст**. Обидві половини
заводяться разом — інакше на Songs виходить найгірша комбінація: `F4` відкриває
редактор [тегів](../../CONTEXT.md), а `F2`, яку та сама конвенція обіцяє гучніше,
**мовчки з'їдається** (це стан сьогодні: `case "edit"` у
[useCompositeList.ts:621](../../src/hooks/useCompositeList.ts#L621) робить `consume()`,
а гілки Songs немає). Обидві дії вже існують у ⋯-меню й у панелі —
`setRenameFor` / `setTagEditorFor`
([SongsPanel.tsx:186](../../src/components/songs/SongsPanel.tsx#L186)); бракує рівно клавіш.

Інтент у спільному хуці зветься **`"edit-content"`**, не `"tags"`: словник
`useCompositeList` цілком узагальнений (`edit`, `copy`, `transfer-copy`), і `"tags"`
на Streams чи Wishlist просто брехав би. Ім'ям **не може** бути `metadata` — у
словнику домену «метадані ефіру» вже зайняте й означає інше (див. статтю «Теги»
в [CONTEXT.md](../../CONTEXT.md)).

Реалізація: `resolveKeyAction` → `case "F4"` (будь-який модифікатор → `null`, за
прецедентом `F5`, щоб `Alt+F4` лишився системним закриттям вікна) → `"edit-content"`;
гілки лише в `SongsList` (`edit-content` → `tags`, `edit` → `rename`), інші списки
інтент ігнорують. `aria-keyshortcuts` рядка Songs доповнюється `F2 F4` — там уже
лежить `Alt+Enter Control+Enter` від
[open-song-with-default-app](done/p1-open-song-with-default-app.md).

## Прийняті рішення (grilling 2026-08-14)

1. **`Ctrl+F` відщеплено** в [search-focus-hotkey](p2-search-focus-hotkey.md): йому
   потрібні нова інфраструктура фокуса й правка переліку гарда акселераторів, тобто
   інший ризик і інший обсяг. Три клавіші, що лишились, поділяють один прохід по
   `SHORTCUTS` / F1 / i18n / реєстру й один NVDA-прогін.
2. **`F9` — одна предметна область.** Стан запису в речення не входить: «що я чую» і
   «що пишеться на диск» — розведені терміни словника, і в застосунку в них уже різні
   канали (події `recording_started`/`recording_stopped` + рядок стану). Складене
   речення відсунуло б головне — трек — за службове.
3. **Один власник формулювання** для кожного шматка: `playbackDescription.ts` для назви
   джерела й речення, `muteControl.ts` для mute. Два незалежні рендери одного факту
   роз'їхались би при першій же зміні.
4. **`F2`→rename на Songs їде сюди** — той самий файл, той самий рядок
   `aria-keyshortcuts`, той самий прогін; окремий запис коштував би дорожче за
   однорядкову гілку. У реєстрі рядок `F2` для Songs переходить ⬜→✅.
5. **Пріоритет анонсів — за правилом**, а не за звичаєм: **відповідь на натискання
   користувача — `assertive`, фонова подія — `polite`**. Тому `Ctrl+M` і `F9` — обидва
   assertive (polite став би в чергу за балакучим `aria-live` треку, а на toggle, який
   тиснуть двічі поспіль, затримка гірша за переривання), а `recording_started`
   лишається polite. Правило дописується в «Конвенції реалізації»
   [keyboard-shortcuts.md](../keyboard-shortcuts.md).

## Критерії готовності

- [ ] `src/lib/muteControl.ts`: `toggleMute` володіє `setVolume`, `savedVolume`,
      pending-прапорцем і текстом; `PlayerPanel` і `Ctrl+M` кличуть **його**
- [ ] `Ctrl+M`: toggle звуку + assertive-анонс стану; `e.repeat` ігнорується;
      кнопка плеєра озвучує той самий текст (баг «назва команди замість стану» зник)
- [ ] `src/lib/playbackDescription.ts`: `sourceName` переїхав із `PlayerPanel`
      (панель бере назву джерела звідти), `describePlayback` покрито **табличним**
      тестом на 3 джерела × 3 стани + клаузу muted
- [ ] `F9`: assertive-анонс речення, фокус не рухається; прев'ю й пауза озвучені
      нарівні з потоком і файлом
- [ ] `F4` (Songs): відкриває редактор тегів фокусованого рядка; `F2` (Songs):
      відкриває перейменування; `Alt+F4` і будь-який інший модифікатор інтенту не
      дають; інші списки без падінь
- [ ] `aria-keyshortcuts` рядка Songs містить `F2 F4` поруч із наявними
      `Alt+Enter Control+Enter`
- [ ] Усі три комбінації — reserved у `SHORTCUTS` (гард KeyRecorder) + F1-довідник
      (групи global / list) + i18n-лейбли uk/en
- [ ] `docs/keyboard-shortcuts.md`: Tier 2 (+`Ctrl+M`, `F9`), Tier 2′ (+`F4`,
      `F2` Songs ⬜→✅), примітка `Ctrl+M` ↔ відкладений `Ctrl+Shift+U`, правило
      пріоритету анонсів у «Конвенціях реалізації»
- [ ] Тести: диспетч кожного комбо; `F4` з модифікаторами не тригерить;
      `edit-content` в іншому списку — без падіння
- [ ] NVDA-прогін (мануально, перед релізом): анонси `Ctrl+M` і `F9` у всіх станах,
      діалоги `F4`/`F2`, чеклист за скілом `writing-nvda-checklists`
- [ ] `pnpm test` без регресій

## Свідомо не додано (рішення 2026-07-23, доповнено 2026-08-14)

- **Лічильник активних записів у `F9`** — окрема предметна область; якщо потреба
  «скільки зараз пишеться» підтвердиться, це окрема клавіша (у пулі є `F8`).
- **Рівень гучності у `F9`** — це градація, а не «чути / не чути».
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
- Словник: [CONTEXT.md](../../CONTEXT.md) — «Теги» (проти «метаданих ефіру»), «Прев'ю»
- Код: `src/lib/shortcuts.ts` (реєстр + reserved), `src/hooks/useCompositeList.ts`
  (`resolveKeyAction`, прецеденти `F2`/`F5`), `src/stores/player.ts`
  (`$playerStatus`/`$muteState`), `src/components/player/PlayerPanel.tsx`
  (`handleMute`, `useSourceLabel` — обидва на виїзд), `src/lib/transportControl.ts`
  (зразок винесеного модуля дій)
- Суміжні: [search-focus-hotkey](p2-search-focus-hotkey.md) (відщеплений `Ctrl+F`),
  [p2-webview-reload-guard.md](done/p2-webview-reload-guard.md) (F3/F7/F11),
  [p1-open-song-with-default-app.md](done/p1-open-song-with-default-app.md)
  (`aria-keyshortcuts` рядка Songs),
  [p3-screen-reader-direct-speech.md](p3-screen-reader-direct-speech.md) (`F9` —
  споріднений, не залежить)
- [TapinRadio shortcut keys — pc-audio](https://www.mail-archive.com/pc-audio@pc-audio.org/msg56302.html) ·
  [TapinRadio help](http://www.tapinradio.com/help/lessons/General.html)
- [NVDA Commands Quick Reference](https://download.nvaccess.org/documentation/keyCommands.html)
  — голі F2/F4/F8/F9 і Ctrl+M не заброньовані
</content>
</invoke>
