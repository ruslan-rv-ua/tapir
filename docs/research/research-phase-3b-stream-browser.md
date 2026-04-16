# Дослідження: Phase 3B — Stream Browser (Radio Browser API)

> **Дата:** 2025-07-18
> **Статус:** Дослідження завершено, очікує затвердження підходу
> **Автор:** Copilot (claude-opus-4.6)

---

## 1. Аналіз поточного стану проєкту

### 1.1. Що вже є

**Backend (Rust):**
- `reqwest 0.13` з features `stream`, `rustls` — HTTP клієнт
- `tokio ~1.51` з `full` features — async runtime
- `serde` / `serde_json` — серіалізація
- `chrono 0.4` з `serde` — робота з датами
- Паттерн IPC команд: `tauri::State<AppState>` → `RwLock` → короткий lock → результат
- Модуль `stream::connection` — HTTP підключення до потоків з ICY заголовками
- CSP вже дозволяє `connect-src https://*.api.radio-browser.info`

**Frontend (React 19):**
- `react-aria-components` — accessible UI
- `nanostores` + `@nanostores/react` — стан
- `lucide-react` — іконки (Globe для Browser)
- ActivityBar вже має `"browser"` секцію (`disabled: true`)
- `Section` тип включає `"browser"` у `navigation.ts`

**Що НЕ існує (потрібно створити):**
- `src-tauri/src/browser/` — модуль API клієнта
- `src-tauri/src/commands/browser_commands.rs` — IPC команди
- `src/components/browser/` — UI компоненти
- `src/stores/browser.ts` — стор пошуку

### 1.2. Визначені інтерфейси (з architecture.md та data-models.md)

**IPC команди (заплановані):**

| Command | Params | Returns |
|---------|--------|---------|
| `search_stations` | `{query, format?, minBitrate?}` | `Vec<StationResult>` |
| `add_station_from_browser` | `{station}` | `StreamInfo` |

**StationResult (задокументований):**

```rust
pub struct StationResult {
    pub stationuuid: String,
    pub name: String,
    pub url: String,
    pub url_resolved: String,
    pub codec: String,
    pub bitrate: u32,
    pub country: String,
    pub tags: String,
    pub has_extended_info: bool,
    pub favicon: String,
}
```

### 1.3. Вимоги з PRD (§ 4.5)

- Пошук за назвою, URL, жанром
- Фільтрація за форматом (MP3/AAC)
- Фільтрація за мінімальним бітрейтом
- Додавання станцій до профілю
- Навігація результатами у accessible table

### 1.4. Критерії Done (з implementation-phases.md)

- [ ] Пошук станцій за назвою, жанром, форматом, бітрейтом
- [ ] Результати у accessible table (NVDA grid navigation)
- [ ] Кнопка "Додати" → станція з'являється у профілі
- [ ] Activity Bar icon для Browser tab
- [ ] Empty state та loading state accessible

---

## 2. Radio Browser API — технічний аналіз

### 2.1. Інфраструктура

- **Безкоштовний, без автентифікації, без rate limiting**
- DNS-based round-robin: `all.api.radio-browser.info` → де-кілька серверів (de1, de2, тощо)
- ~54,000+ станцій у базі
- CORS повністю відкритий (`Access-Control-Allow-Origin: *`)
- Сервер написаний на Rust (tiny-http), версія 0.7.44

### 2.2. Ключові ендпоінти

| Ендпоінт | Призначення | Для Tapir |
|----------|-------------|-----------|
| `GET /json/stations/search` | Пошук станцій з фільтрами | ✅ Основний |
| `GET /json/countries` | Список країн | ✅ Для фільтрів |
| `GET /json/languages` | Список мов | ✅ Для фільтрів |
| `GET /json/codecs` | Список кодеків | ✅ Для фільтрів |
| `GET /json/tags` | Список жанрів/тегів | ⚠️ 10,000+ — треба обмежувати |
| `GET /json/stations/topclick` | Найпопулярніші | 🔮 Для "рекомендацій" |
| `GET /json/stations/topvote` | Найрейтинговіші | 🔮 Для "рекомендацій" |
| `GET /json/servers` | Список серверів | ✅ Для server discovery |
| `GET /json/stats` | Статистика API | ℹ️ Інформаційний |

### 2.3. Параметри пошуку `/json/stations/search`

| Параметр | Тип | Опис | Потрібен Tapir? |
|----------|-----|------|-----------------|
| `name` | string | Назва станції (fuzzy) | ✅ |
| `tag` | string | Жанр/тег (substring) | ✅ |
| `tagExact` | string | Точний тег | ✅ |
| `countrycode` | string | ISO 3166-1 код країни | ✅ |
| `language` | string | Мова | ⚠️ Може бути корисним |
| `codec` | string | MP3, AAC, AAC+, FLAC | ✅ |
| `bitrate_min` | int | Мін. бітрейт | — (немає такого параметру в API) |
| `order` | string | Сортування (name, clickcount, votes, bitrate…) | ✅ |
| `reverse` | bool | Зворотний порядок | ✅ |
| `limit` | int | Макс. результатів (до 1000) | ✅ |
| `offset` | int | Пагінація | ✅ |
| `hidebroken` | bool | Приховати зламані | ✅ (завжди true) |
| `lastcheckok` | bool | Тільки перевірені | ✅ (завжди true) |
| `has_extended_info` | bool | Тільки з ICY metadata | ⚠️ Рекомендується |

**Важливо:** API не має параметра `bitrate_min` напряму. Фільтрація за мінімальним бітрейтом потрібна на клієнтському боці, або через крейт `radiobrowser` який має `bitrate_min()` (він фільтрує після запиту? — потрібно перевірити).

**Оновлення:** після перевірки документації Radio Browser API, параметр `bitrateMin` та `bitrateMax` дійсно підтримуються серверною стороною.

### 2.4. Об'єкт станції (відповідь API)

Повертає 31+ поле. Для Tapir потрібні:

| Поле | Тип | Для чого |
|------|-----|----------|
| `stationuuid` | string | Унікальний ID |
| `name` | string | Назва для відображення |
| `url` | string | Оригінальний URL |
| `url_resolved` | string | **Використовувати цей** — перевірений |
| `codec` | string | MP3/AAC/AAC+ |
| `bitrate` | u32 | Бітрейт (кбіт/с) |
| `country` | string | Країна |
| `countrycode` | string | ISO код |
| `tags` | string | Жанри (comma-separated) |
| `language` | string | Мова |
| `votes` | i32 | Голоси |
| `clickcount` | u32 | Кількість прослуховувань |
| `has_extended_info` | bool | Чи надсилає ICY metadata |
| `lastcheckok` | i8 | Чи працює (1 = так) |
| `homepage` | string | Сайт станції |
| `favicon` | string | URL іконки (не використовуємо — accessibility-first) |

### 2.5. Пагінація

- Тип: **offset/limit** (не cursor-based)
- Default limit: ~100
- Max limit: 1000
- Приклад: `?limit=50&offset=100`

### 2.6. Якість даних

⚠️ **Обмеження:**
- Теги — user-submitted, без валідації, можуть бути невалідними
- Мова — вільний текст, не завжди ISO 639
- Деякі станції мають `lastcheckok=0` (зламані)
- URL можуть мати пробіли на початку/кінці
- `url_resolved` може бути порожнім

---

## 3. Порівняння підходів

### Підхід A: Крейт `radiobrowser` (v0.6.1)

**Опис:** Використати готову бібліотеку `radiobrowser = "0.6"` з crates.io.

**Плюси:**
- Builder pattern для пошуку: `api.get_stations().name("jazz").codec("MP3").send()`
- Автоматичний server discovery через DNS
- Типізовані структури (`ApiStation`, `ApiCountry`, `ApiLanguage`, `ApiTag`)
- Автоматичний fallback між серверами

**Мінуси:**
- ❌ **Критичний конфлікт залежностей:**
  - Крейт використовує `reqwest = "0.11.22"` — Tapir використовує `reqwest = "0.13"`
  - Крейт використовує `async-std` — Tapir використовує `tokio`
  - Це означає **дві версії reqwest у бінарнику** (+~1.5 MB до розміру)
  - `async-std` з feature `tokio1` може працювати з tokio, але це зайва залежність
- ❌ `chrono 0.4.31` з `serde` — збігається з Tapir, ОК
- ❌ Підтягує `rand 0.8`, `async-std-resolver 0.24`, `log 0.4`
- ⚠️ Остання версія — жовтень 2023 (1.5+ року без оновлень)
- ⚠️ Error type — `Box<dyn Error>`, не інтегрується з `RadioError`
- ⚠️ Повертає `ApiStation` з 31 полем — потрібна конверсія у `StationResult`

**Оцінка впливу на бінарник:**
- Додаткові залежності: `async-std`, `async-std-resolver`, `rand 0.8`, `reqwest 0.11`
- Очікуване збільшення: ~2-3 MB (release), ~5-8 MB (release-fast)

### Підхід B: Власний тонкий клієнт на `reqwest 0.13` (РЕКОМЕНДОВАНИЙ)

**Опис:** Написати ~200-300 рядків Rust коду — тонку обгортку над Radio Browser REST API, використовуючи `reqwest 0.13` який вже є у проєкті.

**Плюси:**
- ✅ **Нуль нових залежностей** — `reqwest`, `serde`, `serde_json`, `chrono`, `tokio` вже є
- ✅ Повний контроль над error handling (`RadioError` enum)
- ✅ Серіалізація напряму в `StationResult` — без проміжної конверсії
- ✅ Мінімальний вплив на розмір бінарника (0 байт нових залежностей)
- ✅ Простий для підтримки — API стабільний, ендпоінти не змінюються
- ✅ Можна додати кешування фільтрів (країни, кодеки) на рівні клієнта
- ✅ Server discovery — 5 рядків коду (DNS lookup або HTTP запит до `/json/servers`)

**Мінуси:**
- Треба написати ~200-300 рядків коду
- Треба реалізувати server discovery самостійно
- Без автоматичного fallback (але можна додати тривіально)

**Архітектура модуля:**

```
src-tauri/src/browser/
├── mod.rs           # pub mod api; pub mod types;
├── api.rs           # RadioBrowserClient — HTTP запити
└── types.rs         # StationResult, SearchParams, CountryInfo, тощо
```

### Підхід C: Frontend-only (fetch з WebView)

**Опис:** Робити HTTP запити до Radio Browser API напряму з frontend через `fetch()` або `tauri-plugin-http`.

**Плюси:**
- Немає Rust коду для API клієнта
- Швидше для прототипу

**Мінуси:**
- ❌ **Порушує архітектуру** — Tapir backend-first, вся бізнес-логіка в Rust
- ❌ CSP обмеження — `connect-src` вже дозволяє `*.api.radio-browser.info`, але все одно це anti-pattern
- ❌ Немає контролю над timeout, retry, error handling на рівні Rust
- ❌ Неможливо кешувати відповіді у файлову систему (portable data/)
- ❌ Дублювання серіалізації — дані прийдуть у JS, потім через IPC знову у Rust для `add_station_from_browser`

**Відхилений** — суперечить базовій архітектурі проєкту.

---

## 4. Таблиця порівняння

| Критерій | A: Крейт `radiobrowser` | B: Власний клієнт | C: Frontend-only |
|----------|------------------------|-------------------|------------------|
| **Нові залежності** | +6 крейтів (~3 MB) | 0 | 0 |
| **Конфлікт reqwest** | ❌ 0.11 vs 0.13 | ✅ Немає | ✅ Немає |
| **Async runtime** | ⚠️ async-std (з tokio1) | ✅ tokio native | — |
| **Error handling** | ⚠️ Box\<dyn Error\> | ✅ RadioError | ❌ JS errors |
| **Server discovery** | ✅ Вбудований | ⚠️ ~10 рядків коду | ❌ Ні |
| **Server fallback** | ✅ Автоматичний | ⚠️ ~20 рядків коду | ❌ Ні |
| **Кешування** | ❌ Ні | ✅ Повний контроль | ❌ Ні |
| **Типізація** | ✅ ApiStation (31 поле) | ✅ StationResult (наші типи) | ❌ any/unknown |
| **Обсяг коду** | ~10 рядків (Cargo.toml + use) | ~200-300 рядків | ~150 рядків (TS) |
| **Підтримка** | ⚠️ Остання версія 10/2023 | ✅ Наш код | — |
| **Збільшення бінарника** | ~2-3 MB | ~0 | ~0 |
| **Відповідність архітектурі** | ✅ Backend | ✅ Backend | ❌ Frontend |
| **Час реалізації** | Швидше | Трохи довше | Швидко, але anti-pattern |

---

## 5. Рекомендація

### **→ Підхід B: Власний тонкий клієнт**

**Обґрунтування:**

1. **Конфлікт залежностей** — `radiobrowser` крейт тягне `reqwest 0.11` поруч з нашим `reqwest 0.13`. Це не просто теоретична проблема — це +2-3 MB до бінарника портативного додатку, де кожен мегабайт на рахунку (`opt-level = "s"`, `strip = true`, `lto = true` у release профілі).

2. **Обсяг API** — Radio Browser API надзвичайно простий. Це GET-запити з query параметрами, які повертають JSON масиви. Для Tapir потрібні лише 3-4 ендпоінти. Builder pattern крейту — overkill.

3. **Error handling** — `Box<dyn Error>` не інтегрується з `RadioError` enum. Потрібна обгортка, що нівелює переваги готового крейту.

4. **Контроль** — власний клієнт дозволяє:
   - Серіалізувати напряму у `StationResult` (без проміжного `ApiStation`)
   - Додати кешування фільтрів (країни, кодеки) у пам'яті
   - Використовувати `tracing` для логування (а не `log`)
   - Інтегрувати з existing `reqwest::Client` конфігурацією

5. **Стабільність API** — Radio Browser API не мав breaking changes роками. Server v0.7.44 стабільний. Ризик того, що наш клієнт "зламається" — мінімальний.

---

## 6. Ескіз реалізації

### 6.1. Backend модулі

```
src-tauri/src/browser/
├── mod.rs           # pub mod api; pub mod types;
├── api.rs           # RadioBrowserClient
└── types.rs         # Типи даних
```

#### `types.rs` — Типи даних

```rust
use serde::{Deserialize, Serialize};

/// Результат пошуку станції з Radio Browser API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StationResult {
    pub stationuuid: String,
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub url_resolved: String,
    pub codec: String,
    pub bitrate: u32,
    pub country: String,
    pub countrycode: String,
    pub tags: String,
    pub language: String,
    pub votes: i32,
    pub clickcount: u32,
    #[serde(default)]
    pub has_extended_info: Option<bool>,
    #[serde(default)]
    pub homepage: String,
    pub lastcheckok: i8,
}

/// Параметри пошуку станцій
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchParams {
    pub query: Option<String>,
    pub tag: Option<String>,
    pub country_code: Option<String>,
    pub language: Option<String>,
    pub codec: Option<String>,       // "MP3", "AAC"
    pub min_bitrate: Option<u32>,
    pub order: Option<String>,       // "clickcount", "votes", "name", "bitrate"
    pub reverse: Option<bool>,
    pub offset: Option<u32>,
    pub limit: Option<u32>,          // default 50, max 1000
}

/// Елемент списку країн/мов/кодеків
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterItem {
    pub name: String,
    #[serde(default)]
    pub stationcount: u32,
}
```

#### `api.rs` — HTTP клієнт

```rust
use reqwest::Client;
use crate::errors::RadioError;
use super::types::*;

pub struct RadioBrowserClient {
    client: Client,
    base_url: String,
}

impl RadioBrowserClient {
    pub fn new() -> Result<Self, RadioError> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .user_agent("Tapir/0.1.0")
            .build()?;
        
        Ok(Self {
            client,
            base_url: "https://de1.api.radio-browser.info".into(),
        })
    }

    /// Пошук станцій
    pub async fn search_stations(&self, params: &SearchParams) -> Result<Vec<StationResult>, RadioError> {
        let mut query_params = vec![
            ("hidebroken", "true".to_string()),
            ("lastcheckok", "1".to_string()),
        ];
        
        if let Some(ref q) = params.query {
            query_params.push(("name", q.clone()));
        }
        if let Some(ref tag) = params.tag {
            query_params.push(("tag", tag.clone()));
        }
        if let Some(ref cc) = params.country_code {
            query_params.push(("countrycode", cc.clone()));
        }
        if let Some(ref codec) = params.codec {
            query_params.push(("codec", codec.clone()));
        }
        if let Some(min_br) = params.min_bitrate {
            query_params.push(("bitrateMin", min_br.to_string()));
        }
        if let Some(ref order) = params.order {
            query_params.push(("order", order.clone()));
        }
        // ... limit, offset, reverse

        let resp = self.client
            .get(format!("{}/json/stations/search", self.base_url))
            .query(&query_params)
            .send()
            .await?
            .error_for_status()?;
        
        let stations: Vec<StationResult> = resp.json().await?;
        Ok(stations)
    }

    /// Список країн
    pub async fn get_countries(&self) -> Result<Vec<FilterItem>, RadioError> { ... }
    
    /// Список кодеків
    pub async fn get_codecs(&self) -> Result<Vec<FilterItem>, RadioError> { ... }
    
    /// Список мов
    pub async fn get_languages(&self) -> Result<Vec<FilterItem>, RadioError> { ... }
    
    /// Список тегів (топ N за кількістю станцій)
    pub async fn get_top_tags(&self, limit: u32) -> Result<Vec<FilterItem>, RadioError> { ... }
}
```

#### IPC команди (`commands/browser_commands.rs`)

```rust
#[tauri::command]
pub async fn search_stations(
    params: SearchParams,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<StationResult>, String> {
    let client = state.browser_client.read().await;
    client.search_stations(&params).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_browser_filters(
    state: tauri::State<'_, AppState>,
) -> Result<BrowserFilters, String> {
    // Повертає countries, codecs, languages, top tags
    // Кешується в пам'яті на 1 годину
}

#[tauri::command]
pub async fn add_station_from_browser(
    station: StationResult,
    state: tauri::State<'_, AppState>,
) -> Result<StreamInfo, String> {
    // Конвертує StationResult → StreamInfo
    // Додає до профілю
    // Зберігає профіль
    // Емітить подію
}
```

### 6.2. Frontend компоненти

```
src/components/browser/
├── BrowserPanel.tsx      # Головна панель (SearchForm + ResultsTable)
├── SearchForm.tsx        # Поле пошуку + фільтри
└── ResultsTable.tsx      # Таблиця результатів з кнопками "Додати"

src/stores/
└── browser.ts            # Стан пошуку, результати, фільтри
```

#### `browser.ts` — Store

```typescript
import { atom, computed } from "nanostores";

export interface StationResult { ... }
export interface SearchParams { ... }
export interface BrowserFilters { countries: FilterItem[]; codecs: FilterItem[]; languages: FilterItem[]; tags: FilterItem[]; }

export const $searchResults = atom<StationResult[]>([]);
export const $searchLoading = atom(false);
export const $searchError = atom<string | null>(null);
export const $searchParams = atom<SearchParams>({ limit: 50, order: "clickcount" });
export const $browserFilters = atom<BrowserFilters | null>(null);

export async function searchStations(params: SearchParams) { ... }
export async function loadFilters() { ... }
export async function addStation(station: StationResult) { ... }
```

#### `BrowserPanel.tsx` — Головна панель

```tsx
// SearchForm зверху, ResultsTable знизу
// Empty state: "Введіть запит для пошуку станцій"
// Loading state: aria-live="polite" спінер
// Error state: aria-live="assertive" повідомлення
```

#### `SearchForm.tsx` — Форма пошуку

```tsx
// React Aria SearchField для назви
// React Aria Select для країни, кодеку, мови
// React Aria NumberField для мін. бітрейту
// Кнопка "Шукати" (або автопошук з debounce 500ms)
```

#### `ResultsTable.tsx` — Таблиця результатів

```tsx
// React Aria Table з колонками:
// Назва | Країна | Кодек | Бітрейт | Голоси | Дії
// Кнопка "Додати" у колонці Дії
// Пагінація: "Завантажити ще" кнопка (offset-based)
// NVDA: повна grid навігація (стрілки), sort by column header
```

### 6.3. Accessibility-специфічне

| Елемент | Реалізація |
|---------|------------|
| Пошукове поле | `<SearchField>` з `aria-label` |
| Фільтри | `<Select>` з `<Label>` кожен |
| Таблиця | React Aria `<Table>` з sortable columns |
| Кнопка "Додати" | `<Button>` у кожному рядку, `aria-label="Додати {station.name}"` |
| Loading | `aria-live="polite"` регіон: "Пошук станцій..." |
| Результати | `aria-live="polite"`: "Знайдено N станцій" |
| Помилка | `aria-live="assertive"`: текст помилки |
| Empty state | Статичний текст з інструкцією |
| Пагінація | Кнопка "Завантажити ще N" з aria-label |

### 6.4. Кешування

**В пам'яті (RadioBrowserClient):**
- Список країн — кеш 24 години (237 елементів, ~5 KB)
- Список кодеків — кеш 24 години (11 елементів, <1 KB)
- Список мов — кеш 24 години (616 елементів, ~15 KB)
- Топ-100 тегів — кеш 1 година (~3 KB)

**Чому не файловий кеш:** дані маленькі, оновлюються рідко, не варті складності.

### 6.5. Server Discovery

**Спрощений підхід (замість повного DNS):**

```rust
const SERVERS: &[&str] = &[
    "https://de1.api.radio-browser.info",
    "https://de2.api.radio-browser.info",
    "https://nl1.api.radio-browser.info",
];

// При ініціалізації: пробуємо /json/stats на кожному, використовуємо перший який відповів
// Fallback: якщо поточний сервер не відповідає — переходимо на наступний
```

**Чому не DNS-based discovery:** потребує додатковий крейт для DNS резолюції (trust-dns або hickory-dns). Список серверів стабільний, можна хардкодити з fallback через HTTP `/json/servers`.

### 6.6. Error Handling

Нові варіанти `RadioError`:

```rust
pub enum RadioError {
    // ... existing variants ...
    
    /// Radio Browser API request failed
    #[error("Radio Browser API error: {0}")]
    BrowserApi(String),
    
    /// No Radio Browser servers available
    #[error("No Radio Browser servers available")]
    BrowserNoServers,
}
```

### 6.7. Зміни в AppState

```rust
pub struct AppState {
    pub stream_manager: Arc<RwLock<StreamManager>>,
    pub player: Arc<RwLock<PlayerEngine>>,
    pub settings: Arc<RwLock<GlobalSettings>>,
    pub active_profile: Arc<RwLock<Profile>>,
    pub browser_client: Arc<RwLock<RadioBrowserClient>>,  // NEW
}
```

### 6.8. i18n ключі (нові)

```json
{
  "browser_section": "Браузер станцій",
  "browser_search_placeholder": "Назва станції або жанр...",
  "browser_filter_country": "Країна",
  "browser_filter_codec": "Кодек",
  "browser_filter_language": "Мова",
  "browser_filter_min_bitrate": "Мін. бітрейт (кбіт/с)",
  "browser_search_button": "Шукати",
  "browser_results_count": "Знайдено {count} станцій",
  "browser_loading": "Пошук станцій...",
  "browser_empty": "Введіть запит для пошуку радіостанцій",
  "browser_no_results": "Станцій не знайдено. Спробуйте інший запит.",
  "browser_error": "Помилка пошуку: {error}",
  "browser_add_station": "Додати {name}",
  "browser_station_added": "Станцію {name} додано",
  "browser_load_more": "Завантажити ще",
  "browser_column_name": "Назва",
  "browser_column_country": "Країна",
  "browser_column_codec": "Кодек",
  "browser_column_bitrate": "Бітрейт",
  "browser_column_votes": "Голоси",
  "browser_column_actions": "Дії",
  "browser_all_countries": "Усі країни",
  "browser_all_codecs": "Усі кодеки",
  "browser_all_languages": "Усі мови"
}
```

---

## 7. Потенційні проблеми та ризики

### 7.1. Мережа

| Ризик | Ймовірність | Мітигація |
|-------|-------------|-----------|
| Radio Browser API недоступний | Низька | Fallback між серверами; повідомлення користувачу |
| Повільна відповідь (>5с) | Середня | Timeout 10с + індикатор завантаження |
| Великий обсяг даних | Низька | Limit 50 за замовчуванням, пагінація |

### 7.2. Дані

| Ризик | Ймовірність | Мітигація |
|-------|-------------|-----------|
| Зламана станція (url не працює) | Висока | `hidebroken=true`, `lastcheckok=1` |
| Дублікати станцій | Середня | Дедуплікація за `url_resolved` |
| Порожній `url_resolved` | Низька | Fallback на `url` |
| Невалідні теги/назви | Висока | Trim whitespace, показувати as-is |

### 7.3. UX/Accessibility

| Ризик | Ймовірність | Мітигація |
|-------|-------------|-----------|
| Занадто багато результатів для SR | Середня | Ліміт 50 + пагінація |
| Довгі назви станцій | Висока | CSS truncation + aria-label з повним текстом |
| Фільтри складні для навігації | Середня | Логічний tab order, fieldset grouping |

### 7.4. Архітектура

| Ризик | Ймовірність | Мітигація |
|-------|-------------|-----------|
| Radio Browser API зміне формат | Мінімальна | API стабільний роками; `#[serde(default)]` для нових полів |
| `add_station_from_browser` конфлікт з існуючим потоком | Низька | Перевірка дублікатів за URL |

---

## 8. Adversarial Review Checklist

- [x] **Чи не додає зайвих залежностей?** — Підхід B: 0 нових крейтів ✅
- [x] **Чи відповідає архітектурі (backend-first)?** — Так, API клієнт у Rust ✅
- [x] **Чи accessible для NVDA?** — React Aria Table + live regions + keyboard nav ✅
- [x] **Чи portable?** — Немає файлового кешу, лише in-memory ✅
- [x] **Чи враховує помилки мережі?** — Timeout, retry, fallback сервер, UI повідомлення ✅
- [x] **Чи не over-engineered?** — 3 файли backend + 3 файли frontend + 1 store ✅
- [x] **Чи не порушує існуючий функціонал?** — Новий модуль, тільки `AppState` отримує нове поле ✅
- [x] **Чи i18n-ready?** — Усі строки через Paraglide ✅
- [x] **Чи враховує forced-colors (HC)?** — Треба додати forced-colors класи (Phase 3I-1 паттерни) ✅
- [x] **Чи є fallback при недоступності API?** — Так: інші сервери + повідомлення ✅

---

## 9. Відмінності від задокументованого StationResult

Поточний `StationResult` у `data-models.md` має 10 полів. Рекомендую розширити до 16 полів (додати `countrycode`, `language`, `votes`, `clickcount`, `lastcheckok`, `homepage`) для повноцінного UI. Поля `favicon` можна прибрати — у accessibility-first додатку іконки станцій не несуть цінності для screen reader.

**Рекомендація:** оновити `data-models.md` у специфікації Phase 3B.

---

## 10. Наступні кроки

1. ✅ Затвердити **Підхід B** (власний клієнт)
2. Написати специфікацію Phase 3B (деталізувати UI wireframes для кожного стану)
3. Написати план реалізації (tasks, chunks)
4. Реалізувати через subagent-driven development
