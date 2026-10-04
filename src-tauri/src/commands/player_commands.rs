use tauri::{AppHandle, State};
use crate::app_state::AppState;
use crate::player::engine::{AudioDevice, FileRefusal, LiveRefusal};

/// Stable error code returned by `play_stream` when the stream's air is not
/// something Tapir can even name. Part of the IPC contract: the frontend maps it
/// to its own localized toast (`playRefusal.ts`), so do not reword it. Mirrors
/// the `SHELL_ERR_*` codes in [`crate::commands::shell_open`].
pub(crate) const PLAY_ERR_UNSUPPORTED_CODEC: &str = "unsupported_codec";
/// The stream is not in the active profile — the row outlived a profile switch
/// or a delete. Deliberately the same code as the recording side: one fact, one
/// frontend key (`stream_not_found_in_profile`), so the alias, not a literal.
pub(crate) const PLAY_ERR_STREAM_NOT_FOUND: &str =
    crate::commands::stream_commands::REC_ERR_STREAM_NOT_FOUND;
/// Connected, but the air never became sound: probe timeout, an undecodable
/// format, a decoder-init panic. One code — all three lead to the same action
/// (another station, or the help).
pub(crate) const PLAY_ERR_PLAY_FAILED: &str = "play_failed";
/// The station did not answer. Same frontend key as the browser's health
/// check (`failure_station_unreachable`) — one fact, one wording.
pub(crate) const PLAY_ERR_CONNECT_FAILED: &str = "connect_failed";
/// The output device would not open; the previous session is already stopped.
pub(crate) const PLAY_ERR_OUTPUT_UNAVAILABLE: &str = "output_unavailable";

/// The closed list of live-play refusals on the wire. Classifies by the
/// [`LiveRefusal`] context the engine attaches, never by wording; anything the
/// engine left unclassified still leaves as `play_failed`, not as prose.
fn play_refusal_code(e: &anyhow::Error) -> &'static str {
    match e.downcast_ref::<LiveRefusal>() {
        Some(LiveRefusal::Connect) => PLAY_ERR_CONNECT_FAILED,
        Some(LiveRefusal::Output) => PLAY_ERR_OUTPUT_UNAVAILABLE,
        Some(LiveRefusal::Decode) | None => PLAY_ERR_PLAY_FAILED,
    }
}

/// One refusal → wire mapping for both `play_stream` and `preview_station`, so
/// the two cannot drift. The detail (whole context chain, numbers included)
/// goes to the log; the frontend gets the code (ADR 2026-09-06 §5).
fn play_refusal_on_wire(e: anyhow::Error) -> String {
    log::warn!("Player: live play refused: {e:#}");
    play_refusal_code(&e).to_string()
}

/// The track is no longer where the list saw it — `NotFound` from `File::open`
/// and nothing else. Same frontend key as `Alt+Enter`'s `not_found`
/// (`songs_open_not_found`): one fact, one wording.
pub(crate) const PLAY_ERR_FILE_NOT_FOUND: &str = "file_not_found";
/// Any other refusal of a file: access denied, held by another process, a
/// broken or unfinished file the decoder would not take. One code — all lead to
/// the same action (the help).
pub(crate) const PLAY_ERR_FILE_PLAY_FAILED: &str = "file_play_failed";

/// The closed list of file-play refusals on the wire, by the [`FileRefusal`]
/// context the engine attaches. The output device shares the live code: the
/// wording names no source.
fn file_refusal_code(e: &anyhow::Error) -> &'static str {
    match e.downcast_ref::<FileRefusal>() {
        Some(FileRefusal::NotFound) => PLAY_ERR_FILE_NOT_FOUND,
        Some(FileRefusal::Output) => PLAY_ERR_OUTPUT_UNAVAILABLE,
        Some(FileRefusal::Unplayable) | None => PLAY_ERR_FILE_PLAY_FAILED,
    }
}

/// Refusal → wire for `play_saved_song`: the whole chain (path included) to the
/// log, the code to the frontend (ADR 2026-09-06 §5).
pub(crate) fn file_refusal_on_wire(e: anyhow::Error) -> String {
    log::warn!("Player: file play refused: {e:#}");
    file_refusal_code(&e).to_string()
}

#[tauri::command]
pub async fn play_stream(
    stream_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let stream = {
        let profile = state.active_profile.read().await;
        profile.streams.iter()
            .find(|s| s.id == stream_id)
            .cloned()
            .ok_or_else(|| PLAY_ERR_STREAM_NOT_FOUND.to_string())?
    };
    // Імплікація однобічна (ADR 2026-08-31 §7): symphonia декодує вужчий набір,
    // ніж Tapir уміє назвати, тож «не формат» гарантує «не заграє» — хибної
    // відмови тут бути не може. Відмовляємо одразу, замість п'ятнадцяти секунд
    // проби, яка все одно скінчиться мовчанням.
    //
    // Стабільний код, а не готовий рядок: текст складе Paraglide.
    if stream.unsupported_codec.is_some() {
        return Err(PLAY_ERR_UNSUPPORTED_CODEC.to_string());
    }
    state.player.play_stream(stream_id, stream.url, &app).await.map_err(play_refusal_on_wire)?;
    crate::playback_control::persist_session_snapshot(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn preview_station(
    url: String,
    name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.player.preview(url, name, &app).await.map_err(play_refusal_on_wire)
}

#[tauri::command]
pub async fn pause_playback(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.player.pause_playback(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resume_playback(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.player.resume_playback(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_playback(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    // Capture the file position before teardown so a later Ctrl+Shift+K resumes
    // where it left off (no-op for streams/preview).
    crate::playback_control::persist_session_snapshot(&app).await;
    state.player.stop_playback(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn seek_playback(
    position_ms: u64,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.player.seek_playback(position_ms, &app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_volume(
    volume: f32,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    // Гучність — сесійне поле: у пам'яті вона живе в PlayerEngine, а на диск
    // потрапляє на переходах (persist_session_snapshot, graceful_shutdown), не
    // на кожну зміну. Слайдер шле цю команду на кожну стрілку, тож запис профілю
    // тут був у гарячому шляху; глобальний хоткей (shortcuts.rs) не писав його
    // й до цього — тепер обидва шляхи поводяться однаково.
    state.player.set_volume(volume, &app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_player_status(
    state: State<'_, AppState>,
) -> Result<crate::player::engine::PlayerStatus, String> {
    Ok(state.player.get_status().await)
}

#[tauri::command]
pub async fn list_output_devices() -> Result<Vec<AudioDevice>, String> {
    crate::player::engine::PlayerEngine::list_output_devices()
        .await
        .map_err(|e| e.to_string())
}

/// Нативний тост для невдалого prev/next, коли вікно не у фокусі. Вузька й
/// типізована навмисно: причина — serde-енум, ключ обирає Rust, а ім'я цілі
/// передає вебв'ю — власник правила іменування один (`sourceName`), і команда
/// не дає підняти довільний тост трею.
#[tauri::command]
pub fn notify_transport_failure(
    name: String,
    reason: crate::tray::notify::TransportFailureReason,
    app: AppHandle,
) {
    crate::tray::notify::notify_transport_failure(&app, &name, reason);
}

#[tauri::command]
pub async fn set_output_device(
    name: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.player.set_output_device(name.clone(), &app).await.map_err(|e| e.to_string())?;
    state
        .commit_settings(|settings| {
            settings.output_device = name;
            crate::store::Commit::Save(())
        })
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::Context;

    /// Built the way `play_live` builds them: the detail inside, the reason as
    /// the outermost context.
    fn refused(detail: &str, reason: LiveRefusal) -> anyhow::Error {
        Err::<(), _>(anyhow::anyhow!("{detail}")).context(reason).unwrap_err()
    }

    #[test]
    fn connection_failure_is_connect_failed() {
        let e = refused("error sending request for url (http://x/)", LiveRefusal::Connect);
        assert_eq!(play_refusal_code(&e), "connect_failed");
    }

    #[test]
    fn probe_timeout_is_play_failed() {
        let e = refused(
            "timed out probing stream format after 15s (unsupported codec?)",
            LiveRefusal::Decode,
        );
        assert_eq!(play_refusal_code(&e), "play_failed");
    }

    #[test]
    fn undecodable_format_is_play_failed() {
        let e = refused("could not probe live stream format", LiveRefusal::Decode);
        assert_eq!(play_refusal_code(&e), "play_failed");
    }

    #[test]
    fn decoder_init_panic_is_play_failed() {
        let e = refused("LiveSource init task panicked: task 7 panicked", LiveRefusal::Decode);
        assert_eq!(play_refusal_code(&e), "play_failed");
    }

    #[test]
    fn output_device_failure_is_output_unavailable() {
        let e = refused("audio device not found: Speakers", LiveRefusal::Output);
        assert_eq!(play_refusal_code(&e), "output_unavailable");
    }

    #[test]
    fn unclassified_failure_still_leaves_as_a_code_not_prose() {
        let e = anyhow::anyhow!("something nobody classified");
        assert_eq!(play_refusal_on_wire(e), "play_failed");
    }

    #[test]
    fn reason_survives_further_context_from_callers() {
        // A caller wrapping the engine's error must not hide the reason.
        let e = refused("x", LiveRefusal::Output).context("while resuming");
        assert_eq!(play_refusal_code(&e), "output_unavailable");
    }

    fn file_refused(detail: &str, reason: FileRefusal) -> anyhow::Error {
        Err::<(), _>(anyhow::anyhow!("{detail}")).context(reason).unwrap_err()
    }

    #[test]
    fn missing_file_is_file_not_found() {
        let e = file_refused("opening C:\\rec\\a.mp3", FileRefusal::NotFound);
        assert_eq!(file_refusal_code(&e), "file_not_found");
    }

    #[test]
    fn unplayable_file_is_file_play_failed() {
        let e = file_refused("decoding C:\\rec\\a.mp3", FileRefusal::Unplayable);
        assert_eq!(file_refusal_code(&e), "file_play_failed");
    }

    #[test]
    fn file_output_failure_is_output_unavailable() {
        let e = file_refused("audio device not found: Speakers", FileRefusal::Output);
        assert_eq!(file_refusal_code(&e), "output_unavailable");
    }

    #[test]
    fn unclassified_file_failure_leaves_as_a_code_without_the_path() {
        let e = anyhow::anyhow!("something about C:\\rec\\a.mp3");
        assert_eq!(file_refusal_on_wire(e), "file_play_failed");
    }
}
