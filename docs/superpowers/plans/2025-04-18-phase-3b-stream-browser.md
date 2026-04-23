# Phase 3B — Stream Browser Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Radio Browser API integration so users can search, filter, and add internet radio stations to their profile without manually entering URLs.

**Architecture:** Custom HTTP client (`RadioBrowserClient`) on existing `reqwest 0.13`, lazy-initialized via `tokio::sync::OnceCell`. Three IPC commands expose search, filters, and add-station operations. Frontend uses nanostores for state, React Aria Components for accessible table/form controls, debounced auto-search. No new Rust crate dependencies.

**Tech Stack:** Rust (Tauri v2, reqwest 0.13, serde, tokio, chrono), React 19, React Aria Components, Nanostores, Tailwind CSS 4, Paraglide.js i18n, Lucide icons

**Spec:** `docs/superpowers/specs/2025-07-18-phase-3b-stream-browser-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|----------------|
| `src-tauri/src/browser/mod.rs` | Module root: re-exports api + types |
| `src-tauri/src/browser/types.rs` | Data types: `StationResult`, `SearchParams`, `FilterItem`, `BrowserFilters`, `ServerInfo` |
| `src-tauri/src/browser/api.rs` | `RadioBrowserClient`: HTTP client with server discovery, fallback, filter caching |
| `src-tauri/src/commands/browser_commands.rs` | IPC commands: `search_stations`, `get_browser_filters`, `add_station_from_browser` |
| `src/stores/browser.ts` | Nanostores: search state, filters, actions, debounce logic |
| `src/components/browser/BrowserPanel.tsx` | Main browser panel: orchestrates SearchForm + StationTable |
| `src/components/browser/SearchForm.tsx` | Search field + filter selects (country, language, codec, bitrate) |
| `src/components/browser/StationTable.tsx` | Accessible table with sortable columns, "Add" button, "Load more" pagination |

### Modified files

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `"json"` to reqwest features |
| `src-tauri/src/lib.rs` | Add `mod browser;`, register 3 IPC commands |
| `src-tauri/src/app_state.rs` | Add `browser_client: Arc<tokio::sync::OnceCell<RadioBrowserClient>>` field |
| `src-tauri/src/commands/mod.rs` | Add `pub mod browser_commands;` |
| `src-tauri/src/errors.rs` | Add `BrowserApi`, `BrowserNoServers`, `DuplicateStream` variants |
| `src/lib/tauri.ts` | Add `StationResult`, `SearchParams`, `BrowserFilters` TS types |
| `src/App.tsx` | Import `BrowserPanel`, add render case + `streams-changed` event listener |
| `src/components/layout/ActivityBar.tsx` | Set browser section `disabled: false`, remove `phase` |
| `src/i18n/messages/uk.json` | Add 28 new i18n keys + update 1 existing (`browser_section`) |
| `src/i18n/messages/en.json` | Add 28 new i18n keys + update 1 existing (`browser_section`) |
| `docs/data-models.md` | Update §4.3 `StationResult` (10 fields → 15 fields) |

---

## Chunk 1: Backend — Types, API Client, Errors, AppState, IPC Commands

### Task 1: Error variants + types module

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/errors.rs`
- Create: `src-tauri/src/browser/mod.rs`
- Create: `src-tauri/src/browser/types.rs`

- [ ] **Step 1: Enable reqwest `json` feature in `Cargo.toml`**

In `src-tauri/Cargo.toml`, add `"json"` to the reqwest features list:

```toml
reqwest = { version = "0.13", default-features = false, features = ["stream", "rustls", "json"] }
```

- [ ] **Step 2: Add error variants to `RadioError`**

In `src-tauri/src/errors.rs`, add three new variants before the closing `}`:

```rust
    #[error("Radio Browser API error: {0}")]
    BrowserApi(String),

    #[error("No Radio Browser servers available")]
    BrowserNoServers,

    #[error("Stream with this URL already exists")]
    DuplicateStream,
```

- [ ] **Step 3: Create `src-tauri/src/browser/mod.rs`**

```rust
pub mod api;
pub mod types;
```

- [ ] **Step 4: Create `src-tauri/src/browser/types.rs`**

Full content from spec §1.1:

```rust
use serde::{Deserialize, Serialize};

/// Станція з Radio Browser API.
/// Десеріалізується з JSON відповіді API (snake_case),
/// серіалізується у camelCase для фронтенду через Tauri IPC.
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
    pub query: Option<String>,
    pub country: Option<String>,
    pub language: Option<String>,
    pub codec: Option<String>,
    pub min_bitrate: Option<u32>,
    pub order: Option<String>,
    pub reverse: Option<bool>,
    pub offset: Option<u32>,
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

- [ ] **Step 5: Register module in `lib.rs`**

Add `mod browser;` after the existing module declarations (after line 12 `mod wishlist;`):

```rust
mod browser;
```

- [ ] **Step 6: Verify compilation**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | Select-String -Pattern "error|warning" | Select-Object -First 10`
Expected: No errors (warnings about unused items are OK at this stage)

- [ ] **Step 7: Commit**

```
git add src-tauri/Cargo.toml src-tauri/src/errors.rs src-tauri/src/browser/ src-tauri/src/lib.rs
git commit -m "feat(browser): add types module and error variants for Radio Browser API"
```

---

### Task 2: RadioBrowserClient — API client with server discovery and fallback

**Files:**
- Create: `src-tauri/src/browser/api.rs`

- [ ] **Step 1: Create `src-tauri/src/browser/api.rs`**

```rust
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};
use reqwest::Client;
use serde::de::DeserializeOwned;
use tokio::sync::RwLock;
use tracing::warn;

use crate::errors::RadioError;
use super::types::*;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const FILTER_CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_RETRIES: usize = 3;
const DEFAULT_SERVERS: &[&str] = &["de1.api.radio-browser.info", "de2.api.radio-browser.info", "nl1.api.radio-browser.info"];

pub struct RadioBrowserClient {
    client: Client,
    servers: Vec<String>,
    current_server: AtomicUsize,
    filters_cache: RwLock<Option<(BrowserFilters, Instant)>>,
}

impl RadioBrowserClient {
    /// Create a new client, discovering servers from the Radio Browser DNS API.
    /// Falls back to hardcoded servers if discovery fails.
    pub async fn new() -> Result<Self, RadioError> {
        let client = Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .user_agent("Tapir/0.1.0")
            .build()
            .map_err(|e| RadioError::BrowserApi(e.to_string()))?;

        let servers = match client
            .get("https://all.api.radio-browser.info/json/servers")
            .send()
            .await
        {
            Ok(resp) => {
                let infos: Vec<ServerInfo> = resp.json().await.unwrap_or_default();
                let mut names: Vec<String> = infos.into_iter().map(|s| s.name).collect();
                names.sort();
                names.dedup();
                if names.is_empty() {
                    DEFAULT_SERVERS.iter().map(|s| s.to_string()).collect()
                } else {
                    names
                }
            }
            Err(e) => {
                warn!("Radio Browser server discovery failed: {e}");
                DEFAULT_SERVERS.iter().map(|s| s.to_string()).collect()
            }
        };

        Ok(Self {
            client,
            servers,
            current_server: AtomicUsize::new(0),
            filters_cache: RwLock::new(None),
        })
    }

    /// Create a client with default hardcoded servers (no HTTP discovery).
    pub fn with_default_servers() -> Self {
        let client = Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .user_agent("Tapir/0.1.0")
            .build()
            .expect("Failed to build HTTP client");

        Self {
            client,
            servers: DEFAULT_SERVERS.iter().map(|s| s.to_string()).collect(),
            current_server: AtomicUsize::new(0),
            filters_cache: RwLock::new(None),
        }
    }

    /// Search stations by parameters.
    pub async fn search_stations(&self, params: &SearchParams) -> Result<Vec<StationResult>, RadioError> {
        let mut query: Vec<(String, String)> = vec![
            ("hidebroken".into(), "true".into()),
            ("lastcheckok".into(), "1".into()),
            ("limit".into(), params.limit.unwrap_or(50).to_string()),
            ("offset".into(), params.offset.unwrap_or(0).to_string()),
            ("order".into(), params.order.clone().unwrap_or_else(|| "clickcount".into())),
            ("reverse".into(), params.reverse.unwrap_or(false).to_string()),
        ];

        if let Some(ref q) = params.query {
            if !q.is_empty() {
                query.push(("name".into(), q.clone()));
            }
        }
        if let Some(ref c) = params.country {
            if !c.is_empty() {
                query.push(("country".into(), c.clone()));
            }
        }
        if let Some(ref lang) = params.language {
            if !lang.is_empty() {
                query.push(("language".into(), lang.clone()));
            }
        }
        if let Some(ref codec) = params.codec {
            if !codec.is_empty() {
                query.push(("codec".into(), codec.clone()));
            }
        }
        if let Some(br) = params.min_bitrate {
            if br > 0 {
                query.push(("bitrateMin".into(), br.to_string()));
            }
        }

        self.get_json("/json/stations/search", &query).await
    }

    /// Get filter lists (countries, codecs, languages, tags). Cached for 24h.
    pub async fn get_filters(&self) -> Result<BrowserFilters, RadioError> {
        // Check cache
        {
            let cache = self.filters_cache.read().await;
            if let Some((ref filters, ref instant)) = *cache {
                if instant.elapsed() < FILTER_CACHE_TTL {
                    return Ok(filters.clone());
                }
            }
        }

        // Fetch all filter lists in parallel
        let (countries, codecs, languages, tags) = tokio::join!(
            self.get_json::<Vec<FilterItem>>(
                "/json/countries",
                &[("order".into(), "stationcount".into()), ("reverse".into(), "true".into()), ("limit".into(), "250".into())]
            ),
            self.get_json::<Vec<FilterItem>>(
                "/json/codecs",
                &[("order".into(), "stationcount".into()), ("reverse".into(), "true".into())]
            ),
            self.get_json::<Vec<FilterItem>>(
                "/json/languages",
                &[("order".into(), "stationcount".into()), ("reverse".into(), "true".into()), ("limit".into(), "100".into())]
            ),
            self.get_json::<Vec<FilterItem>>(
                "/json/tags",
                &[("order".into(), "stationcount".into()), ("reverse".into(), "true".into()), ("limit".into(), "100".into())]
            ),
        );

        // If any request failed but we have a stale cache, return it
        let old_cache = {
            let cache = self.filters_cache.read().await;
            cache.as_ref().map(|(f, _)| f.clone())
        };

        let filters = BrowserFilters {
            countries: countries.or_else(|_| old_cache.as_ref().map(|c| c.countries.clone()).ok_or(RadioError::BrowserNoServers))?,
            codecs: codecs.or_else(|_| old_cache.as_ref().map(|c| c.codecs.clone()).ok_or(RadioError::BrowserNoServers))?,
            languages: languages.or_else(|_| old_cache.as_ref().map(|c| c.languages.clone()).ok_or(RadioError::BrowserNoServers))?,
            tags: tags.or_else(|_| old_cache.as_ref().map(|c| c.tags.clone()).ok_or(RadioError::BrowserNoServers))?,
        };

        // Update cache
        {
            let mut cache = self.filters_cache.write().await;
            *cache = Some((filters.clone(), Instant::now()));
        }

        Ok(filters)
    }

    /// Internal helper: GET JSON with server fallback (max 3 retries).
    async fn get_json<T: DeserializeOwned>(&self, path: &str, query: &[(String, String)]) -> Result<T, RadioError> {
        let mut last_err = RadioError::BrowserNoServers;

        for _ in 0..MAX_RETRIES.min(self.servers.len()) {
            let idx = self.current_server.load(Ordering::Relaxed) % self.servers.len();
            let server = &self.servers[idx];
            let url = format!("https://{server}{path}");

            match self.client.get(&url).query(query).send().await {
                Ok(resp) if resp.status().is_success() => {
                    return resp.json::<T>().await.map_err(|e| RadioError::BrowserApi(e.to_string()));
                }
                Ok(resp) => {
                    warn!("Radio Browser {server} returned {}: rotating server", resp.status());
                    last_err = RadioError::BrowserApi(format!("HTTP {}", resp.status()));
                }
                Err(e) => {
                    warn!("Radio Browser {server} failed: {e}: rotating server");
                    last_err = RadioError::BrowserApi(e.to_string());
                }
            }

            self.current_server.fetch_add(1, Ordering::Relaxed);
        }

        Err(last_err)
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | Select-String -Pattern "error" | Select-Object -First 10`
Expected: No errors

- [ ] **Step 3: Commit**

```
git add src-tauri/src/browser/api.rs
git commit -m "feat(browser): add RadioBrowserClient with server discovery and filter caching"
```

---

### Task 3: AppState + IPC commands

**Files:**
- Modify: `src-tauri/src/app_state.rs`
- Create: `src-tauri/src/commands/browser_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add `browser_client` field to `AppState`**

In `src-tauri/src/app_state.rs`:

Add import at top:
```rust
use crate::browser::api::RadioBrowserClient;
```

Add field to struct (after `pub player: Arc<PlayerEngine>`):
```rust
    pub browser_client: Arc<tokio::sync::OnceCell<RadioBrowserClient>>,
```

Add initialization in `new()` (after the `player` line, before `Ok(Self {`):
```rust
        let browser_client = Arc::new(tokio::sync::OnceCell::new());
```

Add field to `Self { ... }`:
```rust
            browser_client,
```

- [ ] **Step 2: Create `src-tauri/src/commands/browser_commands.rs`**

```rust
use tauri::Manager;
use tracing::warn;

use crate::app_state::AppState;
use crate::browser::api::RadioBrowserClient;
use crate::browser::types::*;
use crate::errors::RadioError;
use crate::profile::{AudioFormat, StreamInfo};

/// Helper: get or init the RadioBrowserClient from OnceCell.
async fn get_client(state: &AppState) -> &RadioBrowserClient {
    state.browser_client
        .get_or_init(|| async {
            RadioBrowserClient::new().await.unwrap_or_else(|e| {
                warn!("Failed to init Radio Browser client: {e}");
                RadioBrowserClient::with_default_servers()
            })
        })
        .await
}

#[tauri::command]
pub async fn search_stations(
    params: SearchParams,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<StationResult>, String> {
    let client = get_client(&state).await;
    client.search_stations(&params).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_browser_filters(
    state: tauri::State<'_, AppState>,
) -> Result<BrowserFilters, String> {
    let client = get_client(&state).await;
    client.get_filters().await.map_err(|e| e.to_string())
}

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

    // Duplicate check by URL
    if profile.streams.iter().any(|s| s.url == url) {
        return Err(RadioError::DuplicateStream.to_string());
    }

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

    let profile_clone = profile.clone();
    drop(profile);

    tokio::task::spawn_blocking(move || profile_clone.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    app.emit("streams-changed", ()).ok();

    Ok(stream_info)
}
```

- [ ] **Step 3: Register module in `commands/mod.rs`**

Add after `pub mod wishlist_commands;`:
```rust
pub mod browser_commands;
```

- [ ] **Step 4: Register IPC commands in `lib.rs`**

Add after the `wishlist_commands::update_ignorelist_pattern,` line (before `])`):
```rust
            commands::browser_commands::search_stations,
            commands::browser_commands::get_browser_filters,
            commands::browser_commands::add_station_from_browser,
```

- [ ] **Step 5: Verify compilation**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | Select-String -Pattern "error" | Select-Object -First 10`
Expected: No errors

- [ ] **Step 6: Commit**

```
git add src-tauri/src/app_state.rs src-tauri/src/commands/browser_commands.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(browser): add IPC commands and integrate with AppState"
```

---

## Chunk 2: Frontend — Types, Store, i18n, data-models

### Task 4: TypeScript types in `tauri.ts`

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Add types to `src/lib/tauri.ts`**

Add after existing type/interface blocks (before the function exports section):

```typescript
// --- Radio Browser types ---

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

// --- Radio Browser IPC wrappers ---

export async function searchStationsIpc(params: SearchParams): Promise<StationResult[]> {
  return invoke<StationResult[]>("search_stations", { params });
}

export async function getBrowserFilters(): Promise<BrowserFilters> {
  return invoke<BrowserFilters>("get_browser_filters");
}

export async function addStationFromBrowser(station: StationResult): Promise<void> {
  return invoke("add_station_from_browser", { station });
}
```

- [ ] **Step 2: Commit**

```
git add src/lib/tauri.ts
git commit -m "feat(browser): add Radio Browser TypeScript types and IPC wrappers"
```

---

### Task 5: Browser store

**Files:**
- Create: `src/stores/browser.ts`

- [ ] **Step 1: Create `src/stores/browser.ts`**

```typescript
import { atom, computed } from "nanostores";
import type { StationResult, SearchParams, BrowserFilters } from "../lib/tauri";
import { searchStationsIpc, getBrowserFilters, addStationFromBrowser } from "../lib/tauri";

// --- State ---

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
export const $popularError = atom<string | null>(null);

export const $isSearchActive = computed($searchParams, (params) =>
  Boolean(params.query || params.country || params.language || params.codec || params.minBitrate)
);

// --- Actions ---

export async function searchStations(params: SearchParams): Promise<void> {
  $searchLoading.set(true);
  $searchError.set(null);
  try {
    const results = await searchStationsIpc(params);
    if (params.offset && params.offset > 0) {
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
    const filters = await getBrowserFilters();
    $browserFilters.set(filters);
  } catch (e) {
    console.error("Failed to load browser filters:", e);
  }
}

export async function loadPopularStations(): Promise<void> {
  $popularLoading.set(true);
  $popularError.set(null);
  try {
    const results = await searchStationsIpc({ limit: 50, order: "clickcount" });
    $popularStations.set(results);
  } catch (e) {
    $popularError.set(String(e));
  } finally {
    $popularLoading.set(false);
  }
}

export async function addStation(station: StationResult): Promise<void> {
  await addStationFromBrowser(station);
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

- [ ] **Step 2: Commit**

```
git add src/stores/browser.ts
git commit -m "feat(browser): add browser nanostores with search, filters, and pagination"
```

---

### Task 6: i18n keys (uk + en)

**Files:**
- Modify: `src/i18n/messages/uk.json`
- Modify: `src/i18n/messages/en.json`

- [ ] **Step 1: Update `browser_section` and add new keys to `uk.json`**

Update existing key:
```json
"browser_section": "Браузер станцій"
```
(was: `"browser_section": "Браузер"`)

Add 28 new keys (insert after `browser_section` or at end of file before closing `}`):

```json
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
"browser_added": "✓ Додано",
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
```

- [ ] **Step 2: Update `browser_section` and add new keys to `en.json`**

Update existing key:
```json
"browser_section": "Station Browser"
```

Add 28 new keys (same order as uk.json):

```json
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
"browser_added": "✓ Added",
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
```

- [ ] **Step 3: Compile i18n**

Run: `npx @inlang/paraglide-js compile --project .\project.inlang --outdir .\src\i18n\paraglide`
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```
git add src/i18n/messages/uk.json src/i18n/messages/en.json src/i18n/paraglide/
git commit -m "feat(browser): add i18n keys for Stream Browser (uk + en)"
```

---

### Task 7: Update `data-models.md` §4.3

**Files:**
- Modify: `docs/data-models.md`

- [ ] **Step 1: Replace §4.3 StationResult**

Replace the TypeScript interface (lines 680–691) with:

```typescript
interface StationResult {
  stationuuid: string;
  name: string;
  url: string;
  urlResolved: string;
  codec: string;          // "MP3", "AAC", "AAC+"
  bitrate: number;
  country: string;
  countrycode: string;    // ISO 3166-1 (e.g. "UA", "DE")
  tags: string;           // comma-separated
  language: string;
  votes: number;
  clickcount: number;
  hasExtendedInfo: boolean | null;
  homepage: string;
  lastcheckok: number;    // 1 = OK, 0 = failed
}
```

Replace the Rust struct (lines 694–708) with:

```rust
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
```

- [ ] **Step 2: Commit**

```
git add docs/data-models.md
git commit -m "docs: update StationResult in data-models.md (10 → 15 fields)"
```

---

## Chunk 3: Frontend — UI Components

### Task 8: BrowserPanel — main container

**Files:**
- Create: `src/components/browser/BrowserPanel.tsx`

- [ ] **Step 1: Create `src/components/browser/BrowserPanel.tsx`**

```tsx
import { useEffect } from "react";
import { useStore } from "@nanostores/react";
import { SearchForm } from "./SearchForm";
import { StationTable } from "./StationTable";
import {
  $searchResults,
  $searchLoading,
  $searchError,
  $popularStations,
  $popularLoading,
  $popularError,
  $hasMore,
  $isSearchActive,
  loadFilters,
  loadPopularStations,
  loadMore,
} from "../../stores/browser";
import * as m from "../../i18n/paraglide/messages";

export function BrowserPanel() {
  const searchResults = useStore($searchResults);
  const searchLoading = useStore($searchLoading);
  const searchError = useStore($searchError);
  const popularStations = useStore($popularStations);
  const popularLoading = useStore($popularLoading);
  const popularError = useStore($popularError);
  const hasMore = useStore($hasMore);
  const isSearchActive = useStore($isSearchActive);

  useEffect(() => {
    loadFilters();
    loadPopularStations();
  }, []);

  return (
    <div role="region" aria-label={m.browser_section()} className="flex flex-1 flex-col overflow-hidden">
      <SearchForm />
      {isSearchActive && (searchResults.length > 0 || searchLoading || searchError) ? (
        <StationTable
          stations={searchResults}
          loading={searchLoading}
          error={searchError}
          hasMore={hasMore}
          onLoadMore={loadMore}
          emptyMessage={m.browser_no_results()}
        />
      ) : (
        <>
          <h2 className="px-4 py-2 text-sm font-medium text-slate-300">{m.browser_popular_title()}</h2>
          <StationTable
            stations={popularStations}
            loading={popularLoading}
            error={popularError}
            hasMore={false}
            emptyMessage={m.browser_empty()}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
git add src/components/browser/BrowserPanel.tsx
git commit -m "feat(browser): add BrowserPanel container component"
```

---

### Task 9: SearchForm — search field + filters

**Files:**
- Create: `src/components/browser/SearchForm.tsx`

- [ ] **Step 1: Create `src/components/browser/SearchForm.tsx`**

```tsx
import { useRef, useCallback, useEffect } from "react";
import { useStore } from "@nanostores/react";
import { SearchField, Input, Button, Label, Select, SelectValue, Popover, ListBox, ListBoxItem, NumberField, Group } from "react-aria-components";
import {
  $searchParams,
  $browserFilters,
  searchStations,
  updateSearchParam,
  resetSearch,
} from "../../stores/browser";
import * as m from "../../i18n/paraglide/messages";

export function SearchForm() {
  const params = useStore($searchParams);
  const filters = useStore($browserFilters);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounced text search
  const handleQueryChange = useCallback((value: string) => {
    updateSearchParam("query", value || undefined);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const current = $searchParams.get();
      searchStations(current);
    }, 500);
  }, []);

  // Immediate search on filter change
  const handleFilterChange = useCallback(<K extends keyof typeof params>(key: K, value: string) => {
    updateSearchParam(key, value || undefined);
    clearTimeout(debounceRef.current);
    setTimeout(() => searchStations($searchParams.get()), 0);
  }, []);

  // Debounced bitrate change
  const handleBitrateChange = useCallback((value: number) => {
    updateSearchParam("minBitrate", value > 0 ? value : undefined);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchStations($searchParams.get());
    }, 500);
  }, []);

  const handleClear = useCallback(() => {
    clearTimeout(debounceRef.current);
    resetSearch();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-slate-700 px-4 py-3 forced-colors:border-[ButtonText]">
      <SearchField
        aria-label={m.browser_search_placeholder()}
        value={params.query ?? ""}
        onChange={handleQueryChange}
        onClear={handleClear}
        autoFocus
        className="flex-1 min-w-48"
      >
        <Input
          placeholder={m.browser_search_placeholder()}
          className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText] forced-colors:focus:border-[Highlight]"
        />
      </SearchField>

      {filters && (
        <>
          <Select
            aria-label={m.browser_filter_country()}
            selectedKey={params.country ?? ""}
            onSelectionChange={(key) => handleFilterChange("country", String(key))}
          >
            <Label className="text-xs text-slate-400">{m.browser_filter_country()}</Label>
            <Button className="mt-1 flex w-40 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]">
              <SelectValue />
            </Button>
            <Popover className="w-60 rounded border border-slate-600 bg-slate-800 shadow-lg forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
              <ListBox className="max-h-60 overflow-y-auto p-1">
                <ListBoxItem id="" className="cursor-pointer rounded px-2 py-1.5 text-sm text-slate-300 outline-none hover:bg-slate-700 focus:bg-slate-700 forced-colors:text-[CanvasText] forced-colors:focus:bg-[Highlight] forced-colors:focus:text-[HighlightText]">
                  {m.browser_all_countries()}
                </ListBoxItem>
                {filters.countries.map((c) => (
                  <ListBoxItem key={c.name} id={c.name} className="cursor-pointer rounded px-2 py-1.5 text-sm text-slate-300 outline-none hover:bg-slate-700 focus:bg-slate-700 forced-colors:text-[CanvasText] forced-colors:focus:bg-[Highlight] forced-colors:focus:text-[HighlightText]">
                    {c.name} ({c.stationcount})
                  </ListBoxItem>
                ))}
              </ListBox>
            </Popover>
          </Select>

          <Select
            aria-label={m.browser_filter_language()}
            selectedKey={params.language ?? ""}
            onSelectionChange={(key) => handleFilterChange("language", String(key))}
          >
            <Label className="text-xs text-slate-400">{m.browser_filter_language()}</Label>
            <Button className="mt-1 flex w-40 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]">
              <SelectValue />
            </Button>
            <Popover className="w-60 rounded border border-slate-600 bg-slate-800 shadow-lg forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
              <ListBox className="max-h-60 overflow-y-auto p-1">
                <ListBoxItem id="" className="cursor-pointer rounded px-2 py-1.5 text-sm text-slate-300 outline-none hover:bg-slate-700 focus:bg-slate-700 forced-colors:text-[CanvasText] forced-colors:focus:bg-[Highlight] forced-colors:focus:text-[HighlightText]">
                  {m.browser_all_languages()}
                </ListBoxItem>
                {filters.languages.map((l) => (
                  <ListBoxItem key={l.name} id={l.name} className="cursor-pointer rounded px-2 py-1.5 text-sm text-slate-300 outline-none hover:bg-slate-700 focus:bg-slate-700 forced-colors:text-[CanvasText] forced-colors:focus:bg-[Highlight] forced-colors:focus:text-[HighlightText]">
                    {l.name} ({l.stationcount})
                  </ListBoxItem>
                ))}
              </ListBox>
            </Popover>
          </Select>

          <Select
            aria-label={m.browser_filter_codec()}
            selectedKey={params.codec ?? ""}
            onSelectionChange={(key) => handleFilterChange("codec", String(key))}
          >
            <Label className="text-xs text-slate-400">{m.browser_filter_codec()}</Label>
            <Button className="mt-1 flex w-32 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]">
              <SelectValue />
            </Button>
            <Popover className="w-48 rounded border border-slate-600 bg-slate-800 shadow-lg forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
              <ListBox className="max-h-60 overflow-y-auto p-1">
                <ListBoxItem id="" className="cursor-pointer rounded px-2 py-1.5 text-sm text-slate-300 outline-none hover:bg-slate-700 focus:bg-slate-700 forced-colors:text-[CanvasText] forced-colors:focus:bg-[Highlight] forced-colors:focus:text-[HighlightText]">
                  {m.browser_all_codecs()}
                </ListBoxItem>
                {filters.codecs.map((c) => (
                  <ListBoxItem key={c.name} id={c.name} className="cursor-pointer rounded px-2 py-1.5 text-sm text-slate-300 outline-none hover:bg-slate-700 focus:bg-slate-700 forced-colors:text-[CanvasText] forced-colors:focus:bg-[Highlight] forced-colors:focus:text-[HighlightText]">
                    {c.name} ({c.stationcount})
                  </ListBoxItem>
                ))}
              </ListBox>
            </Popover>
          </Select>

          <NumberField
            aria-label={m.browser_filter_min_bitrate()}
            value={params.minBitrate ?? 0}
            onChange={handleBitrateChange}
            minValue={0}
            maxValue={320}
            step={32}
          >
            <Label className="text-xs text-slate-400">{m.browser_filter_min_bitrate()}</Label>
            <Group className="mt-1 flex">
              <Input className="w-20 rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]" />
            </Group>
          </NumberField>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
git add src/components/browser/SearchForm.tsx
git commit -m "feat(browser): add SearchForm with debounced search and filter selects"
```

---

### Task 10: StationTable — accessible table with sorting and pagination

**Files:**
- Create: `src/components/browser/StationTable.tsx`

- [ ] **Step 1: Create `src/components/browser/StationTable.tsx`**

```tsx
import { useState, useCallback, useMemo } from "react";
import { useStore } from "@nanostores/react";
import {
  Cell,
  Column,
  Row,
  Table,
  TableBody,
  TableHeader,
  Button,
} from "react-aria-components";
import type { SortDescriptor } from "react-aria-components";
import { $streams } from "../../stores/streams";
import { addStation, updateSearchParam, searchStations, $searchParams } from "../../stores/browser";
import { addToast } from "../../stores/toasts";
import type { StationResult } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

interface StationTableProps {
  stations: StationResult[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore?: () => void;
  emptyMessage: string;
}

export function StationTable({ stations, loading, error, hasMore, onLoadMore, emptyMessage }: StationTableProps) {
  const streams = useStore($streams);
  const params = useStore($searchParams);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "clickcount",
    direction: "descending",
  });

  const existingUrls = useMemo(() => new Set(streams.map((s) => s.url)), [streams]);

  const isAlreadyAdded = useCallback(
    (station: StationResult) => {
      const url = station.urlResolved || station.url;
      return existingUrls.has(url);
    },
    [existingUrls],
  );

  const handleAdd = useCallback(async (station: StationResult) => {
    setAddingIds((prev) => new Set(prev).add(station.stationuuid));
    try {
      await addStation(station);
      addToast(m.browser_station_added({ name: station.name }), "success");
    } catch (e) {
      const errMsg = String(e);
      if (errMsg.includes("already exists")) {
        addToast(m.browser_station_duplicate(), "error");
      } else {
        addToast(errMsg, "error");
      }
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev);
        next.delete(station.stationuuid);
        return next;
      });
    }
  }, []);

  const handleSortChange = useCallback((descriptor: SortDescriptor) => {
    setSortDescriptor(descriptor);
    const field = String(descriptor.column);
    const reverse = descriptor.direction === "descending";
    updateSearchParam("order", field);
    updateSearchParam("reverse", reverse);
    setTimeout(() => searchStations($searchParams.get()), 0);
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Live region for announcements */}
      <div aria-live="polite" className="sr-only">
        {loading && m.browser_loading()}
        {!loading && stations.length > 0 && m.browser_results_count({ count: String(stations.length) })}
      </div>
      {error && (
        <div aria-live="assertive" className="px-4 py-2 text-sm text-red-400 forced-colors:text-[CanvasText]">
          {m.browser_error({ error })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {stations.length === 0 && !loading ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">{emptyMessage}</p>
        ) : (
          <Table
            aria-label={m.browser_section()}
            selectionMode="none"
            sortDescriptor={sortDescriptor}
            onSortChange={handleSortChange}
            className="w-full"
          >
            <TableHeader className="border-b border-slate-700 text-xs text-slate-500 uppercase forced-colors:border-[ButtonText]">
              <Column id="name" isRowHeader allowsSorting className="px-4 py-2 text-left cursor-pointer">
                {m.browser_column_name()}
              </Column>
              <Column id="country" allowsSorting className="w-[120px] px-2 py-2 text-left cursor-pointer">
                {m.browser_column_country()}
              </Column>
              <Column id="codec" allowsSorting className="w-[80px] px-2 py-2 text-left cursor-pointer">
                {m.browser_column_codec()}
              </Column>
              <Column id="bitrate" allowsSorting className="w-[90px] px-2 py-2 text-left cursor-pointer">
                {m.browser_column_bitrate()}
              </Column>
              <Column id="clickcount" allowsSorting className="w-[110px] px-2 py-2 text-left cursor-pointer">
                {m.browser_column_popularity()}
              </Column>
              <Column id="actions" className="w-[90px] px-2 py-2 text-left">
                {m.browser_column_actions()}
              </Column>
            </TableHeader>
            <TableBody>
              {stations.map((station) => {
                const added = isAlreadyAdded(station);
                const adding = addingIds.has(station.stationuuid);
                return (
                  <Row key={station.stationuuid} className="border-b border-slate-800 hover:bg-slate-800/50 forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]">
                    <Cell className="px-4 py-2 text-sm">{station.name}</Cell>
                    <Cell className="px-2 py-2 text-sm text-slate-400">{station.country}</Cell>
                    <Cell className="px-2 py-2 text-sm text-slate-400">{station.codec || "—"}</Cell>
                    <Cell className="px-2 py-2 text-sm text-slate-400">
                      {station.bitrate > 0 ? `${station.bitrate}` : "—"}
                    </Cell>
                    <Cell className="px-2 py-2 text-sm text-slate-400">{station.clickcount}</Cell>
                    <Cell className="px-2 py-2">
                      <Button
                        onPress={() => handleAdd(station)}
                        isDisabled={added || adding}
                        aria-label={
                          added
                            ? m.browser_station_already_added({ name: station.name })
                            : m.browser_add_station({ name: station.name })
                        }
                        className={`rounded px-2 py-0.5 text-xs ${
                          added
                            ? "text-slate-500 forced-colors:text-[GrayText]"
                            : "bg-blue-600 text-white hover:bg-blue-700 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
                        }`}
                      >
                        {added ? m.browser_added() : adding ? "..." : "+"}
                      </Button>
                    </Cell>
                  </Row>
                );
              })}
            </TableBody>
          </Table>
        )}

        {loading && (
          <p className="px-4 py-4 text-center text-sm text-slate-500">{m.browser_loading()}</p>
        )}

        {hasMore && !loading && onLoadMore && (
          <div className="flex justify-center py-3">
            <Button
              onPress={onLoadMore}
              aria-label={m.browser_load_more()}
              className="rounded bg-slate-700 px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-600 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
            >
              {m.browser_load_more()}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
git add src/components/browser/StationTable.tsx
git commit -m "feat(browser): add StationTable with sorting, pagination, and add-station"
```

---

## Chunk 4: Integration, Build Verification, Docs

### Task 11: App.tsx integration + ActivityBar

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/ActivityBar.tsx`

- [ ] **Step 1: Enable browser tab in ActivityBar**

In `src/components/layout/ActivityBar.tsx`, change line 17:

From:
```typescript
  { id: "browser", icon: Globe, label: m.browser_section(), disabled: true, phase: "2" },
```
To:
```typescript
  { id: "browser", icon: Globe, label: m.browser_section(), disabled: false },
```

- [ ] **Step 2: Add BrowserPanel import and render to App.tsx**

Add import (after `WishlistPanel` import):
```typescript
import { BrowserPanel } from "./components/browser/BrowserPanel";
```

Add `streams-changed` event handler after existing handlers (before `useTauriEvent` calls):
```typescript
  const handleStreamsChanged = useCallback(() => {
    tauri.getStreams().then((streams) => $streams.set(streams));
  }, []);
```

Add `useTauriEvent` call (after the last existing `useTauriEvent`):
```typescript
  useTauriEvent("streams-changed", handleStreamsChanged);
```

Add render case (after `{activeSection === "wishlist" && <WishlistPanel />}`, before `<PlayerPanel />`):
```tsx
        {activeSection === "browser" && <BrowserPanel />}
```

Update `SectionHeader` title to handle "browser" section (line 166):
```tsx
        <SectionHeader title={
          activeSection === "wishlist" ? m.wishlist_section() :
          activeSection === "browser" ? m.browser_section() :
          m.streams_section()
        } />
```

- [ ] **Step 3: Build verification**

Run: `just build-fast 2>&1 | Select-Object -Last 10`
Expected: Build succeeds (both Rust and Vite)

- [ ] **Step 4: Commit**

```
git add src/App.tsx src/components/layout/ActivityBar.tsx
git commit -m "feat(browser): integrate BrowserPanel into App and enable browser tab"
```

---

### Task 12: Update docs + implementation-phases

**Files:**
- Modify: `docs/implementation-phases.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Mark Phase 3B as complete in `implementation-phases.md`**

Update the summary table row for Phase 3B from `⬜` to `✅ Complete`.

Update the Phase 3B section heading to add `✅`.

- [ ] **Step 2: Mark Phase 3B as complete in `AGENTS.md`**

Update the Phase 3B row from `⬜ Not started` to `✅ Complete`, branch `feature/phase-3b`.

- [ ] **Step 3: Commit**

```
git add docs/implementation-phases.md AGENTS.md
git commit -m "docs: mark Phase 3B Stream Browser as complete"
```

---

### Task 13: Final build + manual test

- [ ] **Step 1: Full build**

Run: `just build-fast`
Expected: Build succeeds

- [ ] **Step 2: Run manual testing checklist**

Test the built binary (`src-tauri/target/release-fast/tapir.exe`):

1. Open "Браузер станцій" tab → popular stations load
2. Type "BBC" in search → results after 500ms debounce
3. Select country filter → results update immediately
4. Click "+" (Add) on a station → toast success, station appears in Streams tab
5. Click "+" on same station → toast error (duplicate)
6. "Завантажити ще" → more results appended
7. Tab navigation: search → filters → table → buttons
8. NVDA: aria-live announces result count
9. Clear search → return to popular stations
10. Disconnect internet → appropriate error
