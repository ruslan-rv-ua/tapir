# Дизайн імплементації: кнопки плеєра «Попередній / Наступний трек»

> Статус: approved (дизайн затверджено власником продукту 2026-06-06)
> Дата: 2026-06-06
> Гілка: `feat/player-prev-next`
> Джерело вимог: [docs/FRD-player-prev-next.md](../../FRD-player-prev-next.md)

## 1. Контекст

FRD закрив усі **продуктові** питання. Цей документ фіксує **технічний дизайн** імплементації — без повторного відкриття продуктових рішень. Кнопки prev/next зараз існують як назавжди вимкнені заглушки у [PlayerPanel.tsx:274-318](../../../src/components/player/PlayerPanel.tsx#L274-L318); їх треба «оживити».

Бекенд та IPC-контракти **не змінюються**: prev/next перевикористовують наявні `play_stream` / `play_saved_song`.

### Ключові факти коду (перевірено)

- Сторінки-джерела — nanostores: [`$playerStatus`](../../../src/stores/player.ts), [`$streams`](../../../src/stores/streams.ts), computed [`$filteredSongs`](../../../src/stores/songs.ts) (сортування `date|title|artist|size` + фільтри пошук/станція; вже реактивний).
- IPC-обгортки існують: [`playStream`](../../../src/lib/tauri.ts), [`playSavedSong`](../../../src/lib/tauri.ts).
- `PlaybackSource = { type: "stream"; streamId } | { type: "file"; path } | { type: "preview"; url; name }`.
- `PlayerPanel` тримає масив `stops: FocusStop[]` і передає його в [`usePlayerZoneNav`](../../../src/hooks/usePlayerZoneNav.ts), який реалізує clamp-без-зациклення і **сам ремапить/переміщує фокус, коли сфокусований stop стає вимкненим** (ефект на зміну `stops`, рядки 153-189).
- Прецедент guard-у від гонок: `mutePendingRef` у `handleMute`.

## 2. Архітектурне рішення

**Обрано Approach A — nanostores `computed` store** (ідіоматично для цього коду; пор. `$filteredSongs`, `$songsStations`). Чиста функція-ядро відокремлена для юніт-тестів; React-шар тонкий (`useStore`).

Відхилено: React-хук (зайвий React-шар над тією ж чистою функцією) та inline-у-компоненті (роздуває 360-рядковий `PlayerPanel`, логіку можна тестувати лише через повний рендер).

## 3. Новий модуль: `src/stores/playbackNeighbors.ts`

### 3.1. Типи й чисте ядро

```ts
export type NeighborTarget =
  | { kind: "stream"; id: string }
  | { kind: "file"; path: string };

export interface PlaybackNeighbors {
  prev: NeighborTarget | null;
  next: NeighborTarget | null;
}

export function computePlaybackNeighbors(
  source: PlaybackSource | null,
  streams: StreamInfo[],
  songs: Song[],
): PlaybackNeighbors;
```

`null` для `prev`/`next` означає «кнопка вимкнена». Повертається **дескриптор** (не thunk) — тести перевіряють дані, а обробник натискання сам диспетчеризує `kind → playStream/playSavedSong`.

### 3.2. Правила (усі з FRD §6.1-6.2, §7.5)

| Вхід | Результат |
| --- | --- |
| `source === null` | `{ prev: null, next: null }` |
| `source.type === "preview"` | `{ prev: null, next: null }` |
| `stream`, `streamId` не знайдено в `streams` | `{ prev: null, next: null }` (анкер не в контексті) |
| `file`, `path` не знайдено в `songs` | `{ prev: null, next: null }` (відфільтровано/видалено) |
| контекст з 1 елемента | `{ prev: null, next: null }` |
| на першому елементі | `prev: null`, `next: сусід` |
| на останньому елементі | `prev: сусід`, `next: null` |
| у середині | обидва сусіди |

Анкер для `stream` — за `streamId`; для `file` — за `path`. Порядок контексту = порядок переданих масивів (`$streams` як у списку Потоків; `$filteredSongs` з активними сортуванням/фільтрами).

### 3.3. Computed-стор

```ts
export const $playbackNeighbors = computed(
  [$playerStatus, $streams, $filteredSongs],
  (status, streams, songs) => computePlaybackNeighbors(status.source, streams, songs),
);
```

Жива переоцінка при зміні сортування/фільтра/потоків — безкоштовно з залежностей computed (FRD §5.2).

## 4. Зміни в `PlayerPanel.tsx`

### 4.1. Нові посилання й похідні значення

```ts
const prevRef = useRef<HTMLButtonElement>(null);
const nextRef = useRef<HTMLButtonElement>(null);
const navPendingRef = useRef(false);

const neighbors = useStore($playbackNeighbors);
const canPrev = isActive && neighbors.prev !== null;
const canNext = isActive && neighbors.next !== null;
```

`canPrev`/`canNext` використовуються **і** для `isDisabled` кнопок, **і** для `enabled` focus-stop — щоб ці два стани не розійшлися.

### 4.2. Кнопки

Зняти зі stub-кнопок `isDisabled={true}`. Додати:

- prev: `ref={prevRef}`, `isDisabled={!canPrev}`, `onPress={() => handleSkip(neighbors.prev, "prev")}`;
- next: `ref={nextRef}`, `isDisabled={!canNext}`, `onPress={() => handleSkip(neighbors.next, "next")}`.

`tabIndex={-1}` і `@ts-expect-error`-коментар лишаються як в інших transport-кнопок.

### 4.3. Focus-stops (FRD §8.3)

Вставити prev і next у масив `stops` (порядок = DOM/візуальний: `prev → playPause → stop → next → mute`), увімкнені лише коли навігабельні:

```
… bitrateRow,
{ ref: prevRef, enabled: canPrev },     // НОВЕ — перед playPause
playPause, stop,
{ ref: nextRef, enabled: canNext },     // НОВЕ — після stop, перед mute
mute, position, output, volume
```

Додати `neighbors.prev`, `neighbors.next` (або `canPrev`, `canNext`) у масив залежностей `useMemo`. Вимкнені prev/next не є focus-stops і не порушують порядок — наявний механізм ремапу це підтримує.

### 4.4. Обробник переходу (race guard §7.3 + фокус на межі)

```ts
const handleSkip = useCallback(
  async (target: NeighborTarget | null, direction: "prev" | "next") => {
    if (!target || navPendingRef.current) return;
    navPendingRef.current = true;

    // Передбачаємо: чи вимкнеться натиснута кнопка після переходу? Якщо так —
    // переносимо фокус на Play/Pause ДО зміни джерела (поки набір stops ще не
    // згорнувся), щоб ефект ремапу не «викинув» фокус на Mute.
    const targetSource: PlaybackSource =
      target.kind === "stream"
        ? { type: "stream", streamId: target.id }
        : { type: "file", path: target.path };
    const after = computePlaybackNeighbors(
      targetSource, $streams.get(), $filteredSongs.get(),
    );
    const willDisablePressed = direction === "next" ? !after.next : !after.prev;
    if (willDisablePressed) playPauseRef.current?.focus();

    try {
      if (target.kind === "stream") await tauri.playStream(target.id);
      else await tauri.playSavedSong(target.path);
      // Без announce тут — App.tsx озвучує «Playing: {назва}» по player-status (§8.4).
    } catch (e) {
      console.error(e);
      announce(m.playback_error(), "assertive");
    } finally {
      navPendingRef.current = false;
    }
  },
  [announce],
);
```

### 4.5. Поведінка фокуса на межі (уточнення продуктового рішення)

Обрано власником продукту: **anchor to Play/Pause**. Уточнення дизайну:

- **На межі** (натиснута кнопка ось-ось вимкнеться) → фокус переходить на Play/Pause (стабільний, завжди увімкнений під час active). `playPauseRef.current?.focus()` синхронно перед зміною джерела; коли набір stops згортається, ефект ремапу бачить активний stop (Play/Pause) увімкненим → лише переіндексовує, фокус не стрибає на Mute.
- **У середині списку** (натиснута кнопка лишається увімкненою) → фокус **залишається на натиснутій skip-кнопці**, щоб можна було тиснути Next→Next→Next і йти списком. Ефект ремапу сам утримає фокус на тій самій кнопці.

### 4.6. Що НЕ змінюється

- Озвучення: окремого announce для самого натискання немає — старт нового джерела вже дає `player-status` → App.tsx озвучує «Playing: {назва}» (§8.4). Дубльованих оголошень немає.
- Гучність/mute: переносяться наявною логікою `handlePlayerStatus` (App.tsx) при зміні джерела. Окремих дій не потрібно.
- Перемикання профілю: `switch_profile` уже зупиняє все → плеєр у `stopped` → prev/next природно вимкнені. Коду міняти не треба (§6.4).

## 5. i18n (FRD §7.1)

| Ключ | en (було → стало) | uk (стало) |
| --- | --- | --- |
| `player_prev` | "Previous stream" → **"Previous track"** | **"Попередній трек"** |
| `player_next` | "Next stream" → **"Next track"** | **"Наступний трек"** |

Файли: `src/i18n/messages/en.json`, `src/i18n/messages/uk.json`. Перегенерувати paraglide через `pnpm vite:build` (vite-плагін; `tsc` не є гейтом — пам'ять `typecheck-paraglide-gotchas`). Accessible name кнопок лишається статичним підписом.

## 6. Тести

### 6.1. `src/stores/playbackNeighbors.test.ts` — чисте ядро

Матриця для `computePlaybackNeighbors` (виклик з простими масивами, без React):

- `source === null` → `{ null, null }`;
- `preview` → `{ null, null }`;
- `stream`: середина (правильні id сусідів), перший (`prev: null`), останній (`next: null`), один елемент (обидва `null`), анкер не знайдено (обидва `null`);
- `file`: та сама матриця за `path`;
- перевірка, що порядок береться з переданого масиву (для `file` — імітація `$filteredSongs` з нетиповим порядком).

### 6.2. `src/components/player/PlayerPanel.test.tsx` — компонент (новий файл)

За зразком наявних vitest + React Testing Library тестів і `vi.mock("../../lib/tauri")` (пор. `StreamItem.test.tsx`):

- стани `isDisabled` prev/next відповідають `neighbors` (виставити стори → рендер → перевірити `disabled`/`aria-disabled`);
- `onPress` викликає `playStream`/`playSavedSong` з правильним аргументом (stream-контекст і file-контекст);
- **race guard**: `playStream` повертає «завислий» проміс; два натискання поспіль → IPC викликано рівно один раз (§7.3, §11.5).

## 7. Гейти й слід змін

- **Гейти перевірки:** `pnpm test` + `pnpm vite:build`.
- **Нові файли:** `src/stores/playbackNeighbors.ts`, `src/stores/playbackNeighbors.test.ts`, `src/components/player/PlayerPanel.test.tsx`.
- **Змінені файли:** `src/components/player/PlayerPanel.tsx`, `src/i18n/messages/en.json`, `src/i18n/messages/uk.json`.
- **Бекенд / IPC-контракти:** без змін.

## 8. Відповідність критеріям приймання FRD §11

| Критерій FRD | Покриття дизайном |
| --- | --- |
| §11.1 контекст за типом джерела, clamp на межах | `computePlaybackNeighbors` (§3.2) + тести §6.1 |
| §11.1 preview/stopped/no-source/анкер-не-в-контексті → вимкнено | `computePlaybackNeighbors` → `{null,null}` |
| §11.2 заміна джерела, перенос гучності/mute | наявний рушій + `handlePlayerStatus` (§4.6) |
| §11.3 перемикання профілю → stopped → вимкнено | без змін коду (§4.6) |
| §11.4 порядок focus-stops, вимкнені не ламають навігацію | `stops` (§4.3) + `usePlayerZoneNav` |
| §11.4 підпис кнопок, без дубль-оголошень | i18n (§5) + без власного announce (§4.6) |
| §11.5 швидкі натискання без накладених сесій | `navPendingRef` (§4.4) + тест §6.2 |
| §11.5 зникнення елемента → вимкнено без втрати фокуса | анкер-не-в-контексті → `{null,null}`; фокус-якорінг (§4.5) |
