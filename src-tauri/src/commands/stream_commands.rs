use crate::app_state::AppState;
use crate::commands::shell_open::{shell_open, SHELL_ERR_GENERIC, SHELL_ERR_WRITE_FAILED};
use crate::errors::RadioError;
use crate::portable;
use crate::profile::{AudioFormat, Profile, StreamInfo};
use crate::profile_store::save_detached;
use crate::store::Commit;
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

/// Where the throwaway playlist for `name` is written: `data/tmp/<name>.m3u8`.
/// The name is stable per stream and the file is rewritten before every open, so
/// there is neither a race with a cold-starting player nor anything to delete
/// afterwards (startup clears `data/tmp/`). Two streams colliding on a sanitized
/// name is harmless — the contents are regenerated for whichever one is opened.
fn stream_playlist_path(name: &str) -> std::path::PathBuf {
    portable::tmp_dir().join(format!("{}.m3u8", crate::sanitize::sanitize_component(name)))
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

/// Open the stream in whatever app Windows associates with playlists — VLC, WMP,
/// foobar. The URL itself cannot be handed to the shell: profiles store the
/// resolved audio URL (`add_stream` unwraps .pls/.m3u/.m3u8), and the only
/// association for `http(s)://…/live` is the default browser. A one-entry
/// `.m3u8` restores the playlist association, and `#EXTINF` carries the station
/// name into the player's title bar, where the screen reader reads it.
///
/// Takes a `stream_id` rather than a ready URL so the renderer never dictates
/// what goes into the playlist: the entry comes from the profile, where the
/// http(s)-only invariant is enforced on the way in (`add_stream` via
/// `resolve_playlist_url`, import via `validate_stream_url`).
#[tauri::command]
pub async fn open_stream_in_app(
    stream_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let stream = {
        let profile = state.active_profile.read().await;
        profile
            .streams
            .iter()
            .find(|s| s.id == stream_id)
            .cloned()
            // An unknown id from our own UI is our bug, not a user situation —
            // no dedicated code for it.
            .ok_or_else(|| SHELL_ERR_GENERIC.to_string())?
    };
    tokio::task::spawn_blocking(move || {
        let path = stream_playlist_path(&stream.name);
        std::fs::write(&path, playlist::to_m3u8(std::slice::from_ref(&stream))).map_err(|e| {
            warn!("Could not write {}: {e}", path.display());
            SHELL_ERR_WRITE_FAILED.to_string()
        })?;
        shell_open(&path.to_string_lossy())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_streams(state: tauri::State<'_, AppState>) -> Result<Vec<StreamInfo>, String> {
    let profile = state.active_profile.read().await;
    Ok(profile.streams.clone())
}

fn non_blank(value: Option<String>) -> Option<String> {
    value.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

/// Build the `StreamInfo` a manual add inserts, from what the Add-stream
/// dialog's probe learned about the URL.
///
/// The name is, in order of preference: what the user typed, the station's own
/// `icy_name`, or the URL as a last-resort placeholder. Auto-naming happens
/// here rather than on the first connection so the list never holds a row that
/// reads out as a URL. Either way the chosen name is disambiguated once, now
/// (`Radio X (AAC 64k)`, or `Radio X (2)` when the probe failed and the user
/// added anyway); a URL placeholder needs no suffix, being unique already.
///
/// `icy_name` is stored whenever the probe reported one, even when the user
/// typed their own name — that is what makes "use the official name" available
/// before the stream has ever connected. Pure over the profile — unit-testable
/// without Tauri state.
pub fn build_added_stream(
    streams: &[StreamInfo],
    resolved_url: String,
    name: Option<String>,
    icy_name: Option<String>,
    bitrate: Option<u32>,
    format: Option<AudioFormat>,
    now: String,
) -> StreamInfo {
    let icy_name = non_blank(icy_name);
    let stream_name = match non_blank(name).or_else(|| icy_name.clone()) {
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
        icy_name,
        icy_genre: None,
        icy_url: None,
        ignorelist: Vec::new(),
        username: None,
        password: None,
        added_at: now,
    }
}

/// Apply an edit from the Add/Edit-stream dialog to an existing stream. The
/// mirror image of [`build_added_stream`]: same argument shape, pure over the
/// profile so it is unit-testable without Tauri state. One difference, and it is
/// deliberate — a name the user typed is stored as typed, never disambiguated.
/// The dialog already warned about the collision and the user confirmed; a
/// silent suffix on top of that would overrule them.
///
/// `resolved_url` is the whole switch:
///
/// * `None` — a plain rename. Only `name.trim()` lands; `format` / `bitrate` /
///   `icy_name` stay exactly as they were.
/// * `Some` — the address moved. All three derived fields are overwritten with
///   what the probe reported, **including `None`**: they describe the URL, not
///   the row, so after a move the old "AAC 64k" and the old station name are
///   lies a screen reader would read out. `None` is an honest interim value the
///   first connection refills from the ICY headers.
///
/// The name is never rewritten behind the user's back — except for the stream
/// that has no human name yet. `add_stream` marks that case by storing the URL
/// as the name, and `naming::icy_rename` recognises it by exactly that equality;
/// leaving a stale URL there would freeze the name as a dead address forever,
/// because auto-renaming on connect could never fire again. So an unnamed
/// stream takes the same step `build_added_stream` takes: the probed station
/// name, disambiguated against its siblings, or else the new URL.
pub fn build_edited_stream(
    streams: &[StreamInfo],
    current: &StreamInfo,
    name: String,
    resolved_url: Option<String>,
    icy_name: Option<String>,
    bitrate: Option<u32>,
    format: Option<AudioFormat>,
) -> StreamInfo {
    let mut out = current.clone();

    let Some(resolved_url) = resolved_url else {
        out.name = name.trim().to_string();
        return out;
    };

    let icy_name = non_blank(icy_name);
    // Blank, or still equal to the address it was standing in for: either way
    // the user has not named this stream. Blank is folded in deliberately —
    // storing an empty name would leave a row a screen reader reads as nothing,
    // and a `%s` folder with no name; the ladder below always ends somewhere.
    let typed = non_blank(Some(name)).filter(|n| *n != current.url);
    out.name = match typed {
        Some(n) => n,
        // Auto-naming from the probe — disambiguated, exactly as on add.
        None => match icy_name.clone() {
            Some(n) => {
                let meta = crate::naming::NameMeta { format: format.clone(), bitrate };
                crate::naming::disambiguate(
                    &n,
                    &meta,
                    &crate::naming::taken_keys(streams, Some(&current.id)),
                )
            }
            None => resolved_url.clone(),
        },
    };

    out.url = resolved_url;
    out.icy_name = icy_name;
    out.bitrate = bitrate;
    out.format = format;
    out
}

/// What the Add/Edit-stream dialog warns about before saving. Both are
/// warnings, never bans: the URL is the stream's identity, but a user may
/// legitimately want the same URL twice (different credentials, different
/// ignorelist), and an explicit rename onto an existing name is the user's
/// call — we only say the recordings will share a folder.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamConflicts {
    /// Name of the stream already holding this URL.
    pub duplicate_url_of: Option<String>,
    /// Name of the stream whose `%s` recording folder this name would share.
    pub name_collides_with: Option<String>,
}

/// Pure core of `check_stream_conflicts`. `exclude_id` is the stream being
/// edited, so it never conflicts with itself.
pub fn find_conflicts(
    streams: &[StreamInfo],
    url: Option<&str>,
    name: Option<&str>,
    exclude_id: Option<&str>,
) -> StreamConflicts {
    let others = || streams.iter().filter(|s| Some(s.id.as_str()) != exclude_id);

    let duplicate_url_of = url.and_then(|u| others().find(|s| s.url == u).map(|s| s.name.clone()));

    let name_collides_with = name
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .and_then(|n| {
            let key = crate::naming::collision_key(n);
            others()
                .find(|s| crate::naming::collision_key(&s.name) == key)
                .map(|s| s.name.clone())
        });

    StreamConflicts { duplicate_url_of, name_collides_with }
}

/// Pre-flight for the Add/Edit-stream dialog. Every argument is optional and
/// the dialog sends whichever apply: `url` whenever the address is new (resolved
/// first, so a `.pls` pointing at an already-known stream is caught), `name` +
/// `exclude_id` whenever an existing stream is being edited — an address move
/// that also renames sends all three. A URL that fails to resolve is compared as
/// typed; the save itself will surface the real error.
#[tauri::command]
pub async fn check_stream_conflicts(
    url: Option<String>,
    name: Option<String>,
    exclude_id: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<StreamConflicts, String> {
    let resolved = match url {
        Some(u) => Some(playlist::resolve_playlist_url(&u).await.unwrap_or(u)),
        None => None,
    };
    let profile = state.active_profile.read().await;
    Ok(find_conflicts(
        &profile.streams,
        resolved.as_deref(),
        name.as_deref(),
        exclude_id.as_deref(),
    ))
}

#[tauri::command]
pub async fn add_stream(
    url: String,
    name: Option<String>,
    icy_name: Option<String>,
    bitrate: Option<u32>,
    format: Option<AudioFormat>,
    state: tauri::State<'_, AppState>,
) -> Result<StreamInfo, String> {
    let resolved_url = playlist::resolve_playlist_url(&url)
        .await
        .map_err(|e| e.to_string())?;

    state
        .commit_profile(|profile| {
            let new_stream = build_added_stream(
                &profile.streams,
                resolved_url,
                name,
                icy_name,
                bitrate,
                format,
                chrono::Local::now().to_rfc3339(),
            );
            profile.streams.push(new_stream.clone());
            Commit::Save(new_stream)
        })
        .await
        .map_err(|e| e.to_string())
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

    // 2. Remove from profile and persist
    state
        .commit_profile(|profile| {
            profile.streams.retain(|s| s.id != stream_id);
            Commit::Save(())
        })
        .await
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
    // 3. One commit for the whole batch.
    let removed = state
        .commit_profile(|profile| Commit::Save(retain_streams(&mut profile.streams, &ids)))
        .await
        .map_err(|e| e.to_string())?;

    Ok(removed)
}

/// Save the Add/Edit-stream dialog's edit of an existing stream. Argument shape
/// mirrors `add_stream`; `url` is what decides between a plain rename and a full
/// move (see [`build_edited_stream`]). Name and address travel in one call
/// deliberately: two commands would mean two saves with a half-applied edit
/// possible in between.
///
/// Recording state is not checked here — the dialog greys the URL field out
/// while the stream is active, but that is a UX affordance, not a safety net:
/// `recording_task` copies url and name once at start, so the whole reconnect
/// cycle lives on the old address regardless of what the profile says.
#[tauri::command]
pub async fn update_stream(
    stream_id: String,
    name: String,
    url: Option<String>,
    icy_name: Option<String>,
    bitrate: Option<u32>,
    format: Option<AudioFormat>,
    state: tauri::State<'_, AppState>,
) -> Result<StreamInfo, String> {
    let resolved_url = match url {
        Some(u) => Some(
            playlist::resolve_playlist_url(&u)
                .await
                .map_err(|e| e.to_string())?,
        ),
        None => None,
    };

    state
        .commit_profile(|profile| {
            let Some(current) = profile.streams.iter().find(|s| s.id == stream_id).cloned() else {
                return Commit::Skip(Err(format!("Stream {} not found", stream_id)));
            };
            let updated = build_edited_stream(
                &profile.streams,
                &current,
                name,
                resolved_url,
                icy_name,
                bitrate,
                format,
            );
            if let Some(slot) = profile.streams.iter_mut().find(|s| s.id == stream_id) {
                *slot = updated.clone();
            }
            Commit::Save(Ok(updated))
        })
        .await
        .map_err(|e| e.to_string())?
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
    tokio::task::spawn_blocking(move || save_detached(&target))
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
        state
            .commit_profile(|profile| {
                profile.streams.retain(|s| s.id != stream_id);
                Commit::Save(())
            })
            .await
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
    tokio::task::spawn_blocking(move || save_detached(&target))
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
        state
            .commit_profile(|profile| {
                profile.streams.retain(|s| !removed.contains(&s.id));
                Commit::Save(())
            })
            .await
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
            None,
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
            None,
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
            None,
            "NOW".into(),
        );
        assert_eq!(got.name, "Radio X (2)");
    }

    #[test]
    fn added_stream_without_a_name_takes_the_probed_station_name() {
        // The probe already told us who this is — waiting for the first recording
        // to give the stream a human name would leave a URL in the list (and be
        // read out as a URL) for no reason.
        let got = build_added_stream(
            &[],
            "http://new".into(),
            None,
            Some("Groove Salad".into()),
            None,
            None,
            "NOW".into(),
        );
        assert_eq!(got.name, "Groove Salad");
    }

    #[test]
    fn auto_named_stream_is_suffixed_like_any_other() {
        let existing = vec![named("a", "Groove Salad")];
        let got = build_added_stream(
            &existing,
            "http://new".into(),
            None,
            Some("Groove Salad".into()),
            Some(128),
            Some(AudioFormat::Mp3),
            "NOW".into(),
        );
        assert_eq!(got.name, "Groove Salad (MP3 128k)");
    }

    #[test]
    fn a_typed_name_beats_the_probed_one_but_the_official_name_is_still_kept() {
        // icy_name is stored regardless, so "use the official name" works before
        // the stream has ever connected.
        let got = build_added_stream(
            &[],
            "http://new".into(),
            Some("My Name".into()),
            Some("Groove Salad".into()),
            None,
            None,
            "NOW".into(),
        );
        assert_eq!(got.name, "My Name");
        assert_eq!(got.icy_name.as_deref(), Some("Groove Salad"));
    }

    #[test]
    fn added_stream_falls_back_to_the_url_when_the_probe_knew_nothing() {
        // Probe failed / station sends no icy-name: the URL is the placeholder,
        // and the ICY auto-naming replaces it on the first connection instead.
        let existing = vec![named("a", "Radio X")];
        let got =
            build_added_stream(&existing, "http://new".into(), None, None, None, None, "NOW".into());
        assert_eq!(got.name, "http://new");
        assert_eq!(got.icy_name, None);
    }

    #[test]
    fn added_stream_treats_blank_names_as_absent() {
        let got = build_added_stream(
            &[],
            "http://new".into(),
            Some("   ".into()),
            Some("  ".into()),
            None,
            None,
            "NOW".into(),
        );
        assert_eq!(got.name, "http://new");
        assert_eq!(got.icy_name, None);
    }

    /// A stream that already carries probe metadata, so a test can prove the
    /// derived fields are either kept or overwritten on purpose.
    fn described(id: &str, url: &str, name: &str) -> StreamInfo {
        StreamInfo {
            id: id.into(),
            url: url.into(),
            name: name.into(),
            format: Some(AudioFormat::Aac),
            bitrate: Some(64),
            icy_name: Some("Old Station".into()),
            ..sample()
        }
    }

    #[test]
    fn edited_stream_without_a_url_is_a_plain_rename() {
        // Regression guard on today's F2 behaviour: derived fields belong to the
        // address, and the address did not move.
        let current = described("s1", "http://old", "Radio X");
        let got = build_edited_stream(
            std::slice::from_ref(&current),
            &current,
            "  Radio Y  ".into(),
            None,
            None,
            None,
            None,
        );
        assert_eq!(got.name, "Radio Y"); // trimmed
        assert_eq!(got.url, "http://old");
        assert_eq!(got.format, Some(AudioFormat::Aac));
        assert_eq!(got.bitrate, Some(64));
        assert_eq!(got.icy_name.as_deref(), Some("Old Station"));
    }

    #[test]
    fn edited_stream_with_a_new_url_takes_the_fresh_probe_metadata() {
        let current = described("s1", "http://old", "Radio X");
        let got = build_edited_stream(
            std::slice::from_ref(&current),
            &current,
            "Radio X".into(),
            Some("http://new".into()),
            Some("New Station".into()),
            Some(128),
            Some(AudioFormat::Mp3),
        );
        assert_eq!(got.url, "http://new");
        assert_eq!(got.name, "Radio X"); // a name the user chose is never touched
        assert_eq!(got.icy_name.as_deref(), Some("New Station"));
        assert_eq!(got.bitrate, Some(128));
        assert_eq!(got.format, Some(AudioFormat::Mp3));
        assert_eq!(got.id, "s1"); // identity, position and history survive the move
        assert_eq!(got.added_at, "2026-01-01");
    }

    #[test]
    fn edited_stream_with_a_failed_probe_clears_the_stale_metadata() {
        // Saving "anyway" after an unreachable probe: `None` beats a stale
        // "AAC 64k" that NVDA would read out as fact.
        let current = described("s1", "http://old", "Radio X");
        let got = build_edited_stream(
            std::slice::from_ref(&current),
            &current,
            "Radio X".into(),
            Some("http://new".into()),
            None,
            None,
            None,
        );
        assert_eq!(got.format, None);
        assert_eq!(got.bitrate, None);
        assert_eq!(got.icy_name, None);
    }

    #[test]
    fn edited_stream_keeps_an_unnamed_stream_unnamed_so_icy_rename_still_fires() {
        // name == url is exactly how `naming::icy_rename` recognises "no human
        // name yet". Leaving the old URL there would freeze it forever.
        let current = described("s1", "http://old", "http://old");
        let got = build_edited_stream(
            std::slice::from_ref(&current),
            &current,
            "http://old".into(), // the field still holds the placeholder
            Some("http://new".into()),
            None,
            None,
            None,
        );
        assert_eq!(got.name, "http://new");
        assert_eq!(got.name, got.url, "icy_rename must still recognise this stream");
    }

    #[test]
    fn edited_stream_names_an_unnamed_stream_from_the_probe() {
        let current = described("s1", "http://old", "http://old");
        let got = build_edited_stream(
            std::slice::from_ref(&current),
            &current,
            "http://old".into(),
            Some("http://new".into()),
            Some("Groove Salad".into()),
            None,
            None,
        );
        assert_eq!(got.name, "Groove Salad");
    }

    #[test]
    fn edited_stream_disambiguates_the_probed_name_against_its_siblings() {
        let current = described("s1", "http://old", "http://old");
        let sibling = named("other", "Groove Salad");
        let got = build_edited_stream(
            &[current.clone(), sibling],
            &current,
            "http://old".into(),
            Some("http://new".into()),
            Some("Groove Salad".into()),
            Some(64),
            Some(AudioFormat::Aac),
        );
        assert_eq!(got.name, "Groove Salad (AAC 64k)");
    }

    #[test]
    fn edited_stream_treats_a_blank_name_as_never_named() {
        let current = described("s1", "http://old", "Radio X");
        let got = build_edited_stream(
            std::slice::from_ref(&current),
            &current,
            "   ".into(),
            Some("http://new".into()),
            None,
            None,
            None,
        );
        assert_eq!(got.name, "http://new");
    }

    #[test]
    fn edited_stream_trims_a_user_typed_name_but_leaves_it_otherwise_alone() {
        // Even onto a name a sibling already holds: the dialog warns, the user
        // confirmed, and no silent suffix rewrites their choice.
        let current = described("s1", "http://old", "Radio X");
        let sibling = named("other", "Taken");
        let got = build_edited_stream(
            &[current.clone(), sibling],
            &current,
            "  Taken  ".into(),
            Some("http://new".into()),
            None,
            None,
            None,
        );
        assert_eq!(got.name, "Taken");
    }

    #[test]
    fn find_conflicts_reports_the_stream_already_holding_the_url() {
        let streams = vec![StreamInfo {
            id: "a".into(),
            url: "http://dup".into(),
            name: "Radio X".into(),
            ..sample()
        }];
        let got = find_conflicts(&streams, Some("http://dup"), None, None);
        assert_eq!(got.duplicate_url_of.as_deref(), Some("Radio X"));
        assert_eq!(got.name_collides_with, None);
    }

    #[test]
    fn find_conflicts_is_silent_for_a_new_url() {
        let streams = vec![StreamInfo { id: "a".into(), url: "http://a".into(), ..sample() }];
        assert_eq!(find_conflicts(&streams, Some("http://new"), None, None).duplicate_url_of, None);
    }

    #[test]
    fn find_conflicts_reports_a_folder_level_name_clash() {
        let streams = vec![named("a", "Radio X")];
        // Case-only difference: NTFS still gives both recordings one folder.
        let got = find_conflicts(&streams, None, Some("radio x"), None);
        assert_eq!(got.name_collides_with.as_deref(), Some("Radio X"));
        // So does a character that sanitizes away into the same folder name.
        let slashed = vec![named("a", "Radio_X")];
        assert_eq!(
            find_conflicts(&slashed, None, Some("Radio/X"), None).name_collides_with.as_deref(),
            Some("Radio_X")
        );
    }

    #[test]
    fn find_conflicts_excludes_the_stream_being_edited() {
        let streams = vec![named("a", "Radio X"), named("b", "Radio Y")];
        // Renaming "a" to its own name is not a conflict...
        assert_eq!(find_conflicts(&streams, None, Some("Radio X"), Some("a")).name_collides_with, None);
        // ...but renaming it onto "b" is.
        assert_eq!(
            find_conflicts(&streams, None, Some("Radio Y"), Some("a")).name_collides_with.as_deref(),
            Some("Radio Y")
        );
    }

    #[test]
    fn find_conflicts_ignores_a_blank_name() {
        let streams = vec![named("a", "Radio X")];
        assert_eq!(find_conflicts(&streams, None, Some("   "), None).name_collides_with, None);
    }

    /// Only the file name is asserted — the parent depends on where the EXE sits.
    fn playlist_file_name(stream_name: &str) -> String {
        stream_playlist_path(stream_name)
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned()
    }

    #[test]
    fn playlist_file_name_replaces_path_separators_in_the_stream_name() {
        assert_eq!(playlist_file_name("Radio/X"), "Radio_X.m3u8");
    }

    #[test]
    fn playlist_file_name_guards_reserved_device_names() {
        assert_eq!(playlist_file_name("CON"), "_CON.m3u8");
    }

    #[test]
    fn playlist_file_name_keeps_cyrillic_intact() {
        // The .m3u8 extension is what makes this safe: a plain .m3u would be read
        // back in the machine's code page and mangle the header the player shows.
        assert_eq!(playlist_file_name("Радіо Промінь"), "Радіо Промінь.m3u8");
    }

    #[test]
    fn playlist_lives_under_the_portable_data_dir_not_the_system_temp() {
        assert!(stream_playlist_path("Radio X").starts_with(portable::data_dir()));
    }
}
