use crate::app_state::AppState;
use tauri::{Emitter, Manager};

/// Ready-сигнал webview (§3.5): scheduler стартує лише після нього, інакше
/// catch-up першого тіка емітив би scheduled-started до підписки frontend —
/// втрачене озвучення. Phase 3G: так само дренажимо стартовий CLI-план
/// (StartupPlan) — дії озвучуються лише після підписки webview. Ідемпотентна:
/// scheduler.start — no-op на повторі; StartupPlan.take() — порожньо на повторі.
#[tauri::command]
pub async fn frontend_ready(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.scheduler.start(app.clone());

    // Capture whether the startup CLI plan explicitly drives playback BEFORE the
    // plan is drained — an explicit --play/--stop-playback overrides the saved
    // autoplay policy (below), so we must know it before deciding to autoplay.
    let mut cli_controls_playback = false;
    if let Some(startup) = app.try_state::<crate::cli::StartupPlan>() {
        if let Some(plan) = startup.take() {
            cli_controls_playback = crate::cli::plan_controls_playback(&plan.actions);
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                crate::cli::execute(&app, plan).await;
            });
        }
    }

    // Startup autoplay (resume-last-playback): reuse `resume_last` — the same path
    // Ctrl+Shift+K drives (stream reconnect / file resume + `player-announce`).
    // Deferred here (not `lib.rs` setup) so announces land after the webview
    // subscribes and the ≤15 s blocking connect never hangs setup. `take()` gates
    // it to one attempt per launch (a webview reload calls `frontend_ready`
    // again); it is consumed even when the CLI cancels autoplay, so a later reload
    // cannot revive it.
    if let Some(guard) = app.try_state::<crate::playback_control::AutoplayGuard>()
        && guard.take()
        && !cli_controls_playback
    {
        let should_autoplay = state.active_profile.read().await.player_session.autoplay_on_startup;
        if should_autoplay {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                crate::playback_control::resume_last(&app).await;
            });
        }
    }

    // Підфаза 3I-2: якщо при старті виявлено переміщення EXE — оголосити ОДИН раз.
    // Deferred сюди (як StartupPlan): емісія до підписки webview = втрачене
    // оголошення. take() робить це ідемпотентним на reload.
    if let Some(notice) = app.try_state::<crate::autostart::StartupNotice>() {
        if notice.take().is_some() {
            let _ = app.emit("autostart-deactivated", ());
        }
    }

    // Phase 3K: підсумок crash-resume — deferred (як StartupPlan/StartupNotice).
    // Порожній снапшот / чистий вихід → ResumeNotice не managed → тиша.
    if let Some(notice) = app.try_state::<crate::crash_recovery::ResumeNotice>()
        && let Some(summary) = notice.take()
    {
        let _ = app.emit("crash-resume", summary);
    }

    Ok(())
}
