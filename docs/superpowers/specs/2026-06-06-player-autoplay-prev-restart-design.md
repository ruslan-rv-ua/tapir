# Дизайн: Autoplay-next, Prev-restart та уніфікація transport-логіки плеєра

> Статус: approved (дизайн затверджено власником продукту 2026-06-06)
> Дата: 2026-06-06
> Гілка: `feat/player-autoplay-prev-restart`
> Базис: продовження `docs/FRD-player-prev-next.md` (§7.2, §7.4, §13 — ці фічі там свідомо відкладені)

## 1. Призначення

Реалізувати три повʼязані речі:

1. **Autoplay-next** — на природному завершенні файлу автоматично відтворити наступний у контексті (опційно, дефолт **увімкнено**; лише для джерела `file`).
2. **Prev-restart** — кнопка «Попередній» рестартує поточний трек, якщо він грає довше за поріг N (опційно, дефолт **вимкнено**; налаштовується в секундах; лише для `file`).
3. **Уніфікація** — звести prev/next/auto-advance до однієї чистої політики `resolveTransportAction`, а активність кнопок вивести з неї.

### Продуктові рішення (зафіксовані)

- Autoplay: **ON** за замовчуванням. Лише `file` (потоки нескінченні — ніколи не авто-переходять).
- Prev-restart: модель — **одне число** `prevRestartThresholdMs`; `0` = вимкнено (prev завжди на попередній трек), `>0` = поріг. Дефолт **0**.
- Рестарт **явно озвучується** (assertive), щоб не повертати «прихований режим за часом», якого уникав FRD §7.2.
- Налаштування — у вкладці **Audio**, нова секція «Playback».

## 2. Контекст коду (перевірено)

- Рушій уже детектує природне завершення файлу: цикл-монітор виставляє `ended_naturally`, коли sink спорожнів, і **емітить узагальнений `Stopped`** (`src-tauri/src/player/engine.rs:209-233`). Фронт **не може відрізнити** природний кінець від ручної зупинки/помилки.
- Будь-який перехід у `stopped` озвучується assertive «playback stopped» (`src/App.tsx:214-215`).
- `$playerStatus` містить живі `positionMs`/`durationMs` (мерджаться з події `player-progress`, `App.tsx:260-262`).
- Сусіди контексту вже обчислює `computePlaybackNeighbors(source, streams, songs)` + computed `$playbackNeighbors` (`src/stores/playbackNeighbors.ts`).
- `GlobalSettings` — forward-compatible Rust-структура з `#[serde(default = …)]` на кожному полі (`src-tauri/src/settings.rs:13`), дзеркало у `src/lib/tauri.ts:70`; зберігається через `save_settings`. UI — вкладки `SettingsDialog`; автозбереження через `useAutoSave` (`src/components/settings/AudioTab.tsx`).
- Наявні IPC, які перевикористовуємо без змін контракту: `play_stream`, `play_saved_song`, `seek_playback`, `stop_playback`.

## 3. Архітектурне рішення (хто володіє «кінцем треку»)

**Обрано (A):** рушій на природному завершенні емітить **нову подію `player-ended { path }`** і лишається внутрішньо зупиненим; **узагальнений `Stopped` з цього шляху більше не емітиться**. Наслідок (авто-перехід чи фіналізація-стоп) **вирішує фронтенд**.

- Переваги: бекенд лишається «playlist-dumb» (узгоджено з FRD §2.1); єдина точка рішення; немає подвійного озвучення (`App.tsx:214` не спрацьовує передчасно); перевикористання наявних play/seek/stop IPC.
- **Відхилено B:** лишити `Stopped` + додати `player-ended`, а стоп-озвучення глушити прапорцем при авто-переході — крихка звʼязність за порядком подій.
- **Відхилено C:** автоплей у самому рушії — заносить знання про контекст/чергу в бекенд, дублює фронтову модель живого контексту.

## 4. Backend (Rust)

### 4.1. Подія `player-ended`

- Новий payload:
  ```rust
  #[derive(Clone, Serialize)]
  #[serde(rename_all = "camelCase")]
  pub struct PlayerEndedPayload { pub path: String }
  ```
- У `engine.rs` (гілка `ended_naturally`, ~`:226-233`): замість `emit_player_status(Stopped)` зробити `app.emit("player-ended", PlayerEndedPayload { path })`, де `path` — шлях поточного файлу (доступний у `play_file`; прокинути в монітор-таск клоном). Рушій лишається внутрішньо зупиненим (sink уже спорожнів).
- Гілку завершення/помилки потоку (`:820-831`) **не чіпати** — вона й далі емітить `Stopped` (потоки не авто-переходять).

### 4.2. Нові поля налаштувань (лише зберігання)

У `GlobalSettings` (`settings.rs`) додати з наявним патерном:
```rust
#[serde(default = "default_true")]
pub auto_advance: bool,
#[serde(default)]            // u32 default = 0 → вимкнено
pub prev_restart_threshold_ms: u32,
```
Оновити `impl Default for GlobalSettings` (`auto_advance: true`, `prev_restart_threshold_ms: 0`). Рушій ці поля **не читає**. Нових команд немає.

## 5. Frontend

### 5.1. Типи й подія (`src/lib/tauri.ts`)

- `GlobalSettings`: додати `autoAdvance: boolean; prevRestartThresholdMs: number;`.
- Додати `export interface PlayerEndedPayload { path: string }`.

### 5.2. Чиста політика transport (`src/lib/playbackTransport.ts`, новий)

```ts
import type { PlaybackSource } from "./tauri";
import type { PlaybackNeighbors } from "../stores/playbackNeighbors";

export type TransportAction =
  | { kind: "play-stream"; id: string }
  | { kind: "play-file"; path: string }
  | { kind: "seek-start" }
  | { kind: "stop" }
  | { kind: "none" };

export type TransportTrigger = "prev" | "next" | "auto-advance";

export interface TransportContext {
  source: PlaybackSource | null;
  positionMs: number | null;
  neighbors: PlaybackNeighbors;
  prevRestartThresholdMs: number;
}

export function resolveTransportAction(
  trigger: TransportTrigger,
  ctx: TransportContext,
): TransportAction;
```

Правила (чисто, без сторів):

| trigger | умова | результат |
| --- | --- | --- |
| `next` | `neighbors.next` є | `play-*` за `neighbors.next` |
| `next` | інакше | `none` |
| `auto-advance` | `neighbors.next` є | `play-*` за `neighbors.next` |
| `auto-advance` | інакше (кінець списку / якір зник) | `stop` |
| `prev` | `source.type==="file"` & `prevRestartThresholdMs>0` & `positionMs!=null` & `positionMs > prevRestartThresholdMs` | `seek-start` |
| `prev` | інакше, `neighbors.prev` є | `play-*` за `neighbors.prev` |
| `prev` | інакше | `none` |

`neighbors.prev/next` — це `NeighborTarget` (`{kind:"stream",id}` | `{kind:"file",path}`); `play-*` мапиться 1:1. Функція приймає вже обчислені `neighbors` (а не стори) — повністю юніт-тестована.

### 5.3. PlayerPanel (`src/components/player/PlayerPanel.tsx`)

- Зчитати `positionMs` з `$playerStatus` і `prevRestartThresholdMs` з `$settings`. Побудувати `ctx = { source, positionMs, neighbors, prevRestartThresholdMs }`.
- `const canPrev = resolveTransportAction("prev", ctx).kind !== "none";`
  `const canNext = resolveTransportAction("next", ctx).kind !== "none";`
  Гейтовані як і раніше через `isActive` (тобто `isActive && …`). **Обидва** використовуються і для `isDisabled` кнопок, і для `enabled` focus-stop (єдине джерело істини). Наслідок: prev стає активним **і на першому треку**, щойно `positionMs` перетне поріг (для рестарту).
- `handleSkip(trigger: "prev" | "next")`:
  ```ts
  const action = resolveTransportAction(trigger, ctx);
  if (action.kind === "none" || navPendingRef.current) return;
  navPendingRef.current = true;
  try {
    // boundary-focus: якщо натиснута кнопка стане "none" після дії — фокус на Play/Pause
    // (узагальнення наявного предиктора: для seek-start positionMs→0 змінює resolve("prev")).
    if (willPressedBecomeNone(trigger, action, ctx)) playPauseRef.current?.focus();
    switch (action.kind) {
      case "play-stream": await tauri.playStream(action.id); break;
      case "play-file":   await tauri.playSavedSong(action.path); break;
      case "seek-start":  await tauri.seekPlayback(0);
                          announce(m.player_restarted(), "assertive"); break;
      // "stop" не виникає для prev/next — лише для auto-advance (§5.4).
    }
  } catch (e) { console.error(e); announce(m.playback_error(), "assertive"); }
  finally { navPendingRef.current = false; }
  ```
- Поведінка озвучення джерел `play-*` лишається наявною (`App.tsx` «Playing: {name}»); для `seek-start` — окреме `player_restarted`.

> Примітка щодо `willPressedBecomeNone`: для `next`/`prev`-navigation предиктор той самий, що в v1 (чи стане сусід `none` після переходу). Для `seek-start` після дії `positionMs→0`, тож `resolve("prev")` на пост-стані дає `play`/`none` залежно від наявності `neighbors.prev`; це визначає, чи лишиться prev активним. Реалізація — мала чиста допоміжна функція поряд із `resolveTransportAction`.

### 5.4. Auto-advance (хендлер події в `App.tsx`)

Рішення винести в чисту/тестовану функцію, напр. `resolveEndedAction(path, { autoAdvance, streams, songs }) → TransportAction`, що:
1. будує `source = { type:"file", path }`;
2. `neighbors = computePlaybackNeighbors(source, streams, songs)`;
3. якщо `!autoAdvance` → `{ kind:"stop" }`;
4. інакше → `resolveTransportAction("auto-advance", { source, positionMs:null, neighbors, prevRestartThresholdMs:0 })`.

Підписка в `App.tsx` на `player-ended`:
```ts
const action = resolveEndedAction(payload.path, {
  autoAdvance: $settings.get()?.autoAdvance ?? true,
  streams: $streams.get(),
  songs: $filteredSongs.get(),
});
try {
  if (action.kind === "play-file") await tauri.playSavedSong(action.path);
  else await tauri.stopPlayback();        // kind "stop" (вимкнено / кінець списку)
} catch (e) { console.error(e); await tauri.stopPlayback(); }  // skip-on-error guard
```

- Немає подвійного озвучення: рушій більше не емітить `Stopped` на природному кінці, тож звучить рівно один змістовний результат — «Playing: {next}» (авто-перехід) або «playback stopped» (кінець/вимкнено/помилка).
- Контекст береться **наживо** з `$filteredSongs` на момент завершення (узгоджено з моделлю живого контексту).

### 5.5. i18n (`src/i18n/messages/{en,uk}.json`, регенерація paraglide)

- `player_restarted`: en «Restarting track»; uk «Спочатку треку».
- `settings_auto_advance` (підпис чекбокса): en «Auto-play next track»; uk «Автоматично відтворювати наступний трек».
- `settings_prev_restart_threshold` (підпис поля, секунди): en «“Previous” restarts track if played longer than (seconds, 0 = off)»; uk ««Попередній» рестартує трек, якщо грав довше ніж (секунд, 0 = вимк)».
- Перегенерувати через `pnpm vite:build` (`tsc` не гейт — памʼять `typecheck-paraglide-gotchas`).

### 5.6. Settings UI (`src/components/settings/AudioTab.tsx`, секція «Playback»)

- Чекбокс `autoAdvance` (react-aria `Checkbox` за патерном інших булевих налаштувань — звірити з `GeneralTab.tsx`).
- Числове поле для порога у **секундах** (UI: секунди; стор: мс ×1000; `0` = вимк). Валідація: ціле ≥ 0.
- Звʼязати з `$settings` + `useAutoSave` як наявний контрол пристрою. Доступні підписи/опис.

## 6. Тестування

- **Pure** `src/lib/playbackTransport.test.ts`: матриця `resolveTransportAction` — `prev` з/без порога, `file` vs `stream`, `positionMs` нижче/вище/`null`, `next`, `auto-advance`, межі (clamp→`none` для next, `stop` для auto-advance), якір не в контексті.
- **Pure** `resolveEndedAction`: авто-перехід → `play-file`; кінець списку → `stop`; `autoAdvance=false` → `stop`.
- **PlayerPanel** (`PlayerPanel.test.tsx`, доповнити): `prev` рестарт (`seekPlayback(0)` + `player_restarted` announce) коли file & position>threshold; prev активний на першому треку за порогом; `next` далі навігує; race-guard цілий; стани кнопок із резолвера.
- **`computePlaybackNeighbors`** — без змін (наявні тести лишаються).
- **Rust** (`src-tauri`): serde round-trip `GlobalSettings` із новими дефолтами (`auto_advance=true`, `prev_restart_threshold_ms=0`) та forward-compat (старий JSON без полів); серіалізація `PlayerEndedPayload` у camelCase `{ "path": … }`.

## 7. Гейти й слід змін

- **Гейти:** `pnpm test` + `pnpm vite:build`; **`cargo test` + `cargo build`** у `src-tauri` (перші зміни в Rust у цій лінії робіт).
- **Нові файли:** `src/lib/playbackTransport.ts` (+ `.test.ts`); (опц.) винесений `resolveEndedAction` поряд або в тому ж модулі.
- **Змінені (frontend):** `src/lib/tauri.ts` (тип+payload), `src/components/player/PlayerPanel.tsx`, `src/App.tsx` (підписка), `src/components/settings/AudioTab.tsx`, `src/i18n/messages/{en,uk}.json` (+ регенерація), `PlayerPanel.test.tsx`.
- **Змінені (backend):** `src-tauri/src/player/engine.rs` (подія), `src-tauri/src/settings.rs` (поля+Default), можливо місце оголошення `PlayerEndedPayload`.
- **IPC-контракти play/seek/stop** — без змін; додається лише вихідна подія `player-ended`.

## 8. Доступність

- `seek-start` озвучується явно (`player_restarted`, assertive) — поріг не «прихований».
- Auto-перехід дає рівно одне assertive-оголошення «Playing: {name}» (наявний потік), без дубля «stopped».
- Зміна `canPrev` при перетині порога змінює набір focus-stops під час відтворення; наявний механізм ремапу `usePlayerZoneNav` це коректно обробляє.
- Усі нові контроли налаштувань мають доступні підписи й клавіатурну досяжність за патерном вкладок.

## 9. Поза скоупом (YAGNI)

- repeat-all / repeat-one / shuffle (resolver лишає для них місце, але не реалізуємо).
- Prev/next/autoplay для `preview`.
- Крос-фейд, гаплес.
- Будь-які зміни IPC-контрактів play/seek/stop або логіки запису.

## 10. Критерії приймання

1. Файл, що завершився природно, при `autoAdvance=on` запускає наступний у `$filteredSongs`; на кінці списку або при `autoAdvance=off` — плеєр у `stopped`; без дубльованих оголошень.
2. Битий/нечитний наступний файл не створює циклу — після помилки плеєр зупиняється.
3. Потоки ніколи не авто-переходять; завершення/помилка потоку поводиться як раніше.
4. При `prevRestartThresholdMs=0` поведінка prev незмінна (завжди попередній). При `>0` і `file` з `positionMs>поріг` — prev рестартує трек (`seek 0`) з assertive-оголошенням; інакше йде на попередній. Для `stream` поріг ігнорується.
5. Активність prev/next строго дорівнює `resolveTransportAction(...).kind !== "none"` (з `isActive`-гейтом); prev активний на першому треку за порогом.
6. Швидкі натискання не створюють накладених сесій (race-guard).
7. Нові налаштування зберігаються й відновлюються; старий конфіг без полів вантажиться з дефолтами (`auto_advance=true`, поріг `0`).
8. Гейти зелені: `pnpm test`, `pnpm vite:build`, `cargo test`, `cargo build`.
