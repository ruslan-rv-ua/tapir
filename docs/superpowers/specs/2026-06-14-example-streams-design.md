# Дизайн: приклади потоків у порожньому профілі

- **Дата:** 2026-06-14
- **Гілка:** `feature/example-streams`
- **Статус:** затверджено (brainstorming) → готово до writing-plans
- **Фаза:** доповнення до Phase 3F (Profile Manager) / онбординг

## 1. Контекст і проблема

Коли активний профіль не має потоків, область списку у `StreamsPanel`
показує статичну, **нефокусовану** підказку (`streams_empty_hint`). Для
користувача (зокрема незрячого, NVDA) це «порожнеча»: немає на чому одразу
перевірити відтворення/запис, а додавання першого потоку вимагає знання
формату URL.

Замість вшитого дефолтного плейлиста (борг на майбутнє через link rot) робимо
**opt-in**: у порожньому профілі показуємо фокусовану кнопку, яка додає **до 3
прикладів станцій**, отриманих з Radio Browser API.

Вимоги (узгоджені з користувачем):
- кнопка з'являється **щоразу, коли активний профіль порожній** (не лише на
  першому запуску); вона tab-stoppable і замінює статичну підказку списку;
- додається **до 3** станцій **з API** (свіжі `url_resolved`);
- **бажано** (не обов'язково) одна **україномовна**;
- **за можливості** уникати комерційних станцій;
- порожній профіль часто буває саме **офлайн** (перший запуск) → потрібен
  офлайн-фолбек.

## 2. Цілі / поза межами

**Цілі**
- Фокусована кнопка «Додати приклади потоків» у порожньому стані списку.
- Backend-команда, що курує добірку, резолвить свіжі URL через наявний
  Radio Browser клієнт, має офлайн-фолбек і додає станції в активний профіль.
- Повна доступність: анонси та керування фокусом для NVDA.

**Поза межами (YAGNI)**
- Жодної позначки «приклад» на доданих потоках — це звичайні потоки.
- Жодного окремого «first-run» режиму — тригер єдиний: профіль порожній.
- Жодного UI вибору/налаштування складу прикладів.
- Не чіпаємо Stream Browser (Phase 3B) — лише переюзаємо його бекенд.

## 3. Архітектура та переюз

Обрано підхід **A — нова Rust-команда `add_example_streams`** (узгоджується з
«backend-first» з AGENTS.md: бізнес-логіка добірки живе в Rust; один атомарний
IPC-виклик; повертає назви для анонсу; офлайн-фолбек тривіальний на бекенді).

Переюз наявного коду Phase 3B:
- `RadioBrowserClient` (`src-tauri/src/browser/api.rs`) — `search_stations`
  уже шле `hidebroken=true` + `lastcheckok=1`, має ротацію серверів і таймаути.
- Логіка `StationResult → StreamInfo` та «push у профіль + save + emit» зараз
  у `add_station_from_browser` (`src-tauri/src/commands/browser_commands.rs`).
  Виносимо у спільні хелпери (див. §5), щоб не дублювати.
- Подія `streams-changed` уже обробляється у `App.tsx`
  (`handleStreamsChanged` → `getStreams()` → `$streams.set(...)`), тож фронту
  достатньо дочекатися результату команди.

Відкинуті альтернативи:
- **B (оркестрація з фронту):** курований список і fallback-URL переїхали б у
  TS (порушує конвенцію), N× `streams-changed`, важче зробити атомарно й один
  анонс.
- **C (тонкий `get_example_stations` + фронт додає):** курація в Rust, але
  знову N round-trip і збір анонсу на фронті.

## 4. Куровані «якорі» (некомерційні)

Фіксований пул із 3 якорів; перший — україномовний, тож порядок гарантує
виконання м'якої вимоги «одна україномовна», коли вона доступна. Усі три —
суспільні/listener-supported, тобто «не комерційні» за побудовою.

| # | Призначення | API-пошук (`name`, `country`) | Фолбек URL | Формат | Бітрейт |
|---|---|---|---|---|---|
| 1 | UA, суспільне (Suspilne) | «Промінь», Ukraine | `http://radio.ukr.radio:8000/ur2-mp3` | MP3 | 192 |
| 2 | SomaFM (US, listener-supported) | «Groove Salad» | `https://ice5.somafm.com/groovesalad-128-mp3` | MP3 | 128 |
| 3 | FIP (Radio France, публічне) | «FIP», France | `http://icecast.radiofrance.fr/fip-hifi.aac` | AAC | 192 |

Фолбек-URL узяті з `docs/testing/test-streams.md` (SomaFM, FIP) і Radio Browser
(Suspilne «Промінь», підтверджено через API). Примітки:
- SomaFM-номер `iceN` може мінятись при балансуванні — це лише останній резерв;
  основний шлях бере свіжий `url_resolved` з API.
- Suspilne-фолбек — `http` на порту 8000; на жорстких мережах може блокуватись,
  але як офлайн-резерв це прийнятно (основний шлях — API).

## 5. Backend: `add_example_streams`

Новий async Tauri-команда у `browser_commands.rs` (поряд із наявними; зареєструвати
в `invoke_handler` у `src-tauri/src/lib.rs`).

**Підпис**
```rust
#[tauri::command]
pub async fn add_example_streams(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<StreamInfo>, String>
```

**Курований пул** — масив описів якорів:
```rust
struct ExampleAnchor {
    name_query: &'static str,     // пошук по name
    country: Option<&'static str>,// фільтр country, якщо є
    fallback_url: &'static str,
    fallback_name: &'static str,
    fallback_codec: &'static str, // "MP3" | "AAC"
    fallback_bitrate: u32,
}
```

**Алгоритм добірки** (по черзі для кожного якоря, зберігаючи порядок):
1. `client.search_stations(SearchParams { query: Some(name_query),
   country: anchor.country.map(...), limit: Some(5), .. })`.
2. Узяти **перший** результат із непорожнім `url_resolved` (search уже
   повертає лише живі — `hidebroken`+`lastcheckok=1`). Якщо вказано `country` —
   фільтрувати по `countrycode`/`country`.
3. Якщо пошук дав помилку або порожньо → синтезувати «фолбек-станцію» з
   `fallback_*` полів якоря.
4. Перетворити на `StreamInfo` спільним хелпером `station_to_stream_info`.
5. Дедуп по `url` у межах добірки (на випадок, якщо два якорі резолвляться в
   один URL — малоймовірно, але дешево).

Зібрані `StreamInfo` (1–3 шт.) додати в активний профіль одним хелпером
`append_streams_to_active_profile` (push + одне `save` через `spawn_blocking` +
`emit("streams-changed")`), повернути доданий `Vec<StreamInfo>`.

> Бо профіль порожній, перевірка дублів проти наявних потоків зайва, але
> хелпер усе одно пропускає URL, що вже є у профілі (безпечно за будь-якого
> стану).

**Рефактор для переюзу (без зміни поведінки `add_station_from_browser`):**
- `fn station_to_stream_info(s: &StationResult) -> StreamInfo` — наявна збірка
  `StreamInfo` з `add_station_from_browser` (id, url-resolve, format-mapping,
  bitrate, icy_*, added_at) виноситься сюди; обидві команди її викликають.
- `async fn append_streams_to_active_profile(state, app, streams) -> Result<...>`
  — push (з дедупом по URL), `save`, `emit`. `add_station_from_browser`
  переписується через неї (додає 1 станцію), `add_example_streams` — через неї
  ж (додає 1–3).

**Помилки:** якщо геть усе впало (немає мережі **і** збій збереження профілю) —
повертаємо `Err(String)`; фронт покаже toast. Нормальний офлайн (немає мережі,
але профіль зберігся) дає 3 фолбек-станції й `Ok`.

## 6. Frontend

### 6.1 IPC-обгортка (`src/lib/tauri.ts`)
```ts
export async function addExampleStreams(): Promise<StreamInfo[]> {
  return invoke<StreamInfo[]>("add_example_streams");
}
```

### 6.2 Порожній стан (`src/components/streams/StreamsPanel.tsx`)
Зараз гілка `isEmpty` рендерить нефокусований `<p>{streams_empty_hint}</p>`, і
при `isEmpty` зона списку **не** реєструється (лише `streams-toolbar`).
Змінюємо — за зразком наявної зони `streams-filter-empty`:

- **Розмітка:** контейнер `ref={emptyZoneRef}` з `role="region"`,
  `aria-label`; усередині `<p>{streams_empty_hint}</p>` (тепер як підзаголовок)
  + кнопка `ref={addExamplesBtnRef}` з текстом `streams_empty_add_examples`,
  єдиний tab-stop.
- **Реєстрація зони:** у наявному `useEffect` (де формуються `zones`) у гілці
  `isEmpty` додати зону:
  ```ts
  zones.push({
    id: "streams-empty",
    get el() { return emptyZoneRef.current!; },
    focus: () => addExamplesBtnRef.current?.focus(),
  });
  ```
  (Зараз при `isEmpty` додається лише тулбар — тепер ще й `streams-empty`,
  щоб F6 потрапляв на кнопку, а не «провалювався».) Залежності ефекту вже
  включають `isEmpty`.
- **Тулбар без змін:** «Додати/Імпорт/Експорт» лишаються — ручний шлях
  доступний завжди.

### 6.3 Потік натискання + a11y
Локальний стан `loadingExamples: boolean`.
1. Клік → `setLoadingExamples(true)`; кнопка `disabled`, `aria-busy`, текст
   `streams_examples_loading`; `announce(streams_examples_loading(), "polite")`.
2. `const added = await tauri.addExampleStreams();`
   - **успіх:** бекенд уже зробив `emit("streams-changed")` → `$streams`
     перезавантажиться → `isEmpty` стане `false`, відрендериться список.
     Анонс: `announce(streams_examples_added({ count, names }), "polite")`
     (плюралізований, як інші лічильники в панелі — через наявний `pluralize`).
     Перенести фокус на **перший рядок** списку (після перерендеру; через
     наявний механізм фокуса composite-list / `requestAnimationFrame`).
   - **помилка:** `addToast(String(err), "error")` +
     `announce(streams_examples_failed(), "polite")`; `setLoadingExamples(false)`;
     фокус лишається на кнопці (текст повертається в Idle).
3. `finally` не скидає `loading` в успіху — компонент так чи інакше зникне
   разом із порожнім станом.

Анонси йдуть через наявний `useAnnounce` → `$announcer` → `LiveAnnouncer`.
Тут немає модалки, тож пастка `data-live-announcer` не застосовується, але
використовуємо той самий канал для однаковості.

## 7. i18n (`src/i18n/messages/{uk,en}.json`)

Нові ключі (плюрали — у стилі наявних `streams_count_*`):
- `streams_empty_add_examples` — напр. «Додати приклади потоків» / «Add example streams».
- `streams_examples_loading` — «Додаю приклади…» / «Adding examples…».
- `streams_examples_added` (плюралізований, параметри `{count}`, `{names}`) —
  напр. «Додано {count} приклади: {names}. Список оновлено.»
- `streams_examples_failed` — «Не вдалося завантажити приклади. Перевірте з'єднання.»

`streams_empty_hint` лишається (тепер як підзаголовок над кнопкою). Регенерація
типобезпечних повідомлень — через vite-плагін paraglide (а не ручне редагування
згенерованого коду).

## 8. Тестування

**Rust (`src-tauri`)**
- Юніт на селектор добірки з мок/інжектованим клієнтом:
  - усі якорі резолвляться з API → 3 станції в правильному порядку (UA перша);
  - API повертає помилку/порожньо для якоря → застосовано його фолбек;
  - повний офлайн → 3 фолбек-станції;
  - дедуп по URL.
- Тест на `station_to_stream_info` (format-mapping MP3/AAC, bitrate 0→None,
  icy_* мапінг) — щоб рефактор не змінив поведінку `add_station_from_browser`.

> Якщо інжекція клієнта в команду незручна — винести «чисту» функцію добірки
> `select_example_stations(results_per_anchor) -> Vec<StreamInfo>` і тестувати її
> ізольовано; мережеву частину лишити тонкою.

**Frontend (vitest + RTL, `StreamsPanel.test.tsx`)**
- порожній профіль показує кнопку `streams_empty_add_examples` і реєструє зону
  `streams-empty`;
- клік викликає `tauri.addExampleStreams`, виставляє loading/disabled/`aria-busy`;
- після успіху (мок повертає 2–3 `StreamInfo`, `$streams` оновлено) — анонс
  `streams_examples_added` і фокус на перший рядок;
- гілка помилки: toast + анонс `streams_examples_failed`, кнопка знову активна.
Мокаємо `tauri.addExampleStreams` (як інші tauri-моки в наявних тестах).

**Гейти:** `pnpm test` + `pnpm vite:build`. (`tsc` має ~51 передіснуючу помилку
через нетипізований paraglide — це не гейт.)

## 9. Перелік торкнутих файлів

**Backend**
- `src-tauri/src/commands/browser_commands.rs` — нова команда
  `add_example_streams`, хелпери `station_to_stream_info` /
  `append_streams_to_active_profile`, рефактор `add_station_from_browser`,
  опис пулу якорів.
- `src-tauri/src/lib.rs` — реєстрація команди в `invoke_handler`.
- (за потреби) тестовий модуль під селектор.

**Frontend**
- `src/lib/tauri.ts` — обгортка `addExampleStreams`.
- `src/components/streams/StreamsPanel.tsx` — фокусований порожній стан, зона
  `streams-empty`, потік натискання + анонси + фокус.
- `src/i18n/messages/uk.json`, `src/i18n/messages/en.json` — нові ключі.
- `src/components/streams/StreamsPanel.test.tsx` — тести порожнього стану.

## 10. Критерії приймання

1. У порожньому профілі замість статичної підказки видно фокусовану кнопку
   «Додати приклади потоків»; F6 потрапляє на неї.
2. Натискання додає 1–3 станції з API; за наявності — одна україномовна першою;
   усі — некомерційні.
3. Без інтернету натискання все одно додає фолбек-трійку (кнопка не «глухне»).
4. Після додавання порожній стан зникає, з'являється список, NVDA озвучує
   результат, фокус — на першому потоці.
5. `pnpm test` і `pnpm vite:build` — зелені; наявні тести Stream Browser не
   зламані рефактором.
