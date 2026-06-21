# Баг: prev/next трек ігнорують сортування потоків

- **Слаг:** `playback-neighbors-sort`
- **Тип:** заплановано
- **Стан:** ready
- **Зусилля:** S
- **Оновлено:** 2026-06-15
- **Залежності:** Phase 2A (PlayerEngine ✅), сортування потоків (реалізовано у StreamsPanel)

## Опис

`Ctrl+Alt+Left` (попередній) та `Ctrl+Alt+Right` (наступний) — глобальні шорткати навігації між потоками. Реалізовані через `$playbackNeighbors` store.

**Баг:** `$playbackNeighbors` обчислюється на основі `$streams` — масиву у **insertion-order** (порядок додавання потоку). При цьому `StreamsPanel` відображає потоки через `sortedStreams` (усередині StreamsPanel, `useMemo`) — відсортований за `settings.sortBy` ("name" або "added").

Якщо список відсортовано за назвою (Аліса → Боря → Всеволод), але insertion-order: Боря → Аліса → Всеволод, то Ctrl+Alt+Left від Борі поверне нічого (Боря перший в insertion-order), а не Алісу (яка перша на екрані).

**Де проблема:**

```ts
// stores/playbackNeighbors.ts
export const $playbackNeighbors = computed(
  [$playerStatus, $streams, $filteredSongs],  // ← $streams = insertion-order!
  (status, streams, songs) => computePlaybackNeighbors(status.source, streams, songs),
);
```

`$streams` — канонічний insertion-order від бекенду. `sortedStreams` — локальна змінна у `StreamsPanel`, вона не зберігається у store і недоступна `$playbackNeighbors`.

## Виправлення

Один з підходів:

1. **`$sortedStreams` atom** — новий Nanostore atom, який `StreamsPanel` оновлює через `useEffect` при зміні `sortedStreams`. `$playbackNeighbors` використовує його замість `$streams`.

2. **Сортувати у `computePlaybackNeighbors`** — передавати `sortBy` і `language` як параметри і сортувати масив прямо там. Дублює логіку `StreamsPanel`.

3. **Зберігати `sortedStreams` у store** — замінити `$streams` на вже відсортований масив. Але `$streams` — канонічний, нельзя змішувати.

**Рекомендований варіант 1** — `$sortedStreams` atom, оновлюється `useEffect` у `StreamsPanel`. Узгоджено з архітектурою проєкту (Nanostores).

## Критерії готовності

- [ ] `$playbackNeighbors` ходить у тому ж порядку, що відображається на екрані
- [ ] При сортуванні "за назвою" Ctrl+Alt+Left/Right переходять у алфавітному порядку
- [ ] При сортуванні "за часом додавання" — у порядку `addedAt` спадаюче
- [ ] Тест `playbackNeighbors.test.ts` розширено: перевірити з несортованим і сортованим масивом

## Документи

- Код: `src/stores/playbackNeighbors.ts` — `$playbackNeighbors`, `computePlaybackNeighbors`
- Код: `src/components/streams/StreamsPanel.tsx` — рядки 139-148 (`sortedStreams`)
- Код: `src/stores/streams.ts` — `$streams` (insertion-order)
- Тест: `src/stores/playbackNeighbors.test.ts`

## Промпт для агента

```text
Реалізуй цей запис. Рішення вже прийняте — мета довести до робочого, протестованого коду.

Що реалізуємо: Баг: prev/next трек ігнорують сортування потоків

Почни зі скіла `superpowers:brainstorming` — пройди його, щоб узгодити вимоги й дизайн перед кодом, а далі веди роботу за процесом superpowers: план → реалізація через TDD → перевірка.

Перед стартом звірся з контекстом: цей запис беклогу, його критерії готовності та залежності, пов'язаний код і документи (AGENTS.md, implementation-phases.md та ін.).

Дотримуйся конвенцій проєкту з AGENTS.md. Де доречно — закладай доступність/NVDA від початку, не як доробку.

Питання, якщо виникають, став по одному: контекст, варіанти відповіді, рекомендований. Дочекайся відповіді перед наступним.

Гейти перед завершенням: `pnpm test` і `pnpm vite:build` мають проходити. Онови критерії готовності в записі; коли все зроблено — запис можна видаляти (історія лишається в git).
```
