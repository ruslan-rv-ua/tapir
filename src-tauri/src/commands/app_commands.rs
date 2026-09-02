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

/// What the About section shows (backlog about-app-info). Both fields are
/// build-time package metadata: the version comes from `tauri.conf.json` via
/// `package_info()` — the same value the JS `getVersion()` would read — and the
/// address from `Cargo.toml` `homepage`, the only place it is written. One
/// command for both so the frontend has one call and one loading state.
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub homepage: String,
}

/// `Cargo.toml` `homepage`, baked in at compile time. The address is written
/// there and nowhere else — not in this file, not in TS, not in i18n.
pub(crate) const PROJECT_HOMEPAGE: &str = env!("CARGO_PKG_HOMEPAGE");

#[tauri::command]
pub fn get_app_info(app: tauri::AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        homepage: PROJECT_HOMEPAGE.to_string(),
    }
}

/// Closed on purpose: no argument, so nothing the frontend sends ever reaches
/// `ShellExecuteW`. For an `https:` address the shell knows exactly one
/// association — the default browser — which is the whole point here (and the
/// reason `open_stream_in_app` writes a playlist instead of handing over a URL).
/// Rejects with a stable `shell_open` code; the frontend maps it to a toast.
#[tauri::command]
pub async fn open_project_page() -> Result<(), String> {
    tokio::task::spawn_blocking(|| crate::commands::shell_open::shell_open(PROJECT_HOMEPAGE))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod about_tests {
    use super::*;

    #[test]
    fn project_homepage_is_the_public_repository() {
        // The one address the About section shows and the "Open project page"
        // button hands to the shell. Decided in backlog about-app-info (2026-09-02):
        // deliberately the public name, not the current `Tapir_draft` remote.
        assert_eq!(PROJECT_HOMEPAGE, "https://github.com/ruslan-rv-ua/tapir");
    }
}
