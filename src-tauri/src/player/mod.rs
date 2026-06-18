pub mod engine;

// Windows-only Media Foundation HE-AAC / HE-AACv2 live decoder. symphonia only
// decodes AAC-LC, so low-bitrate SomaFM AAC streams (SBR/PS) route here instead.
//
// `dead_code` is allowed only until Task 4 wires `MfAacDecoder` into
// `LiveSource::new`'s routing; nothing constructs it yet, so without this the
// build emits unused-item warnings. Remove the attribute once routing lands.
#[cfg(windows)]
#[allow(dead_code)]
mod mf_aac;
