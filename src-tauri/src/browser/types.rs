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

/// Елемент списку фільтрів (країна/кодек/мова/тег).
///
/// `rename_all` стоїть, хоч сьогодні всі ключі однослівні й правило для них —
/// тотожність: без нього перше поле з `_` мовчки роз'їхалось би з ручним типом
/// у `src/lib/tauri.ts` (`tauri-ts-type-drift`, рядок 11). Ця ж структура
/// **читається** з відповіді Radio Browser API (`browser/api.rs`), тому таке
/// поле водночас потребуватиме `#[serde(alias = …)]` під ключ API — рівно як
/// це вже зроблено в `StationResult` нижче.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterItem {
    pub name: String,
    #[serde(default)]
    pub stationcount: u32,
}

/// Набір усіх фільтрів для UI. Кешується у RadioBrowserClient.
/// Про `rename_all` — див. [`FilterItem`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    #[allow(dead_code)]
    pub ip: String,
}
