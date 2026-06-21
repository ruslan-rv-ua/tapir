# Mute restore race condition (Case 2 без guard)

- **Слаг:** `p1-mute-restore-race-condition`
- **Тип:** заплановано
- **Стан:** ready
- **Зусилля:** S
- **Оновлено:** 2026-06-15
- **Залежності:** Phase 2A (PlayerEngine ✅), Phase 2C (mute state ✅)

## Опис

У `src/App.tsx` є два місця відновлення гучності при увімкненому mute після зміни стану програвача.

**Case 3** (~рядки 262–276) правильно виставляє `restoring: true` перед `tauri.setVolume()` і перевіряє його у `.then()` — це захищає від паралельних викликів.

**Case 2** (~рядки 251–260) цього guard-а не має:

```ts
tauri.setVolume(savedVolume)  // ← restoring не виставлено!
  .then(() => $muteState.set({ muted: false, savedVolume, restoring: false }))
```

Якщо `player-status` події приходять швидко (перемикання потоків, reconnect), Case 2 запускає кілька `setVolume()` паралельно, і останній `.then()` скасовує mute навіть якщо попередній виклик вже завершив відновлення.

**Виправлення** — перед `tauri.setVolume()` у Case 2 додати:

```ts
$muteState.set({ muted: true, savedVolume, restoring: true });
```

і у `.then()`:

```ts
if ($muteState.get().restoring) {
  $muteState.set({ muted: false, savedVolume, restoring: false });
}
```

Точно як у Case 3.

## Критерії готовності

- [ ] Case 2 у `src/App.tsx` виставляє `restoring: true` перед `tauri.setVolume()` і перевіряє його у `.then()`
- [ ] Швидке перемикання потоків при увімкненому mute не призводить до скидання стану mute

## Документи

- [src/App.tsx](../../src/App.tsx)

## Промпт для агента

```text
Реалізуй цей запис. Рішення вже прийняте — мета довести до робочого, протестованого коду.

Що реалізуємо: Mute restore race condition (Case 2 без guard)

Почни зі скіла `superpowers:brainstorming` — пройди його, щоб узгодити вимоги й дизайн перед кодом, а далі веди роботу за процесом superpowers: план → реалізація через TDD → перевірка.

Перед стартом звірся з контекстом: цей запис беклогу, його критерії готовності та залежності, пов'язаний код і документи (AGENTS.md, implementation-phases.md та ін.).

Дотримуйся конвенцій проєкту з AGENTS.md. Де доречно — закладай доступність/NVDA від початку, не як доробку.

Питання, якщо виникають, став по одному: контекст, варіанти відповіді, рекомендований. Дочекайся відповіді перед наступним.

Гейти перед завершенням: `pnpm test` і `pnpm vite:build` мають проходити. Онови критерії готовності в записі; коли все зроблено — запис можна видаляти (історія лишається в git).
```
