# HE-AAC test fixtures (captured live samples)

Captured ADTS streams from SomaFM, used by the parked HE-AAC / Media Foundation
work (see `docs/superpowers/sdd/2026-06-15-he-aac/progress.md` and
`docs/superpowers/plans/2026-06-15-he-aac-playback.md`).

| File | Source | Codec |
|------|--------|-------|
| `gs16.aac` | `https://ice1.somafm.com/groovesalad-16-aac` | **HE-AACv2** (SBR + PS), 16 kbps — symphonia cannot decode |
| `lc.aac`   | SomaFM Groove Salad AAC (higher bitrate) | **AAC-LC** — symphonia decodes fine |

Both are short captures (raw ADTS, `audio/aac`). `gs16.aac` is the stream that
motivated the Media Foundation decoder; `lc.aac` is the no-regression control.
The decoded WAV (`gs16.wav`, 2.7 MB) was intentionally **not** committed — it is
regenerable from `gs16.aac`.
