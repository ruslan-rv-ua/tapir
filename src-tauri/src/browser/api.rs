use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};
use reqwest::Client;
use serde::de::DeserializeOwned;
use tokio::sync::RwLock;
use log::warn;

use crate::errors::RadioError;
use super::types::*;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const FILTER_CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_RETRIES: usize = 3;
const DEFAULT_SERVERS: &[&str] = &["de1.api.radio-browser.info", "de2.api.radio-browser.info", "nl1.api.radio-browser.info"];

fn build_url(server: &str, path: &str, query: &[(String, String)]) -> Result<String, RadioError> {
    let base = format!("https://{server}{path}");
    let mut url = reqwest::Url::parse(&base).map_err(|e| RadioError::BrowserApi(e.to_string()))?;
    {
        let mut pairs = url.query_pairs_mut();
        for (k, v) in query {
            pairs.append_pair(k, v);
        }
    }
    Ok(url.into())
}

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

        if let Some(ref q) = params.query && !q.is_empty() {
            query.push(("name".into(), q.clone()));
        }
        if let Some(ref c) = params.country && !c.is_empty() {
            query.push(("country".into(), c.clone()));
        }
        if let Some(ref lang) = params.language && !lang.is_empty() {
            query.push(("language".into(), lang.clone()));
        }
        if let Some(ref codec) = params.codec && !codec.is_empty() {
            query.push(("codec".into(), codec.clone()));
        }
        if let Some(br) = params.min_bitrate && br > 0 {
            query.push(("bitrateMin".into(), br.to_string()));
        }

        self.get_json("/json/stations/search", &query).await
    }

    /// Get filter lists (countries, codecs, languages, tags). Cached for 24h.
    pub async fn get_filters(&self) -> Result<BrowserFilters, RadioError> {
        // Check cache
        {
            let cache = self.filters_cache.read().await;
            if let Some((ref filters, ref instant)) = *cache
                && instant.elapsed() < FILTER_CACHE_TTL
            {
                return Ok(filters.clone());
            }
        }

        let countries_q: Vec<(String, String)> = vec![("order".into(), "stationcount".into()), ("reverse".into(), "true".into()), ("limit".into(), "250".into())];
        let codecs_q: Vec<(String, String)> = vec![("order".into(), "stationcount".into()), ("reverse".into(), "true".into())];
        let languages_q: Vec<(String, String)> = vec![("order".into(), "stationcount".into()), ("reverse".into(), "true".into()), ("limit".into(), "100".into())];
        let tags_q: Vec<(String, String)> = vec![("order".into(), "stationcount".into()), ("reverse".into(), "true".into()), ("limit".into(), "100".into())];

        // Fetch all filter lists in parallel
        let (countries, codecs, languages, tags) = tokio::join!(
            self.get_json::<Vec<FilterItem>>("/json/countries", &countries_q),
            self.get_json::<Vec<FilterItem>>("/json/codecs", &codecs_q),
            self.get_json::<Vec<FilterItem>>("/json/languages", &languages_q),
            self.get_json::<Vec<FilterItem>>("/json/tags", &tags_q),
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
            let url = build_url(server, path, query)?;

            match self.client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    let result: T = resp.json().await.map_err(|e| RadioError::BrowserApi(e.to_string()))?;
                    return Ok(result);
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
