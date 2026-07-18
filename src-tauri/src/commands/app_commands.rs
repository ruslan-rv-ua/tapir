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

    if let Some(startup) = app.try_state::<crate::cli::StartupPlan>() {
        if let Some(plan) = startup.take() {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                crate::cli::execute(&app, plan).await;
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
