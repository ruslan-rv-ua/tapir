use crate::stream::connection;
use crate::portable;

#[tauri::command]
pub async fn start_test_recording(url: String) -> Result<String, String> {
    let output_path = portable::recordings_dir().join("test_recording.mp3");
    tokio::spawn(async move {
        if let Err(e) = connection::record_to_file(&url, &output_path).await {
            tracing::error!("Recording failed: {}", e);
        }
    });
    Ok("Recording started".to_string())
}
