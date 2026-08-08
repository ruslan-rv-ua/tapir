use futures::StreamExt;
use tauri::Emitter;
use log::warn;

use crate::app_state::AppState;
use crate::browser::api::RadioBrowserClient;
use crate::browser::types::*;
use crate::errors::RadioError;
use crate::profile::{AudioFormat, StreamInfo};
use crate::store::Commit;

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

/// One curated, non-commercial "anchor" station. The pool order guarantees the
/// soft requirement "one Ukrainian first" when it resolves. The live API path
/// takes a fresh `url_resolved`; `fallback_*` is the offline last resort.
struct ExampleAnchor {
    name_query: &'static str,
    country: Option<&'static str>,
    fallback_url: &'static str,
    fallback_name: &'static str,
    fallback_codec: &'static str, // "MP3" | "AAC"
    fallback_bitrate: u32,
}

/// Fixed pool of 3 anchors. #1 is Ukrainian (Suspilne UR-2 "Промінь");
/// #2 SomaFM (listener-supported); #3 FIP (Radio France, public).
/// Fallback URLs verified against docs/testing/test-streams.md and ukr.radio/maps.
const EXAMPLE_ANCHORS: &[ExampleAnchor] = &[
    ExampleAnchor {
        name_query: "Промінь",
        country: Some("Ukraine"),
        fallback_url: "https://radio.ukr.radio/ur2-mp3",
        fallback_name: "Радіо Промінь (UR-2)",
        fallback_codec: "MP3",
        fallback_bitrate: 192,
    },
    ExampleAnchor {
        name_query: "Groove Salad",
        country: None,
        fallback_url: "https://ice5.somafm.com/groovesalad-128-mp3",
        fallback_name: "SomaFM Groove Salad",
        fallback_codec: "MP3",
        fallback_bitrate: 128,
    },
    ExampleAnchor {
        name_query: "FIP",
        country: Some("France"),
        // Radio France's icecast endpoint is HTTP-only (no HTTPS on port 80 for AAC)
        fallback_url: "http://icecast.radiofrance.fr/fip-hifi.aac",
        fallback_name: "FIP",
        fallback_codec: "AAC",
        fallback_bitrate: 192,
    },
];

/// Codec string -> AudioFormat. Single source of truth shared by the browser-add
/// path and the example fallback path (keeps add_station_from_browser behavior).
fn codec_to_format(codec: &str) -> Option<AudioFormat> {
    match codec.to_uppercase().as_str() {
        "MP3" => Some(AudioFormat::Mp3),
        "AAC" | "AAC+" => Some(AudioFormat::Aac),
        _ => None,
    }
}

/// Build a StreamInfo from a Radio Browser station. Extracted verbatim from the
/// original add_station_from_browser body so both commands share it.
fn station_to_stream_info(station: &StationResult) -> StreamInfo {
    let url = if station.url_resolved.is_empty() {
        station.url.clone()
    } else {
        station.url_resolved.clone()
    };
    StreamInfo {
        id: nanoid::nanoid!(),
        url,
        name: station.name.trim().to_string(),
        format: codec_to_format(&station.codec),
        bitrate: if station.bitrate > 0 { Some(station.bitrate) } else { None },
        icy_name: None,
        icy_genre: if station.tags.is_empty() { None } else { Some(station.tags.clone()) },
        icy_url: if station.homepage.is_empty() { None } else { Some(station.homepage.clone()) },
        ignorelist: vec![],
        username: None,
        password: None,
        added_at: chrono::Local::now().to_rfc3339(),
    }
}

/// Build a StreamInfo straight from an anchor's offline fallback fields.
/// StationResult has no Default, so we synthesize the StreamInfo directly.
fn fallback_to_stream_info(anchor: &ExampleAnchor) -> StreamInfo {
    StreamInfo {
        id: nanoid::nanoid!(),
        url: anchor.fallback_url.to_string(),
        name: anchor.fallback_name.to_string(),
        format: codec_to_format(anchor.fallback_codec),
        bitrate: if anchor.fallback_bitrate > 0 { Some(anchor.fallback_bitrate) } else { None },
        icy_name: None,
        icy_genre: None,
        icy_url: None,
        ignorelist: vec![],
        username: None,
        password: None,
        added_at: chrono::Local::now().to_rfc3339(),
    }
}

/// Pure selection: for each anchor (in order) take the first result with a
/// non-empty url_resolved, else build its fallback; dedup by url within the batch.
fn select_example_stations(
    anchors: &[ExampleAnchor],
    results_per_anchor: &[Vec<StationResult>],
) -> Vec<StreamInfo> {
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut out: Vec<StreamInfo> = Vec::new();
    for (anchor, results) in anchors.iter().zip(results_per_anchor.iter()) {
        let info = match results.iter().find(|s| !s.url_resolved.is_empty()) {
            Some(s) => station_to_stream_info(s),
            None => fallback_to_stream_info(anchor),
        };
        if seen.insert(info.url.clone()) {
            out.push(info);
        }
    }
    out
}

/// Pure: keep only streams whose url is neither already in `existing` nor a
/// duplicate within `incoming`. Used by append_streams_to_active_profile and the
/// add_station_from_browser duplicate contract.
fn dedup_new_streams(existing: &[StreamInfo], incoming: Vec<StreamInfo>) -> Vec<StreamInfo> {
    let mut seen: std::collections::HashSet<String> =
        existing.iter().map(|s| s.url.clone()).collect();
    let mut out = Vec::new();
    for stream in incoming {
        if seen.insert(stream.url.clone()) {
            out.push(stream);
        }
    }
    out
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

/// Everything `append_streams_to_active_profile` decides while holding the
/// profile lock: drop urls already present (and duplicates inside the batch),
/// then name the survivors apart from the profile AND from each other. Radio
/// Browser lists every mountpoint of a station under one identical name, so a
/// bulk add is the likeliest source of same-name pairs. Pure over the profile —
/// unit-testable without Tauri state.
fn plan_appended(existing: &[StreamInfo], incoming: Vec<StreamInfo>) -> Vec<StreamInfo> {
    let mut added = dedup_new_streams(existing, incoming);
    let mut taken = crate::naming::taken_keys(existing.iter(), None);
    crate::naming::disambiguate_batch(&mut added, &mut taken);
    added
}

/// Append new streams to the active profile in one atomic save+emit.
/// `plan_appended` does the url-dedup and the naming. Returns only the streams
/// actually added, with their final names. If nothing is added, skips the
/// save/emit and returns empty.
async fn append_streams_to_active_profile(
    state: &AppState,
    app: &tauri::AppHandle,
    streams: Vec<StreamInfo>,
) -> Result<Vec<StreamInfo>, String> {
    let added = state
        .commit_profile(|profile| {
            let added = plan_appended(&profile.streams, streams);
            // Усі URL — дублікати: додавати нема чого, писати теж.
            if added.is_empty() {
                return Commit::Skip(added);
            }
            for s in &added {
                profile.streams.push(s.clone());
            }
            Commit::Save(added)
        })
        .await
        .map_err(|e| e.to_string())?;

    if added.is_empty() {
        return Ok(added);
    }
    app.emit("streams-changed", ()).ok();
    Ok(added)
}

/// Payload of `browser-station-probe-result`. Emitted ONLY when at least one
/// stream failed: a fully reachable batch stays silent so bulk adds don't flood
/// NVDA with success chatter.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserProbeSummary {
    /// How many streams were checked (the whole batch, not just the failures).
    pub checked: usize,
    /// Names of the streams that did not respond, in completion order.
    pub failed: Vec<String>,
}

/// Probe the just-added streams in the background and emit one summary event.
/// Detached on purpose: the add has already been persisted, so the check must
/// never delay the command nor undo anything — a stream that fails stays in the
/// profile (Radio Browser's `lastcheckok` is stale often enough that a probe
/// failure is a hint, not a verdict) and the user is merely told.
fn spawn_probe_added(app: tauri::AppHandle, added: &[StreamInfo]) {
    if added.is_empty() {
        return;
    }
    let targets: Vec<(String, String)> =
        added.iter().map(|s| (s.name.clone(), s.url.clone())).collect();

    tokio::spawn(async move {
        let checked = targets.len();
        let failed: Vec<String> = futures::stream::iter(targets.into_iter().map(
            |(name, url)| async move {
                let verdict = crate::commands::stream_io_commands::probe_once(&url).await;
                if verdict.ok { None } else { Some(name) }
            },
        ))
        .buffer_unordered(crate::commands::stream_io_commands::PROBE_CONCURRENCY)
        .filter_map(|failed_name| async move { failed_name })
        .collect()
        .await;

        if !failed.is_empty() {
            app.emit("browser-station-probe-result", BrowserProbeSummary { checked, failed }).ok();
        }
    });
}

#[tauri::command]
pub async fn add_station_from_browser(
    station: StationResult,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<StreamInfo, String> {
    let stream_info = station_to_stream_info(&station);
    let added = append_streams_to_active_profile(&state, &app, vec![stream_info]).await?;
    spawn_probe_added(app.clone(), &added);
    // Preserve the original contract: a duplicate url => DuplicateStream error,
    // not a silent Ok. The shared helper drops duplicates, so empty => duplicate.
    added
        .into_iter()
        .next()
        .map(Ok)
        .unwrap_or_else(|| Err(RadioError::DuplicateStream.to_string()))
}

/// Bulk variant of `add_station_from_browser`: build a StreamInfo per station and
/// append in ONE save+emit via the shared helper (dedups by url, both against the
/// profile and within the batch). Returns the streams actually added; the
/// frontend computes skipped = requested − added. Unlike the single command this
/// returns the (possibly empty) added list instead of erroring on duplicates.
#[tauri::command]
pub async fn add_stations_from_browser(
    stations: Vec<StationResult>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<StreamInfo>, String> {
    let streams: Vec<StreamInfo> = stations.iter().map(station_to_stream_info).collect();
    let added = append_streams_to_active_profile(state.inner(), &app, streams).await?;
    spawn_probe_added(app.clone(), &added);
    Ok(added)
}

/// Curate up to 3 example stations into the active (empty) profile. Resolves
/// fresh urls via the Radio Browser client per anchor; on any search failure or
/// empty result the anchor's offline fallback is used (so offline still adds the
/// fallback trio). The only error path is a profile save failure.
#[tauri::command]
pub async fn add_example_streams(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<StreamInfo>, String> {
    let client = get_client(&state).await;

    let mut results_per_anchor: Vec<Vec<StationResult>> =
        Vec::with_capacity(EXAMPLE_ANCHORS.len());
    for anchor in EXAMPLE_ANCHORS {
        let params = SearchParams {
            query: Some(anchor.name_query.to_string()),
            country: anchor.country.map(str::to_string),
            limit: Some(5),
            ..Default::default()
        };
        // A search error is not fatal: empty results -> the anchor's fallback.
        let results = client.search_stations(&params).await.unwrap_or_default();
        results_per_anchor.push(results);
    }

    let streams = select_example_stations(EXAMPLE_ANCHORS, &results_per_anchor);
    append_streams_to_active_profile(state.inner(), &app, streams).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk_station(name: &str, url_resolved: &str, codec: &str, bitrate: u32) -> StationResult {
        StationResult {
            stationuuid: "uuid".into(),
            name: name.into(),
            url: format!("{url_resolved}/raw"),
            url_resolved: url_resolved.into(),
            codec: codec.into(),
            bitrate,
            country: String::new(),
            countrycode: String::new(),
            tags: String::new(),
            language: String::new(),
            votes: 0,
            clickcount: 0,
            has_extended_info: None,
            homepage: String::new(),
            lastcheckok: 1,
        }
    }

    fn stream(url: &str) -> StreamInfo {
        StreamInfo {
            id: "id".into(),
            url: url.into(),
            name: "n".into(),
            format: None,
            bitrate: None,
            icy_name: None,
            icy_genre: None,
            icy_url: None,
            ignorelist: vec![],
            username: None,
            password: None,
            added_at: "2026-01-01".into(),
        }
    }

    #[test]
    fn station_to_stream_info_maps_mp3_and_metadata() {
        let mut s = mk_station("  Groove Salad  ", "https://soma/gs", "MP3", 128);
        s.tags = "ambient".into();
        s.homepage = "https://somafm.com".into();
        let info = station_to_stream_info(&s);
        assert_eq!(info.url, "https://soma/gs");
        assert_eq!(info.name, "Groove Salad"); // trimmed
        assert_eq!(info.format, Some(AudioFormat::Mp3));
        assert_eq!(info.bitrate, Some(128));
        assert_eq!(info.icy_genre.as_deref(), Some("ambient"));
        assert_eq!(info.icy_url.as_deref(), Some("https://somafm.com"));
    }

    #[test]
    fn station_to_stream_info_maps_aac_zero_bitrate_and_empty_meta() {
        let s = mk_station("FIP", "https://fip", "AAC+", 0);
        let info = station_to_stream_info(&s);
        assert_eq!(info.format, Some(AudioFormat::Aac));
        assert_eq!(info.bitrate, None); // 0 -> None
        assert_eq!(info.icy_genre, None); // empty tags
        assert_eq!(info.icy_url, None); // empty homepage
    }

    #[test]
    fn station_to_stream_info_unknown_codec_and_url_fallback() {
        let mut s = mk_station("X", "", "OGG", 96);
        s.url = "https://raw-only".into();
        let info = station_to_stream_info(&s);
        assert_eq!(info.format, None); // unknown codec
        assert_eq!(info.url, "https://raw-only"); // url_resolved empty -> url
    }

    #[test]
    fn select_picks_first_resolved_keeping_anchor_order_ua_first() {
        let results = vec![
            vec![mk_station("Промінь", "https://ua", "MP3", 192)],
            vec![mk_station("Groove Salad", "https://soma", "MP3", 128)],
            vec![mk_station("FIP", "https://fip", "AAC", 192)],
        ];
        let out = select_example_stations(EXAMPLE_ANCHORS, &results);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].url, "https://ua"); // UA anchor first
        assert_eq!(out[1].url, "https://soma");
        assert_eq!(out[2].url, "https://fip");
    }

    #[test]
    fn select_uses_fallback_for_empty_anchor_result() {
        let results = vec![
            vec![], // anchor 0 (UA) found nothing -> fallback
            vec![mk_station("Groove Salad", "https://soma", "MP3", 128)],
            vec![mk_station("FIP", "https://fip", "AAC", 192)],
        ];
        let out = select_example_stations(EXAMPLE_ANCHORS, &results);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].url, EXAMPLE_ANCHORS[0].fallback_url);
        assert_eq!(out[1].url, "https://soma");
    }

    #[test]
    fn select_all_offline_yields_three_fallbacks() {
        let results = vec![vec![], vec![], vec![]];
        let out = select_example_stations(EXAMPLE_ANCHORS, &results);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].url, EXAMPLE_ANCHORS[0].fallback_url);
        assert_eq!(out[1].url, EXAMPLE_ANCHORS[1].fallback_url);
        assert_eq!(out[2].url, EXAMPLE_ANCHORS[2].fallback_url);
    }

    #[test]
    fn select_dedups_by_url_within_batch() {
        let results = vec![
            vec![mk_station("a", "https://same", "MP3", 128)],
            vec![mk_station("b", "https://same", "MP3", 128)], // duplicate url
            vec![mk_station("c", "https://other", "AAC", 192)],
        ];
        let out = select_example_stations(EXAMPLE_ANCHORS, &results);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].url, "https://same");
        assert_eq!(out[1].url, "https://other");
    }

    #[test]
    fn select_uses_fallback_when_all_results_have_empty_url_resolved() {
        // API returned stations but none has a valid url_resolved (malformed response)
        // -> must still use the anchor's offline fallback
        let bad = mk_station("Промінь", "", "MP3", 192); // url_resolved is empty
        let results = vec![vec![bad], vec![], vec![]];
        let out = select_example_stations(EXAMPLE_ANCHORS, &results);
        assert_eq!(out[0].url, EXAMPLE_ANCHORS[0].fallback_url);
    }

    #[test]
    fn dedup_filters_urls_already_in_profile() {
        let existing = [stream("https://dup")];
        let added = dedup_new_streams(&existing, vec![stream("https://dup"), stream("https://new")]);
        assert_eq!(added.len(), 1);
        assert_eq!(added[0].url, "https://new");
    }

    #[test]
    fn dedup_collapses_internal_duplicates() {
        let added = dedup_new_streams(&[], vec![stream("https://x"), stream("https://x")]);
        assert_eq!(added.len(), 1);
    }

    fn named_stream(url: &str, name: &str, codec: &str, bitrate: u32) -> StreamInfo {
        StreamInfo {
            name: name.into(),
            format: codec_to_format(codec),
            bitrate: if bitrate > 0 { Some(bitrate) } else { None },
            ..stream(url)
        }
    }

    #[test]
    fn browser_add_suffixes_against_the_profile() {
        let existing = vec![named_stream("https://old", "BBC 6", "MP3", 128)];
        let added = plan_appended(&existing, vec![named_stream("https://new", "BBC 6", "AAC", 48)]);
        assert_eq!(added[0].name, "BBC 6 (AAC 48k)");
    }

    #[test]
    fn browser_bulk_add_distinguishes_mountpoints_within_one_batch() {
        // The Radio Browser case: six identically named variants of one station.
        let incoming = vec![
            named_stream("https://a", "BBC 6", "AAC", 48),
            named_stream("https://b", "BBC 6", "MP3", 128),
            named_stream("https://c", "BBC 6", "AAC", 48), // identical metadata
        ];
        let added = plan_appended(&[], incoming);
        assert_eq!(added[0].name, "BBC 6");
        assert_eq!(added[1].name, "BBC 6 (MP3 128k)");
        assert_eq!(added[2].name, "BBC 6 (AAC 48k)");
    }

    #[test]
    fn browser_add_leaves_a_distinct_name_alone() {
        let existing = vec![named_stream("https://old", "Groove Salad", "MP3", 128)];
        let added = plan_appended(&existing, vec![named_stream("https://new", "FIP", "AAC", 192)]);
        assert_eq!(added[0].name, "FIP");
    }

    #[test]
    fn browser_add_does_not_burn_a_name_on_a_url_that_is_dropped() {
        // https://old is already in the profile, so it never reaches the naming
        // step and must not push the fresh entry to a suffix.
        let existing = vec![named_stream("https://old", "Other", "MP3", 128)];
        let added = plan_appended(
            &existing,
            vec![
                named_stream("https://old", "Dropped", "MP3", 128),
                named_stream("https://new", "FIP", "AAC", 192),
            ],
        );
        assert_eq!(added.len(), 1);
        assert_eq!(added[0].name, "FIP");
    }

    #[test]
    fn batch_maps_stations_and_dedups_within_selection() {
        // station_to_stream_info is already covered; assert the batch builder dedups
        // two stations that resolve to the same url down to one StreamInfo.
        let a = mk_station("A", "https://same", "MP3", 128);
        let b = mk_station("B", "https://same", "MP3", 128);
        let built: Vec<StreamInfo> = [&a, &b].iter().map(|s| station_to_stream_info(s)).collect();
        let added = dedup_new_streams(&[], built);
        assert_eq!(added.len(), 1);
    }
}
