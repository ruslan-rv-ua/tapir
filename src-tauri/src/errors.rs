use thiserror::Error;

#[derive(Debug, Error)]
pub enum RadioError {
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Format error: {0}")]
    Format(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Invalid URL: {0}")]
    InvalidUrl(String),

    #[error("{0}")]
    Other(String),

    #[error("Radio Browser API error: {0}")]
    BrowserApi(String),

    #[error("No Radio Browser servers available")]
    BrowserNoServers,

    #[error("Stream with this URL already exists")]
    DuplicateStream,
}

impl From<RadioError> for String {
    fn from(e: RadioError) -> String {
        e.to_string()
    }
}
