pub mod engine;

// Windows-only Media Foundation HE-AAC / HE-AACv2 live decoder. symphonia only
// decodes AAC-LC, so low-bitrate SomaFM AAC streams (SBR/PS) route here instead.
#[cfg(windows)]
mod mf_aac;
