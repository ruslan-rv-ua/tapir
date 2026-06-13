use crate::app_state::AppState;
use tauri::Manager;

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
    Ok(())
}
