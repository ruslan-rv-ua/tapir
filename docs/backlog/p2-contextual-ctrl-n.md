# Ctrl+N — контекстна дія на екранах Browser і Profiles

- **Слаг:** `contextual-ctrl-n`
- **Тип:** ідея
- **Стан:** ready
- **Зусилля:** S
- **Оновлено:** 2026-06-15
- **Залежності:** Phase 3F (Profiles ✅), Phase 3B (Browser ✅)

## Опис

`Ctrl+N` вже реалізований для екрана Streams — відкриває "Add Stream" діалог.
ADR `2026-06-02-context-aware-keyboard-shortcuts.md` передбачає розширення патерну на інші екрани, але залишив це майбутньому.

Потрібно додати два нових контекстних випадки:

| Екран | Ctrl+N → дія |
|-------|-------------|
| `streams` | ✅ "Add Stream" (вже є) |
| `browser` | "Додати обрану станцію до Wishlist" |
| `profiles` | "Створити профіль" |

**Чому один шорткат, а не різні:** VS Code використовує ту саму конвенцію (`Ctrl+N` → новий файл / нова вкладка / нова скетч-сторінка залежно від контексту). Користувач вчить одне правило: _"Ctrl+N — створити нове у поточному екрані"_. Для незрячого це критично: менше шорткатів = менше навантаження на пам'ять.

**UX-цінність для NVDA:** без `Ctrl+N` до кнопки "Додати" чи "Створити профіль" потрібно дійти Tab-кроками або через зони (F6). З шорткатом — одна клавіша, незалежно від поточного фокуса всередині екрана.

### Технічний патерн

Вся логіка вже є в `src/hooks/useGlobalShortcuts.ts` та `src/lib/shortcuts.ts`.
Потрібно:

1. **`shortcuts.ts`** — додати два записи до `SHORTCUTS` з `when: (ctx) => ctx.activeSection === "browser"/"profiles"` та відповідними `run`.
2. **`ShortcutActions`** — додати `openAddToWishlist` та `openCreateProfile`.
3. **`useGlobalShortcuts.ts`** — прив'язати нові дії до store/механізму відкриття.
4. **Browser**: при натисканні `Ctrl+N` викликати `action-add` для рядка, що зараз у фокусі (активна `CompositeRow`). Якщо жоден рядок не активний — ігнорувати (або NVDA-оголошення "Оберіть станцію").
5. **Profiles**: `subDialog` — наразі локальний `useState` у `ProfilesPanel.tsx`. Потрібно або винести у Nanostore (`$showCreateProfileDialog: atom<boolean>`), або кинути кастомний DOM-подія `"tapir:create-profile"`, яку `ProfilesPanel` слухає через `useEffect`.

> Рекомендований варіант для Profiles: **Nanostore-атом** `$showCreateProfileDialog` (аналог `$showAddStreamDialog` в `stores/streams.ts`) — узгоджено з архітектурою проєкту.

### Деталі коду

- `e.code === "KeyN"`, не `e.key` — кирилична розкладка повертає `e.key === "н"`, шорткат не спрацює. Конвенція зафіксована в ADR і `accessibility.md §12`.
- `(e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey` — ctrlOrMeta, без модифікаторів.
- Новий запис у `SHORTCUTS` автоматично потрапляє до довідки F1 і до `RESERVED_WEBVIEW_COMBOS` (захист KeyRecorder).

## Критерії готовності

- [ ] `Ctrl+N` на екрані Browser активує "Add to wishlist" для рядка, що у фокусі; якщо фокус не на рядку — NVDA озвучує підказку "Оберіть станцію".
- [ ] `Ctrl+N` на екрані Profiles відкриває діалог "Створити профіль" (`ProfileNameDialog` з `type: "create"`).
- [ ] NVDA озвучує назву дії після відкриття діалогу (не потребує додаткової роботи — `aria-label` у діалогах вже є).
- [ ] F1-довідка містить записи для обох нових дій із правильними i18n-мітками.
- [ ] Існуючий тест `useGlobalShortcuts.test.tsx` розширено: `Ctrl+N` на `browser`/`profiles` виконує правильну дію і **не** відкриває Add Stream.

## Відкриті питання

- Чи оголошувати NVDA _"Ctrl+N — [назва дії]"_ при зміні активного екрана? Це допомогло б незрячому дізнатися, яка саме дія призначена шорткату в поточному контексті. Зворотний бік — може бути надто галасливо при частому перемиканні. Альтернатива: показувати лише у F1-довідці.
- Browser: що робити, якщо список порожній або ще завантажується? Поточна поведінка Add-кнопки ігнорує стан — ймовірно, те саме підходить для `Ctrl+N`.

## Документи

- [docs/decisions/2026-06-02-context-aware-keyboard-shortcuts.md](../decisions/2026-06-02-context-aware-keyboard-shortcuts.md) — ADR, де патерн описаний і таблиця майбутніх екранів
- [docs/keyboard-shortcuts.md](../keyboard-shortcuts.md) — повний перелік шорткатів
- [docs/accessibility.md](../accessibility.md) — §12 про `e.code` vs `e.key`
- Код: `src/lib/shortcuts.ts` (реєстр), `src/hooks/useGlobalShortcuts.ts` (диспетчер), `src/stores/streams.ts` (зразок для нового атома), `src/components/profile/ProfilesPanel.tsx` (локальний `subDialog` → треба винести)

## Промпт для агента

Каталог промптів за типом: [README — Каталог промптів](README.md#каталог-промптів-за-типом).
Тип `ідея`.
