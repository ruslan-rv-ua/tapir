use crate::errors::RadioError;
use reqwest::Client;
use futures_util::StreamExt;
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tracing::info;

pub async fn record_to_file(url: &str, output_path: &Path) -> Result<(), RadioError> {
    let client = Client::new();
    let response = client
        .get(url)
        .header("Icy-MetaData", "1")
        .header("User-Agent", "Tapir/0.1.0")
        .send()
        .await?
        .error_for_status()?;

    info!("Connected to {}, status: {}", url, response.status());

    let mut file = File::create(output_path).await
        .map_err(RadioError::Io)?;
    let mut stream = response.bytes_stream();
    let mut total_bytes: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let bytes = chunk?;
        file.write_all(&bytes).await.map_err(RadioError::Io)?;
        total_bytes += bytes.len() as u64;
    }

    info!("Recorded {} bytes to {}", total_bytes, output_path.display());
    Ok(())
}
