# Phase 3B — Stream Browser (Radio Browser API)

> **Дата:** 2025-07-18
> **Статус:** Специфікація затверджена
> **Залежності:** Немає (reqwest 0.13 вже в проєкті)

## Ціль

Пошук нових радіостанцій через Radio Browser API та додавання їх до профілю — без ручного введення URL. Стартова сторінка з популярними станціями, фільтри за країною/мовою/кодеком/бітрейтом, accessible table з NVDA grid navigation.

## Скоуп

### В скоупі

- Власний HTTP клієнт Radio Browser API на існуючому `reqwest 0.13`
- Пошук станцій за назвою (fuzzy) + фільтри: країна, мова, кодек, мін. бітрейт
- Автопошук з debounce 500ms на текстовому полі, негайний пошук при зміні фільтрів
- Стартова сторінка "Популярні станції" (topclick)
- Accessible таблиця результатів (React Aria Table, sortable columns)
- Кнопка "Додати" → станція з'являється у профілі
- Перевірка дублікатів за URL (помилка якщо вже є)
- Пагінація: кнопка "Завантажити ще" (offset/limit)
- Сортування за замовчуванням: clickcount (популярність)
- Server discovery + fallback між серверами Radio Browser API
- Кешування фільтрів (країни, кодеки, мови, теги) з TTL 24 години
- Browser tab в Activity Bar (вже scaffolded як disabled)
- High Contrast (forced-colors) для всіх нових компонентів
- Повна i18n (uk + en)

### Поза скоупом

- Збереження обраних станцій (favorites) окремо від профілю
- Попередній перегляд/прослуховування станції до додавання
- Автоматичний запис після додавання
- Редагування станції після додавання (лише через StreamContextMenu)
- Пошук за URL
- Історія пошуків
- Теги як фільтр (вільний текст у полі пошуку замість окремого фільтра)
- Кешування результатів пошуку (тільки фільтрів)

---

## 1. Backend — Модуль `browser`

### Файлова структура

```
src-tauri/src/browser/
├── mod.rs       # pub mod api; pub mod types;
├── api.rs       # RadioBrowserClient
└── types.rs     # StationResult, SearchParams, FilterItem, BrowserFilters
```

### 1.1. `types.rs` — Типи даних

> **⚠️ data-models.md sync:** Поточний `StationResult` у `docs/data-models.md` §4.3 має 10 полів.
> Ця специфікація розширює до 15 полів (додано `countrycode`, `language`, `votes`, `clickcount`, `homepage`, `lastcheckok`; видалено `favicon`).
> При імплементації ОБОВ'ЯЗКОВО оновити `data-models.md` відповідно.

```rust
use serde::{Deserialize, Serialize};

/// Станція з Radio Browser API.
/// Десеріалізується з JSON відповіді API (snake_case),
/// серіалізується у camelCase для фронтенду через Tauri IPC.
/// Alias-и дозволяють десеріалізувати snake_case поля API
/// при серіалізації у camelCase для TS.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationResult {
    pub stationuuid: String,
    pub name: String,
    pub url: String,
    #[serde(default, alias = "url_resolved")]
    pub url_resolved: String,
    pub codec: String,
    pub bitrate: u32,
    pub country: String,
    #[serde(alias = "countrycode")]
    pub countrycode: String,
    pub tags: String,
    pub language: String,
    pub votes: i32,
    #[serde(alias = "clickcount")]
    pub clickcount: u32,
    #[serde(default, alias = "has_extended_info")]
    pub has_extended_info: Option<bool>,
    #[serde(default)]
    pub homepage: String,
    #[serde(alias = "lastcheckok")]
    pub lastcheckok: i8,
}

/// Параметри пошуку станцій. Приходять з frontend через IPC.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchParams {
    /// Назва станції (fuzzy search)
    pub query: Option<String>,
    /// Назва країни (напр. "Ukraine", "Germany") — з FilterItem.name
    pub country: Option<String>,
    /// Мова станції (напр. "ukrainian", "english")
    pub language: Option<String>,
    /// Кодек: "MP3", "AAC", "AAC+", "FLAC"
    pub codec: Option<String>,
    /// Мінімальний бітрейт (кбіт/с)
    pub min_bitrate: Option<u32>,
    /// Поле сортування: "clickcount", "votes", "name", "bitrate"
    pub order: Option<String>,
    /// Зворотний порядок
    pub reverse: Option<bool>,
    /// Зсув для пагінації (0-based)
    pub offset: Option<u32>,
    /// Кількість результатів (default 50, max 1000)
    pub limit: Option<u32>,
}

/// Елемент списку фільтрів (країна/кодек/мова/тег)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterItem {
    pub name: String,
    #[serde(default)]
    pub stationcount: u32,
}

/// Набір усіх фільтрів для UI. Кешується у RadioBrowserClient.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserFilters {
    pub countries: Vec<FilterItem>,
    pub codecs: Vec<FilterItem>,
    pub languages: Vec<FilterItem>,
    pub tags: Vec<FilterItem>,
}

/// Інформація про сервер Radio Browser API
#[derive(Debug, Clone, Deserialize)]
pub struct ServerInfo {
    pub name: String,
    pub ip: String,
}
```

### 1.2. `api.rs` — RadioBrowserClient

```rust
pub struct RadioBrowserClient {
    client: reqwest::Client,
    servers: Vec<String>,
    current_server: AtomicUsize,
    filters_cache: RwLock<Option<(BrowserFilters, Instant)>>,
}
```

**Конструктор (`new`):**
1. Створює `reqwest::Client` з `connect_timeout(10s)`, `timeout(30s)`, `user_agent("Tapir/0.1.0")`
2. Запитує `https://all.api.radio-browser.info/json/servers` для списку серверів
3. Дедуплікація серверів (DNS може повертати дублікати для IPv4/IPv6)
4. Якщо не вдалося — використовує хардкоджений fallback: `["de1", "de2", "nl1"]`
5. Формує URL у форматі `https://{name}`

**Методи:**

| Метод | Ендпоінт | Повертає |
|-------|----------|----------|
| `search_stations(&self, params: &SearchParams)` | `GET /json/stations/search` | `Vec<StationResult>` |
| `get_filters(&self)` | Кеш або 4 запити | `BrowserFilters` |

> **Примітка:** Окремий метод `get_top_stations` не потрібен — популярні станції завантажуються через `search_stations` з `{ order: "clickcount", limit: 50 }`.

**`search_stations` — логіка:**
1. Формує query params з `SearchParams`:
   - Завжди додає `hidebroken=true`, `lastcheckok=1`
   - `name` = `params.query` (якщо не порожній)
   - `country` = `params.country`
   - `language` = `params.language`
   - `codec` = `params.codec`
   - `bitrateMin` = `params.min_bitrate`
   - `order` = `params.order` (default: `"clickcount"`)
   - `reverse` = `params.reverse` (default: `false`)
   - `limit` = `params.limit` (default: `50`)
   - `offset` = `params.offset` (default: `0`)
2. Робить GET запит до поточного сервера
3. При помилці — retry на наступному сервері (max 3 спроби, AtomicUsize::fetch_add)
4. Десеріалізує JSON → `Vec<StationResult>`

**`get_filters` — логіка:**
1. Перевіряє кеш: якщо `Instant::elapsed() < 24 години` — повертає кеш
2. Інакше робить 4 паралельних запити (`tokio::join!`):
   - `GET /json/countries?order=stationcount&reverse=true&limit=250`
   - `GET /json/codecs?order=stationcount&reverse=true`
   - `GET /json/languages?order=stationcount&reverse=true&limit=100`
   - `GET /json/tags?order=stationcount&reverse=true&limit=100`
3. Зберігає у кеш з `Instant::now()`
4. Якщо запит не вдався а кеш є (навіть просрочений) — повертає старий кеш

**Server fallback — приватний хелпер:**
```rust
async fn get_json<T: DeserializeOwned>(&self, path: &str, query: &[(String, String)]) -> Result<T, RadioError>
```
- Пробує поточний сервер → наступний → наступний (max 3)
- При 4xx/5xx або timeout — `current_server.fetch_add(1, Relaxed) % servers.len()`
- Логує через `tracing::warn!` при fallback

### 1.3. Зміни в `errors.rs`

Нові варіанти `RadioError`:

```rust
/// Radio Browser API HTTP помилка
#[error("Radio Browser API error: {0}")]
BrowserApi(String),

/// Жодний сервер Radio Browser не відповідає
#[error("No Radio Browser servers available")]
BrowserNoServers,

/// Станція з таким URL вже є у профілі
#[error("Stream with this URL already exists")]
DuplicateStream,
```

### 1.4. Зміни в `AppState`

`RadioBrowserClient` ініціалізується **ліниво** (lazy) — не при старті додатку, а при першому відкритті вкладки "Браузер станцій".
Це уникає затримки запуску на 10с при відсутності інтернету.

```rust
pub struct AppState {
    // ... existing fields ...
    pub browser_client: Arc<tokio::sync::OnceCell<RadioBrowserClient>>,
}
```

Ініціалізація в `lib.rs`:
```rust
let browser_client = Arc::new(tokio::sync::OnceCell::new());
```

IPC команди викликають:
```rust
let client = state.browser_client
    .get_or_init(|| async {
        RadioBrowserClient::new().await.unwrap_or_else(|e| {
            warn!("Failed to init Radio Browser client: {}", e);
            RadioBrowserClient::with_default_servers()
        })
    })
    .await;
```

---

## 2. IPC команди — `commands/browser_commands.rs`

```rust
/// Пошук станцій через Radio Browser API.
/// Параметри: query, country, language, codec, minBitrate, order, offset, limit
#[tauri::command]
pub async fn search_stations(
    params: SearchParams,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<StationResult>, String> {
    let client = state.browser_client
        .get_or_init(|| async {
            RadioBrowserClient::new().await.unwrap_or_else(|e| {
                warn!("Failed to init Radio Browser client: {}", e);
                RadioBrowserClient::with_default_servers()
            })
        })
        .await;
    client.search_stations(&params)
        .await
        .map_err(|e| e.to_string())
}

/// Повертає кешовані фільтри (країни, кодеки, мови, теги).
/// Перший виклик запитує Radio Browser API; наступні 24 години — з кешу.
#[tauri::command]
pub async fn get_browser_filters(
    state: tauri::State<'_, AppState>,
) -> Result<BrowserFilters, String> {
    let client = state.browser_client
        .get_or_init(|| async {
            RadioBrowserClient::new().await.unwrap_or_else(|e| {
                warn!("Failed to init Radio Browser client: {}", e);
                RadioBrowserClient::with_default_servers()
            })
        })
        .await;
    client.get_filters()
        .await
        .map_err(|e| e.to_string())
}

/// Додає станцію з Radio Browser до профілю.
/// Перевіряє дублікат за url_resolved (або url).
/// Повертає створений StreamInfo.
#[tauri::command]
pub async fn add_station_from_browser(
    station: StationResult,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<StreamInfo, String> {
    let url = if station.url_resolved.is_empty() {
        station.url.clone()
    } else {
        station.url_resolved.clone()
    };

    let mut profile = state.active_profile.write().await;

    // Перевірка дублікату
    if profile.streams.iter().any(|s| s.url == url) {
        return Err(RadioError::DuplicateStream.to_string());
    }

    // Конвертація StationResult → StreamInfo
    let format = match station.codec.to_uppercase().as_str() {
        "MP3" => Some(AudioFormat::Mp3),
        "AAC" | "AAC+" => Some(AudioFormat::Aac),
        _ => None,
    };

    let stream_info = StreamInfo {
        id: nanoid::nanoid!(),
        url,
        name: station.name.trim().to_string(),
        format,
        bitrate: if station.bitrate > 0 { Some(station.bitrate) } else { None },
        icy_name: None,
        icy_genre: if station.tags.is_empty() { None } else { Some(station.tags.clone()) },
        icy_url: if station.homepage.is_empty() { None } else { Some(station.homepage.clone()) },
        ignorelist: vec![],
        username: None,
        password: None,
        added_at: chrono::Local::now().to_rfc3339(),
    };

    profile.streams.push(stream_info.clone());

    // Clone and drop lock before saving
    let profile_clone = profile.clone();
    drop(profile);

    tokio::task::spawn_blocking(move || profile_clone.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    // Emit event for UI — streams store слухає цю подію
    // і перезавантажує список потоків (listener у streams.ts)
    app.emit("streams-changed", ()).ok();

    Ok(stream_info)
}
```

> **Примітка:** Подія `streams-changed` потребує listener у `App.tsx` (за паттерном існуючих):
> ```typescript
> useTauriEvent("streams-changed", () => {
>   tauri.getStreams().then((streams) => $streams.set(streams));
> });
> ```

**Реєстрація в `lib.rs`:**
```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    browser_commands::search_stations,
    browser_commands::get_browser_filters,
    browser_commands::add_station_from_browser,
])
```

---

## 3. Frontend — Store `browser.ts`

### Типи

```typescript
export interface StationResult {
  stationuuid: string;
  name: string;
  url: string;
  urlResolved: string;
  codec: string;
  bitrate: number;
  country: string;
  countrycode: string;
  tags: string;
  language: string;
  votes: number;
  clickcount: number;
  hasExtendedInfo: boolean | null;
  homepage: string;
  lastcheckok: number;
}

export interface SearchParams {
  query?: string;
  country?: string;
  language?: string;
  codec?: string;
  minBitrate?: number;
  order?: string;
  reverse?: boolean;
  offset?: number;
  limit?: number;
}

export interface FilterItem {
  name: string;
  stationcount: number;
}

export interface BrowserFilters {
  countries: FilterItem[];
  codecs: FilterItem[];
  languages: FilterItem[];
  tags: FilterItem[];
}
```

### Стан (nanostores)

```typescript
export const $searchResults = atom<StationResult[]>([]);
export const $searchLoading = atom<boolean>(false);
export const $searchError = atom<string | null>(null);
export const $searchParams = atom<SearchParams>({
  limit: 50,
  order: "clickcount",
});
export const $browserFilters = atom<BrowserFilters | null>(null);
export const $hasMore = atom<boolean>(false);
export const $popularStations = atom<StationResult[]>([]);
export const $popularLoading = atom<boolean>(false);
export const $isSearchActive = computed($searchParams, (params) =>
  Boolean(params.query || params.country || params.language || params.codec || params.minBitrate)
);
```

### Дії

```typescript
export async function searchStations(params: SearchParams): Promise<void> {
  $searchLoading.set(true);
  $searchError.set(null);
  try {
    const results = await invoke<StationResult[]>("search_stations", { params });
    if (params.offset && params.offset > 0) {
      // "Завантажити ще" — append
      $searchResults.set([...$searchResults.get(), ...results]);
    } else {
      $searchResults.set(results);
    }
    $hasMore.set(results.length === (params.limit ?? 50));
  } catch (e) {
    $searchError.set(String(e));
  } finally {
    $searchLoading.set(false);
  }
}

export async function loadMore(): Promise<void> {
  const params = $searchParams.get();
  const newParams = {
    ...params,
    offset: (params.offset ?? 0) + (params.limit ?? 50),
  };
  $searchParams.set(newParams);
  await searchStations(newParams);
}

export async function loadFilters(): Promise<void> {
  try {
    const filters = await invoke<BrowserFilters>("get_browser_filters");
    $browserFilters.set(filters);
  } catch (e) {
    console.error("Failed to load browser filters:", e);
  }
}

export async function loadPopularStations(): Promise<void> {
  $popularLoading.set(true);
  try {
    // Популярні станції завжди обмежені 50 — без пагінації.
    // $hasMore НЕ встановлюється, тому кнопка "Завантажити ще" не з'являється.
    const results = await invoke<StationResult[]>("search_stations", {
      params: { limit: 50, order: "clickcount" } as SearchParams,
    });
    $popularStations.set(results);
  } catch (e) {
    console.error("Failed to load popular stations:", e);
  } finally {
    $popularLoading.set(false);
  }
}

export async function addStation(station: StationResult): Promise<void> {
  await invoke("add_station_from_browser", { station });
  // caller handles toast success; invoke throws on error (duplicate, etc.)
}

export function updateSearchParam<K extends keyof SearchParams>(
  key: K,
  value: SearchParams[K],
): void {
  $searchParams.set({ ...$searchParams.get(), [key]: value, offset: 0 });
}

export function resetSearch(): void {
  $searchParams.set({ limit: 50, order: "clickcount" });
  $searchResults.set([]);
  $hasMore.set(false);
  $searchError.set(null);
}
```

---

## 4. Frontend — Компоненти

### 4.1. `BrowserPanel.tsx`

Головна панель вкладки "Браузер станцій".

```
┌──────────────────────────────────────────────┐
│ [SearchForm]                                 │
│ ┌────────────────────────────────────────────┤
│ │ Назва: [___________]  Країна: [▾ Усі]    │
│ │ Кодек: [▾ Усі]  Мова: [▾ Усі]  Бітр: [] │
│ └────────────────────────────────────────────┤
│                                              │
│ Якщо $isSearchActive:                        │
│   [StationTable з $searchResults]            │
│ Інакше:                                      │
│   <h2>Популярні станції</h2>                 │
│   [StationTable з $popularStations]          │
└──────────────────────────────────────────────┘
```

**Поведінка:**
- `role="region"`, `aria-label={m.browser_section()}`
- При першому mount: `loadFilters()` + `loadPopularStations()`
- SearchForm завжди видима зверху
- Якщо `$isSearchActive` — показує результати пошуку; інакше — популярні

### 4.2. `SearchForm.tsx`

Форма пошуку з полем і фільтрами.

**Елементи:**
1. **Текстове поле** — React Aria `<SearchField>`:
   - `aria-label={m.browser_search_placeholder()}`
   - Placeholder: "Назва станції або жанр..."
   - Debounce 500ms → `updateSearchParam("query", value)` → `searchStations()`
   - Clear button (X) → `resetSearch()`

2. **Країна** — React Aria `<Select>`:
   - `<Label>{m.browser_filter_country()}</Label>`
   - Перший option: "Усі країни"
   - Options: `$browserFilters.countries` сортовані за `stationcount` desc
   - Показувати `name` + `(stationcount)` у кожному option
   - Зміна → негайний пошук (без debounce)

3. **Мова** — React Aria `<Select>`:
   - `<Label>{m.browser_filter_language()}</Label>`
   - Перший option: "Усі мови"
   - Options: `$browserFilters.languages` top-100 за `stationcount`

4. **Кодек** — React Aria `<Select>`:
   - `<Label>{m.browser_filter_codec()}</Label>`
   - Перший option: "Усі кодеки"
   - Options: `$browserFilters.codecs`

5. **Мін. бітрейт** — React Aria `<NumberField>`:
   - `<Label>{m.browser_filter_min_bitrate()}</Label>`
   - `minValue={0}`, `maxValue={320}`, `step={32}`
   - Зміна → debounce 500ms → пошук

**Layout:** flex-wrap, один рядок на широких екранах, переносяться на вузьких.

### 4.3. `StationTable.tsx`

Accessible таблиця результатів з кнопкою "Додати".

**Props:**
```typescript
interface StationTableProps {
  stations: StationResult[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore?: () => void;
  emptyMessage: string;
}
```

**React Aria Table:**

| Колонка | Ширина | Sortable | Вміст |
|---------|--------|----------|-------|
| Назва | auto (flex) | ✅ | `station.name` |
| Країна | 120px | ✅ | `station.country` |
| Кодек | 80px | ✅ | `station.codec` |
| Бітрейт | 90px | ✅ | `{station.bitrate} кбіт/с` (якщо 0 → "—") |
| Популярність | 110px | ✅ | `station.clickcount` |
| Дії | 90px | ❌ | Кнопка "Додати" |

> **Відображення порожніх значень:** якщо `bitrate === 0` → показувати "—"; якщо `codec` порожній → показувати "—".

**Кнопка "Додати":**
- React Aria `<Button>`
- `aria-label={m.browser_add_station({ name: station.name })}`
- При натисканні: `addStation(station)` → toast success або toast error
- Якщо станція вже в профілі (перевірка frontend-side за URL):
  - Текст: "Додано"
  - `isDisabled={true}`
  - `aria-label={m.browser_station_already_added({ name: station.name })}`

**Стани:**
- **Loading:** `aria-live="polite"` регіон з текстом "Пошук станцій..."
- **Results:** `aria-live="polite"` регіон: "Знайдено N станцій"
- **Empty:** текст `emptyMessage` (різний для пошуку та стартової)
- **Error:** `aria-live="assertive"` регіон з текстом помилки

**Пагінація:**
- Кнопка "Завантажити ще" під таблицею (якщо `hasMore`)
- `aria-label={m.browser_load_more()}`
- Після завантаження — фокус залишається на кнопці (або переміщується на перший новий рядок)

**Сортування:**
- Click на заголовок колонки → `updateSearchParam("order", field)` + `updateSearchParam("reverse", toggle)` → пошук
- React Aria Table sort descriptors
- `aria-sort` на колонках

### 4.4. Інтеграція з `ActivityBar.tsx`

Змінити у масиві `sections`:

```typescript
// Було:
{ id: "browser", icon: Globe, label: m.browser_section(), disabled: true, phase: "2" },
// Стало:
{ id: "browser", icon: Globe, label: m.browser_section(), disabled: false },
```

### 4.5. Інтеграція з `App.tsx`

Додати у рендер:

```tsx
{activeSection === "browser" && <BrowserPanel />}
```

---

## 5. i18n — Нові ключі

### `uk.json`

```json
{
  "browser_section": "Браузер станцій",
  "browser_search_placeholder": "Назва станції або жанр...",
  "browser_filter_country": "Країна",
  "browser_filter_language": "Мова",
  "browser_filter_codec": "Кодек",
  "browser_filter_min_bitrate": "Мін. бітрейт (кбіт/с)",
  "browser_results_count": "Знайдено {count} станцій",
  "browser_loading": "Пошук станцій...",
  "browser_popular_title": "Популярні станції",
  "browser_popular_loading": "Завантаження популярних станцій...",
  "browser_empty": "Введіть запит або оберіть фільтри для пошуку радіостанцій",
  "browser_no_results": "Станцій не знайдено. Спробуйте інший запит.",
  "browser_error": "Помилка пошуку: {error}",
  "browser_add_station": "Додати {name}",
  "browser_station_added": "Станцію «{name}» додано",
  "browser_station_already_added": "Станція «{name}» вже додана",
  "browser_station_duplicate": "Станція з таким URL вже є у списку",
  "browser_load_more": "Завантажити ще",
  "browser_column_name": "Назва",
  "browser_column_country": "Країна",
  "browser_column_codec": "Кодек",
  "browser_column_bitrate": "Бітрейт",
  "browser_column_popularity": "Популярність",
  "browser_column_actions": "Дії",
  "browser_all_countries": "Усі країни",
  "browser_all_languages": "Усі мови",
  "browser_all_codecs": "Усі кодеки",
  "browser_api_unavailable": "Сервіс Radio Browser недоступний. Спробуйте пізніше."
}
```

### `en.json`

```json
{
  "browser_section": "Station Browser",
  "browser_search_placeholder": "Station name or genre...",
  "browser_filter_country": "Country",
  "browser_filter_language": "Language",
  "browser_filter_codec": "Codec",
  "browser_filter_min_bitrate": "Min bitrate (kbps)",
  "browser_results_count": "Found {count} stations",
  "browser_loading": "Searching stations...",
  "browser_popular_title": "Popular Stations",
  "browser_popular_loading": "Loading popular stations...",
  "browser_empty": "Enter a query or select filters to search for radio stations",
  "browser_no_results": "No stations found. Try a different query.",
  "browser_error": "Search error: {error}",
  "browser_add_station": "Add {name}",
  "browser_station_added": "Station \"{name}\" added",
  "browser_station_already_added": "Station \"{name}\" already added",
  "browser_station_duplicate": "A station with this URL already exists",
  "browser_load_more": "Load more",
  "browser_column_name": "Name",
  "browser_column_country": "Country",
  "browser_column_codec": "Codec",
  "browser_column_bitrate": "Bitrate",
  "browser_column_popularity": "Popularity",
  "browser_column_actions": "Actions",
  "browser_all_countries": "All countries",
  "browser_all_languages": "All languages",
  "browser_all_codecs": "All codecs",
  "browser_api_unavailable": "Radio Browser service is unavailable. Please try again later."
}
```

---

## 6. High Contrast (forced-colors)

Всі нові компоненти ОБОВ'ЯЗКОВО отримують `forced-colors:` класи відповідно до паттернів Phase 3I-1:

| Елемент | Класи |
|---------|-------|
| SearchField input | `forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]` |
| SearchField clear button (X) | `forced-colors:text-[ButtonText]` |
| Select trigger | `forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]` |
| Select popover | `forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]` |
| Select option | `forced-colors:text-[CanvasText] forced-colors:selected:bg-[Highlight] forced-colors:selected:text-[HighlightText]` |
| Select option (focused) | `forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]` |
| NumberField input | `forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]` |
| Table header border | `forced-colors:border-[ButtonText]` |
| Table row hover | `forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]` |
| Кнопка "Додати" | `forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]` |
| Кнопка "Додано" (disabled) | `forced-colors:text-[GrayText]` |
| Кнопка "Завантажити ще" | `forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]` |
| Error text | `forced-colors:text-[CanvasText]` |

---

## 7. Accessibility — Повний flow

### NVDA Navigation

1. **Перехід на вкладку:** Activity Bar → Tab/стрілки → "Браузер станцій" → Enter
2. **Фокус:** автоматично на SearchField
3. **Tab order:** SearchField → Країна → Мова → Кодек → Бітрейт → Таблиця → "Завантажити ще"
4. **Таблиця:** стрілки ↑↓←→ для grid navigation, Enter/Space на "Додати"
5. **Sort:** Enter на заголовку колонки

### Live Regions

| Подія | Region | Текст |
|-------|--------|-------|
| Пошук розпочато | polite | "Пошук станцій..." |
| Результати отримано | polite | "Знайдено N станцій" |
| Немає результатів | polite | "Станцій не знайдено" |
| Помилка | assertive | "Помилка пошуку: ..." |
| Станцію додано | polite (toast) | "Станцію «X» додано" |
| Дублікат | assertive (toast) | "Станція з таким URL вже є" |

### Keyboard Shortcuts

Жодних нових глобальних хоткеїв. Все через стандартний Tab/Arrow navigation.

---

## 8. Зміни в існуючих файлах

| Файл | Зміна |
|------|-------|
| `src-tauri/src/lib.rs` | Додати `mod browser;`, створити `RadioBrowserClient`, додати в `AppState`, зареєструвати IPC команди |
| `src-tauri/src/commands/mod.rs` | Додати `pub mod browser_commands;` |
| `src-tauri/src/errors.rs` | Додати `BrowserApi`, `BrowserNoServers`, `DuplicateStream` |
| `src/components/layout/ActivityBar.tsx` | `disabled: false` для browser |
| `src/App.tsx` | Додати `BrowserPanel` рендер |
| `src/i18n/messages/uk.json` | +27 нових ключів, 1 оновлений (`browser_section`) |
| `src/i18n/messages/en.json` | +27 нових ключів, 1 оновлений (`browser_section`) |

---

## 9. Критерії "Done"

- [ ] Модуль `browser/` (api.rs, types.rs) компілюється без помилок
- [ ] IPC команди `search_stations`, `get_browser_filters`, `add_station_from_browser` зареєстровані та працюють
- [ ] Listener `streams-changed` оновлює список потоків після додавання станції
- [ ] Стартова сторінка показує ≥1 популярну станцію (мережа доступна)
- [ ] Пошук за назвою повертає результати з debounce 500ms
- [ ] Фільтри (країна, мова, кодек, бітрейт) працюють окремо і в комбінації
- [ ] "Завантажити ще" append-ить нові результати
- [ ] "Додати" створює `StreamInfo` у профілі, toast підтверджує
- [ ] Повторне "Додати" → toast помилки, кнопка стає "Додано" (disabled)
- [ ] NVDA: tab order, aria-live, grid navigation працюють
- [ ] High Contrast: всі елементи (включно з Select popover/options) видимі
- [ ] i18n: 27 нових ключів + 1 оновлений (uk + en) додані та компілюються
- [ ] `data-models.md` §4.3 оновлено до 15 полів StationResult
- [ ] `cargo check` проходить без помилок
- [ ] `just build-fast` завершується успішно

---

## 10. Тестування

### Manual Testing Checklist

- [ ] Відкрити вкладку "Браузер станцій" → бачити популярні станції
- [ ] Ввести "BBC" у пошук → через 500ms побачити результати
- [ ] Обрати країну "Ukraine" → результати оновлюються
- [ ] Обрати кодек "MP3" → фільтр працює
- [ ] Натиснути "Додати" → станція з'являється у вкладці "Потоки"
- [ ] Натиснути "Додати" ще раз на ту ж станцію → toast помилки
- [ ] Кнопка стає "Додано" (disabled) після додавання
- [ ] "Завантажити ще" → нові результати append до таблиці
- [ ] Tab navigation: SearchField → фільтри → таблиця → кнопки
- [ ] NVDA: aria-live анонсує кількість результатів
- [ ] NVDA: grid navigation стрілками у таблиці
- [ ] NVDA: кнопка "Додати" озвучує назву станції
- [ ] High Contrast: усі елементи видимі
- [ ] Вимкнути інтернет → toast "Сервіс Radio Browser недоступний"
- [ ] Очистити пошук → повернутися до популярних станцій
