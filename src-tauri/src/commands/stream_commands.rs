use crate::portable;
use crate::stream::connection;
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;

#[tauri::command]
pub async fn start_test_recording(url: String) -> Result<String, String> {
    let output_path = portable::recordings_dir().join("test_recording.mp3");
    tokio::spawn(async move {
        match connection::connect(&url).await {
            Ok(conn) => {
                tracing::info!(
                    "ICY headers — name: {:?}, bitrate: {:?}, metaint: {:?}",
                    conn.headers.name(),
                    conn.headers.bitrate(),
                    conn.headers.metadata_interval(),
                );
                // Stream raw bytes to file (walking skeleton verification)
                let mut file = match tokio::fs::File::create(&output_path).await {
                    Ok(f) => f,
                    Err(e) => {
                        tracing::error!("Failed to create file: {}", e);
                        return;
                    }
                };
                let mut stream = conn.response.bytes_stream();
                let mut total_bytes: u64 = 0;
                while let Some(chunk) = stream.next().await {
                    match chunk {
                        Ok(bytes) => {
                            if let Err(e) = file.write_all(&bytes).await {
                                tracing::error!("Write error: {}", e);
                                break;
                            }
                            total_bytes += bytes.len() as u64;
                        }
                        Err(e) => {
                            tracing::error!("Stream error: {}", e);
                            break;
                        }
                    }
                }
                tracing::info!("Recorded {} bytes", total_bytes);
            }
            Err(e) => tracing::error!("Connection failed: {}", e),
        }
    });
    Ok("Recording started".to_string())
}
