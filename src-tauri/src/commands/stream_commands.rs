use crate::app_state::AppState;
use crate::errors::RadioError;
use crate::portable;
use crate::profile::{AudioFormat, Profile, StreamInfo};
use crate::stream::manager::{StreamState, StreamStatus};
use crate::stream::playlist;
use log::warn;

/// Whether a stream transfer leaves the source in place (`Copy`) or removes it
/// from the active profile (`Move`). Deserialized from the JS string "copy"/"move".
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferMode {
    Copy,
    Move,
}

/// Build the `StreamInfo` to insert into the target profile. For `Copy` it gets a
/// fresh id + `added_at` so it is a distinct entry; for `Move` the id and
/// `added_at` are preserved. Passwords/usernames/ignorelist are always kept (a
/// local transfer keeps DPAPI ciphertext valid).
fn prepare_transfer_stream(source: &StreamInfo, mode: &TransferMode, now: String) -> StreamInfo {
    let mut out = source.clone();
    if *mode == TransferMode::Copy {
        out.id = nanoid::nanoid!();
        out.added_at = now;
    }
    out
}

/// A move is blocked only while the source stream is actively recording /
/// connecting / reconnecting. An `Error`-state manager entry can linger during
/// retries but must not block a move (matches the UI's disabled condition).
fn move_blocked_by_state(state: &StreamState) -> bool {
    matches!(
        state,
        StreamState::Recording | StreamState::Connecting | StreamState::Reconnecting
    )
}

/// Result of a bulk transfer: which source ids actually landed in the target,
/// plus how many were skipped and why. `Conflict` is the only skip from the
/// insert step; recording-skips are counted by the command (move only).
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkTransferResult {
    pub transferred: Vec<String>,
    pub skipped_recording: usize,
    pub skipped_conflict: usize,
}

/// Insert each source into `target` with URL dedup. Returns (source ids that
/// landed; conflict count) or an error. `sources` are pre-filtered to the
/// eligible set (the command drops recording streams for move). `Conflict` is
/// the ONLY skip branch; any other `add_stream_checked` error propagates so a
/// future validation can't be silently mislabelled as a conflict (finding 5).
/// Pure over the profile — unit-testable without Tauri state.
pub fn insert_transfers(
    target: &mut Profile,
    sources: &[StreamInfo],
    mode: &TransferMode,
    now: &str,
) -> Result<(Vec<String>, usize), RadioError> {
    let mut transferred = Vec::new();
    let mut skipped_conflict = 0;
    for src in sources {
        let entry = prepare_transfer_stream(src, mode, now.to_string());
        match target.add_stream_checked(entry) {
            Ok(()) => transferred.push(src.id.clone()),
            Err(RadioError::Conflict(_)) => skipped_conflict += 1,
            Err(e) => return Err(e),
        }
    }
    Ok((transferred, skipped_conflict))
}

fn below_threshold(free_bytes: u64, threshold_gb: u32) -> bool {
    // cast to u64 first — u32::MAX × 1 GiB < u64::MAX, no overflow
    threshold_gb > 0 && free_bytes < (threshold_gb as u64) * 1_073_741_824
}

pub(crate) async fn check_disk_space(state: &AppState) -> Result<(), RadioError> {
    let threshold_gb = state.settings.read().await.disk_space_threshold_gb;
    if threshold_gb == 0 {
        return Ok(()); // disabled — skip the profile lock entirely
    }

    let output_dir = {
        let profile = state.active_profile.read().await;
        portable::resolve_output_dir(&profile.recording.output_dir)
    };

    let free_bytes = match tokio::task::spawn_blocking(
        move || portable::free_bytes_on_volume(&output_dir)
    ).await {
        Ok(Ok(n))  => n,
        Ok(Err(e)) => { warn!("Disk space check failed: {e}"); return Ok(()); }
        Err(e)     => { warn!("Disk space check failed: {e}"); return Ok(()); }
    };

    if below_threshold(free_bytes, threshold_gb) {
        return Err(RadioError::Other(format!(
            "Not enough disk space: free {:.1} GB, required {} GB",
            free_bytes as f64 / 1_073_741_824.0,
            threshold_gb,
        )));
    }
    Ok(())
}

#[tauri::command]
pub async fn get_streams(state: tauri::State<'_, AppState>) -> Result<Vec<StreamInfo>, String> {
    let profile = state.active_profile.read().await;
    Ok(profile.streams.clone())
}

/// Build the `StreamInfo` a manual add inserts. An explicit name that collides
/// with a stream already in the profile is suffixed once, here, using whatever
/// the Add-stream dialog's probe learned (`Radio X (AAC 64k)`, or `Radio X (2)`
/// when the probe failed and the user added anyway). No name at all means the
/// URL is stored as a placeholder — unique by construction, and replaced by the
/// ICY auto-naming on the first connection. Pure over the profile —
/// unit-testable without Tauri state.
pub fn build_added_stream(
    streams: &[StreamInfo],
    resolved_url: String,
    name: Option<String>,
    bitrate: Option<u32>,
    format: Option<AudioFormat>,
    now: String,
) -> StreamInfo {
    let requested = name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    let stream_name = match requested {
        Some(n) => {
            let meta = crate::naming::NameMeta { format: format.clone(), bitrate };
            crate::naming::disambiguate(&n, &meta, &crate::naming::taken_keys(streams, None))
        }
        None => resolved_url.clone(),
    };

    StreamInfo {
        id: nanoid::nanoid!(),
        url: resolved_url,
        name: stream_name,
        format,
        bitrate,
        icy_name: None,
        icy_genre: None,
        icy_url: None,
        ignorelist: Vec::new(),
        username: None,
        password: None,
        added_at: now,
    }
}

#[tauri::command]
pub async fn add_stream(
    url: String,
    name: Option<String>,
    bitrate: Option<u32>,
    format: Option<AudioFormat>,
    state: tauri::State<'_, AppState>,
) -> Result<StreamInfo, String> {
    let resolved_url = playlist::resolve_playlist_url(&url)
        .await
        .map_err(|e| e.to_string())?;

    let (new_stream, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let new_stream = build_added_stream(
            &profile.streams,
            resolved_url,
            name,
            bitrate,
            format,
            chrono::Local::now().to_rfc3339(),
        );
        profile.streams.push(new_stream.clone());
        (new_stream, profile.clone())
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    Ok(new_stream)
}

/// Keep only the streams whose id is in `ids`, in `streams` order (profile
/// order). Unknown ids are ignored. Shared by export / start / stop of the
/// selected subset. `pub(crate)` — `export_streams` lives in the sibling
/// `stream_io_commands` module.
pub(crate) fn select_by_ids(streams: &[StreamInfo], ids: &[String]) -> Vec<StreamInfo> {
    let want: std::collections::HashSet<&str> = ids.iter().map(String::as_str).collect();
    streams.iter().filter(|s| want.contains(s.id.as_str())).cloned().collect()
}

/// Remove every stream whose id is in `ids`. Returns how many were actually
/// removed (ignores ids not present). Pure over the vector — unit-testable
/// without any Tauri state, mirroring `prepare_transfer_stream`.
pub fn retain_streams(streams: &mut Vec<StreamInfo>, ids: &std::collections::HashSet<String>) -> usize {
    let before = streams.len();
    streams.retain(|s| !ids.contains(&s.id));
    before - streams.len()
}

#[tauri::command]
pub async fn remove_stream(
    stream_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    // 1. Stop recording first (best-effort, ignore NotFound error)
    {
        let mut manager = state.stream_manager.write().await;
        let _ = manager.stop_recording(&stream_id);
    }

    // 2. Remove from profile (snapshot while write lock is held)
    let snapshot = {
        let mut profile = state.active_profile.write().await;
        profile.streams.retain(|s| s.id != stream_id);
        profile.clone()
    };

    // 3. Save on a blocking thread to avoid starving the async worker
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Bulk variant of `remove_stream`: one stop-recordings pass, one `retain`, one
/// save. Returns the count actually removed (honest, vs an N-save frontend loop).
/// Deleting a stream that is currently recording is allowed (same as the single
/// `remove_stream`), so there is no "skipped" category for delete.
#[tauri::command]
pub async fn remove_streams(
    stream_ids: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<usize, String> {
    let ids: std::collections::HashSet<String> = stream_ids.into_iter().collect();

    // 1. Stop recordings first (best-effort; NotFound is a harmless no-op).
    {
        let mut manager = state.stream_manager.write().await;
        for id in &ids {
            let _ = manager.stop_recording(id);
        }
    }

    // 2. Retain survivors + count removed, snapshot while the write lock is held.
    let (removed, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let removed = retain_streams(&mut profile.streams, &ids);
        (removed, profile.clone())
    };

    // 3. One save on a blocking thread (don't starve the async worker).
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    Ok(removed)
}

#[tauri::command]
pub async fn update_stream(
    stream_id: String,
    name: String,
    state: tauri::State<'_, AppState>,
) -> Result<StreamInfo, String> {
    let (updated, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let stream = profile
            .streams
            .iter_mut()
            .find(|s| s.id == stream_id)
            .ok_or_else(|| format!("Stream {} not found", stream_id))?;
        stream.name = name.trim().to_string();
        let updated = stream.clone();
        let snapshot = profile.clone();
        (updated, snapshot)
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(updated)
}

#[tauri::command]
pub async fn start_recording(
    stream_id: String,
    state: tauri::State<'_, AppState>,
    _app: tauri::AppHandle,
) -> Result<(), String> {
    check_disk_space(&state).await.map_err(|e| e.to_string())?;

    let stream = {
        let profile = state.active_profile.read().await;
        profile
            .streams
            .iter()
            .find(|s| s.id == stream_id)
            .cloned()
            .ok_or_else(|| format!("Stream {} not found", stream_id))?
    };

    let settings = {
        let profile = state.active_profile.read().await;
        profile.recording.clone()
    };

    let manager_arc = state.stream_manager.clone();
    let mut manager = manager_arc.write().await;
    manager
        .start_recording(stream, settings, manager_arc.clone())
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_recording(
    stream_id: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    // §3.3: session_id читається ДО cancel — після нього запис зникає
    // з manager асинхронно, звіряти було б ні з чим
    let session_id = {
        let manager = state.stream_manager.read().await;
        manager.get_status(&stream_id).map(|s| s.session_id)
    };
    {
        let mut manager = state.stream_manager.write().await;
        manager.stop_recording(&stream_id).map_err(|e| e.to_string())?;
    }
    if let Some(session_id) = session_id {
        crate::scheduler::timer::notify_manual_stop(&app, &stream_id, session_id).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn stop_all_recordings(
    stream_ids: Option<Vec<String>>,
    app: tauri::AppHandle,
) -> Result<usize, String> {
    let set = stream_ids.map(|v| v.into_iter().collect::<std::collections::HashSet<_>>());
    Ok(crate::recording_control::stop_now(&app, set.as_ref()).await)
}

#[tauri::command]
pub async fn start_all_recordings(
    stream_ids: Option<Vec<String>>,
    state: tauri::State<'_, AppState>,
) -> Result<usize, String> {
    check_disk_space(&state).await.map_err(|e| e.to_string())?;

    let (all, settings) = {
        let profile = state.active_profile.read().await;
        (profile.streams.clone(), profile.recording.clone())
    };
    let streams = match stream_ids {
        Some(ids) => select_by_ids(&all, &ids),
        None => all,
    };

    let manager_arc = state.stream_manager.clone();
    let mut manager = manager_arc.write().await;
    Ok(manager.start_all(streams, settings, manager_arc.clone()))
}

#[tauri::command]
pub async fn get_stream_status(
    stream_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<StreamStatus, String> {
    let manager = state.stream_manager.read().await;
    manager
        .get_status(&stream_id)
        .ok_or_else(|| format!("Stream {} not found", stream_id))
}

#[tauri::command]
pub async fn get_all_statuses(state: tauri::State<'_, AppState>) -> Result<Vec<StreamStatus>, String> {
    let manager = state.stream_manager.read().await;
    Ok(manager.get_all_statuses())
}

/// Copy or move a stream into another (non-active) profile.
/// - `Copy` leaves the source in the active profile; the inserted clone gets a
///   fresh id.
/// - `Move` removes the source from the active profile after the target saves.
/// Refuses to move a stream that is currently recording/connecting/reconnecting,
/// and refuses any transfer into the active profile or into a profile that
/// already holds a stream with the same URL (`Conflict`).
#[tauri::command]
pub async fn transfer_stream_to_profile(
    stream_id: String,
    target_profile: String,
    mode: TransferMode,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    // 1. Guard: never transfer into the active profile.
    {
        let profile = state.active_profile.read().await;
        if profile.name == target_profile {
            return Err(RadioError::Forbidden(
                "Cannot transfer a stream into the active profile".into(),
            ).to_string());
        }
    }

    // 2. Find the source stream in the active profile.
    let source = {
        let profile = state.active_profile.read().await;
        profile.streams.iter().find(|s| s.id == stream_id).cloned().ok_or_else(|| {
            RadioError::NotFound(format!("Stream '{stream_id}' not found")).to_string()
        })?
    };

    // 3. Move-guard: refuse while the stream is active (matches the UI's disabled
    //    condition). An `Error`-state entry may linger during retries, so check
    //    the state rather than mere presence.
    if mode == TransferMode::Move {
        let manager = state.stream_manager.read().await;
        if let Some(status) = manager.get_status(&stream_id) {
            if move_blocked_by_state(&status.state) {
                return Err(RadioError::Forbidden(
                    "Cannot move a stream while it is active".into(),
                ).to_string());
            }
        }
    }

    // 4. Load the target profile off the async worker.
    let mut target = tokio::task::spawn_blocking(move || Profile::load(&target_profile))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    // 5. Build the entry and insert with URL dedup.
    let inserted = prepare_transfer_stream(&source, &mode, chrono::Local::now().to_rfc3339());
    target.add_stream_checked(inserted).map_err(|e| e.to_string())?;

    // 6. Save the target.
    tokio::task::spawn_blocking(move || target.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    // 7. Move only: remove from the active profile and persist (mirrors
    //    remove_stream; the stop is a harmless no-op for an idle stream).
    if mode == TransferMode::Move {
        {
            let mut manager = state.stream_manager.write().await;
            let _ = manager.stop_recording(&stream_id);
        }
        let snapshot = {
            let mut profile = state.active_profile.write().await;
            profile.streams.retain(|s| s.id != stream_id);
            profile.clone()
        };
        tokio::task::spawn_blocking(move || snapshot.save())
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Bulk variant of `transfer_stream_to_profile`. Target chosen once. Partial
/// success: for `Move`, streams in a recording-like state are skipped
/// (`skipped_recording`); a duplicate URL in the target is skipped
/// (`skipped_conflict`) for both modes. One save to the target; for `Move`, one
/// save to the active profile after removing only the transferred ids. Mirrors
/// `remove_streams` (one stop-pass, one retain, one save) and the single
/// `transfer_stream_to_profile` move branch — incl. its accepted TOCTOU window
/// (finding 3): a stream idle at eligibility may be stopped at removal if it
/// became active during the I/O window, same as single-move. One consequence of
/// that window: a stream that races from idle into recording during the I/O is
/// still counted as `transferred` (and stopped at removal), not
/// `skipped_recording`, so the summary may under-report recording-skips by one
/// in that rare race.
///
/// Failure ordering (move): the target is saved BEFORE the active profile is
/// mutated, so if the active save fails after the target save succeeded the
/// moved streams are DUPLICATED (present in both profiles), never lost. Keep
/// this order — reversing it to save the active profile first would turn a
/// partial failure into data loss.
#[tauri::command]
pub async fn transfer_streams_to_profile(
    stream_ids: Vec<String>,
    target_profile: String,
    mode: TransferMode,
    state: tauri::State<'_, AppState>,
) -> Result<BulkTransferResult, String> {
    // 1. Guard: never transfer into the active profile.
    {
        let profile = state.active_profile.read().await;
        if profile.name == target_profile {
            return Err(RadioError::Forbidden(
                "Cannot transfer a stream into the active profile".into(),
            )
            .to_string());
        }
    }

    let id_set: std::collections::HashSet<String> = stream_ids.into_iter().collect();

    // 2. Collect sources from the active profile (active-profile order).
    let sources: Vec<StreamInfo> = {
        let profile = state.active_profile.read().await;
        profile.streams.iter().filter(|s| id_set.contains(&s.id)).cloned().collect()
    };

    // 3. Move: skip recording-like streams. Copy is never blocked by state (R4:
    //    a merely-playing stream is moved; playback is not a recording state).
    let (eligible, skipped_recording): (Vec<StreamInfo>, usize) = if mode == TransferMode::Move {
        let manager = state.stream_manager.read().await;
        let mut eligible = Vec::new();
        let mut skipped = 0usize;
        for s in sources {
            let blocked = manager
                .get_status(&s.id)
                .map(|st| move_blocked_by_state(&st.state))
                .unwrap_or(false);
            if blocked { skipped += 1; } else { eligible.push(s); }
        }
        (eligible, skipped)
    } else {
        (sources, 0)
    };

    // 4. Load the target off the async worker.
    let mut target = {
        let name = target_profile.clone();
        tokio::task::spawn_blocking(move || Profile::load(&name))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?
    };

    // 5. Insert eligible with URL dedup (Conflict → skip; other → error, finding 5).
    let now = chrono::Local::now().to_rfc3339();
    let (transferred, skipped_conflict) =
        insert_transfers(&mut target, &eligible, &mode, &now).map_err(|e| e.to_string())?;

    // 6. One save to the target.
    tokio::task::spawn_blocking(move || target.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    // 7. Move only: stop + remove the transferred ids from active, one save.
    if mode == TransferMode::Move && !transferred.is_empty() {
        let removed: std::collections::HashSet<String> = transferred.iter().cloned().collect();
        {
            let mut manager = state.stream_manager.write().await;
            for id in &removed {
                let _ = manager.stop_recording(id);
            }
        }
        let snapshot = {
            let mut profile = state.active_profile.write().await;
            profile.streams.retain(|s| !removed.contains(&s.id));
            profile.clone()
        };
        tokio::task::spawn_blocking(move || snapshot.save())
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
    }

    Ok(BulkTransferResult { transferred, skipped_recording, skipped_conflict })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> StreamInfo {
        StreamInfo {
            id: "src-id".into(), url: "http://x".into(), name: "X".into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
            icy_url: None, ignorelist: vec!["*ad*".into()],
            username: Some("u".into()), password: Some("DPAPI:abc".into()),
            added_at: "2026-01-01".into(),
        }
    }

    #[test]
    fn copy_assigns_fresh_id_and_added_at_but_keeps_password() {
        let src = sample();
        let out = prepare_transfer_stream(&src, &TransferMode::Copy, "NOW".into());
        assert_ne!(out.id, src.id, "copy must get a fresh id");
        assert_eq!(out.added_at, "NOW");
        assert_eq!(out.password.as_deref(), Some("DPAPI:abc"), "password preserved");
        assert_eq!(out.url, "http://x");
        assert_eq!(out.ignorelist, vec!["*ad*".to_string()]);
    }

    #[test]
    fn move_preserves_id_and_added_at() {
        let src = sample();
        let out = prepare_transfer_stream(&src, &TransferMode::Move, "NOW".into());
        assert_eq!(out.id, "src-id");
        assert_eq!(out.added_at, "2026-01-01");
        assert_eq!(out.password.as_deref(), Some("DPAPI:abc"));
    }

    #[test]
    fn move_blocked_only_for_active_states() {
        assert!(move_blocked_by_state(&StreamState::Recording));
        assert!(move_blocked_by_state(&StreamState::Connecting));
        assert!(move_blocked_by_state(&StreamState::Reconnecting));
        assert!(!move_blocked_by_state(&StreamState::Idle));
        // An Error-state entry can linger during retries; it must NOT block a move.
        assert!(!move_blocked_by_state(&StreamState::Error));
    }

    #[test]
    fn threshold_zero_is_disabled() {
        assert!(!below_threshold(0, 0));
        assert!(!below_threshold(100, 0));
    }

    #[test]
    fn exact_threshold_is_allowed() {
        assert!(!below_threshold(1_073_741_824, 1)); // free == threshold → allowed
    }

    #[test]
    fn one_byte_under_threshold_blocks() {
        assert!(below_threshold(1_073_741_823, 1)); // one byte short → blocked
    }

    fn with_id(id: &str) -> StreamInfo {
        StreamInfo { id: id.into(), ..sample() }
    }

    #[test]
    fn retain_streams_removes_only_targeted_ids_and_counts() {
        let mut v = vec![with_id("a"), with_id("b"), with_id("c")];
        let ids: std::collections::HashSet<String> =
            ["a".to_string(), "c".to_string()].into_iter().collect();
        let removed = retain_streams(&mut v, &ids);
        assert_eq!(removed, 2);
        assert_eq!(v.iter().map(|s| s.id.clone()).collect::<Vec<_>>(), vec!["b"]);
    }

    #[test]
    fn retain_streams_ignores_unknown_ids() {
        let mut v = vec![with_id("a")];
        let ids: std::collections::HashSet<String> =
            ["does-not-exist".to_string()].into_iter().collect();
        assert_eq!(retain_streams(&mut v, &ids), 0);
        assert_eq!(v.len(), 1);
    }

    fn src(id: &str, url: &str) -> StreamInfo {
        StreamInfo { id: id.into(), url: url.into(), ..sample() }
    }

    #[test]
    fn insert_transfers_copy_assigns_fresh_ids_and_returns_source_ids() {
        let mut target = Profile::create_default();
        let sources = vec![src("a", "http://a"), src("b", "http://b")];
        let (transferred, conflicts) =
            insert_transfers(&mut target, &sources, &TransferMode::Copy, "NOW").unwrap();
        assert_eq!(transferred, vec!["a".to_string(), "b".to_string()]); // source ids, in order
        assert_eq!(conflicts, 0);
        assert_eq!(target.streams.len(), 2);
        assert!(target.streams.iter().all(|s| s.id != "a" && s.id != "b"), "copy gets fresh ids");
    }

    #[test]
    fn insert_transfers_skips_duplicate_url_as_conflict() {
        let mut target = Profile::create_default();
        target.streams.push(src("existing", "http://dup"));
        let sources = vec![src("a", "http://dup"), src("b", "http://new")];
        let (transferred, conflicts) =
            insert_transfers(&mut target, &sources, &TransferMode::Copy, "NOW").unwrap();
        assert_eq!(transferred, vec!["b".to_string()]);
        assert_eq!(conflicts, 1);
        assert_eq!(target.streams.len(), 2); // existing + b only
    }

    #[test]
    fn insert_transfers_move_preserves_source_id() {
        let mut target = Profile::create_default();
        let sources = vec![src("keep-id", "http://a")];
        let (transferred, _) =
            insert_transfers(&mut target, &sources, &TransferMode::Move, "NOW").unwrap();
        assert_eq!(transferred, vec!["keep-id".to_string()]);
        assert_eq!(target.streams[0].id, "keep-id"); // move keeps id
    }

    #[test]
    fn select_by_ids_keeps_profile_order_and_ignores_unknown() {
        let all = vec![with_id("a"), with_id("b"), with_id("c")];
        let ids = vec!["c".to_string(), "a".to_string(), "zzz".to_string()];
        let got = select_by_ids(&all, &ids);
        // profile order (a before c), unknown id dropped
        assert_eq!(got.iter().map(|s| s.id.clone()).collect::<Vec<_>>(), vec!["a", "c"]);
    }

    #[test]
    fn select_by_ids_empty_ids_yields_empty() {
        let all = vec![with_id("a")];
        assert!(select_by_ids(&all, &[]).is_empty());
    }

    fn named(id: &str, name: &str) -> StreamInfo {
        StreamInfo { id: id.into(), name: name.into(), url: format!("http://{id}"), ..sample() }
    }

    #[test]
    fn added_stream_keeps_a_free_name_and_persists_probe_metadata() {
        let existing = vec![named("a", "Other")];
        let got = build_added_stream(
            &existing,
            "http://new".into(),
            Some("  Radio X  ".into()),
            Some(64),
            Some(AudioFormat::Aac),
            "NOW".into(),
        );
        assert_eq!(got.name, "Radio X"); // trimmed, unsuffixed
        assert_eq!(got.url, "http://new");
        assert_eq!(got.bitrate, Some(64));
        assert_eq!(got.format, Some(AudioFormat::Aac));
        assert_eq!(got.added_at, "NOW");
    }

    #[test]
    fn added_stream_suffixes_a_colliding_name_from_probe_metadata() {
        let existing = vec![named("a", "Radio X")];
        let got = build_added_stream(
            &existing,
            "http://new".into(),
            Some("Radio X".into()),
            Some(64),
            Some(AudioFormat::Aac),
            "NOW".into(),
        );
        assert_eq!(got.name, "Radio X (AAC 64k)");
    }

    #[test]
    fn added_stream_falls_back_to_an_ordinal_when_the_probe_failed() {
        let existing = vec![named("a", "Radio X")];
        let got = build_added_stream(
            &existing,
            "http://new".into(),
            Some("Radio X".into()),
            None,
            None,
            "NOW".into(),
        );
        assert_eq!(got.name, "Radio X (2)");
    }

    #[test]
    fn added_stream_without_a_name_stores_the_url_and_is_never_suffixed() {
        // No name -> the URL is the placeholder; ICY auto-naming replaces it on
        // the first connection. A URL is unique already, so no suffix.
        let existing = vec![named("a", "Radio X")];
        let got = build_added_stream(&existing, "http://new".into(), None, None, None, "NOW".into());
        assert_eq!(got.name, "http://new");
    }

    #[test]
    fn added_stream_treats_a_blank_name_as_no_name() {
        let got =
            build_added_stream(&[], "http://new".into(), Some("   ".into()), None, None, "NOW".into());
        assert_eq!(got.name, "http://new");
    }
}
