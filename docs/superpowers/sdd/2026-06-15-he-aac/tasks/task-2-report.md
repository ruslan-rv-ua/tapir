# Task 2 Report: Extract `LiveDecoder` Trait

## What Changed

**File modified:** `src-tauri/src/player/engine.rs`

### Structural changes

The `LiveSource` section (formerly lines 451-562) was refactored:

1. **Added `LiveDecoder` trait** (new, verbatim from brief):
   ```rust
   trait LiveDecoder: Send {
       fn next_pcm(&mut self) -> Option<Vec<f32>>;
       fn spec(&self) -> SignalSpec;
   }
   ```

2. **Introduced `SymphoniaDecoder` struct** -- extracted from `LiveSource`:
   - `struct SymphoniaDecoder { format, decoder, track_id, spec }` (no buffer)
   - `SymphoniaDecoder::new(consumer, hint_mime)` -- identical to old `LiveSource::new` minus the VecDeque construction
   - `impl LiveDecoder for SymphoniaDecoder` -- `next_pcm()` is the old `decode_next_packet` body returning `Some(Vec<f32>)` instead of pushing to a VecDeque; `spec()` returns `self.spec`
   - Same 32-consecutive-error cap preserved exactly

3. **Refactored `LiveSource`** -- now holds `Box<dyn LiveDecoder>` + `VecDeque<f32>` + `spec: SignalSpec` (cached for `Source` trait's `&self` methods):
   - `LiveSource::new` delegates to `SymphoniaDecoder::new`, caches the spec, boxes the decoder
   - `decode_next_packet` calls `decoder.next_pcm()` and extends the buffer
   - `Iterator::next` and `impl Source` unchanged in behavior

4. **Regression test added** to the existing `mod tests` in `engine.rs`:
   - Uses the pre-existing `src-tauri/tests/fixtures/sample.mp3` (8612 bytes, ID3v2+MP3)
   - Fills an rtrb ring, drops producer (EOF), builds `SymphoniaDecoder`, asserts `spec.rate > 0`, `channels >= 1`, and first `next_pcm()` returns non-empty `Vec<f32>`

## TDD Evidence

### RED step -- `SymphoniaDecoder` did not exist yet

Command:
```
cargo test --manifest-path src-tauri/Cargo.toml symphonia_decoder
```

Output (key line):
```
error[E0433]: failed to resolve: use of undeclared type `SymphoniaDecoder`
  --> src\player\engine.rs:1045:23
error: could not compile `tapir` (lib test) due to 1 previous error
```
Expected failure: type does not exist before the refactor.

### GREEN step -- after implementing `SymphoniaDecoder`

Command:
```
cargo test --manifest-path src-tauri/Cargo.toml symphonia_decoder
```

Output:
```
running 1 test
test player::engine::tests::symphonia_decoder_yields_pcm_and_valid_spec ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 307 filtered out; finished in 0.00s
```

## Full Suite + Clippy

### Full test suite

Command: `cargo test --manifest-path src-tauri/Cargo.toml`

Result: **308 passed; 0 failed; 0 ignored** (was 307 before this task; +1 new test)

### Clippy

Command: `cargo clippy --manifest-path src-tauri/Cargo.toml`

Result: **31 warnings, all pre-existing** (none in the new `SymphoniaDecoder`/`LiveDecoder`/`LiveSource` code). No errors. No new warnings introduced.

## Files Changed

- `src-tauri/src/player/engine.rs` -- 1 file changed, 89 insertions(+), 13 deletions(-)
- `src-tauri/tests/fixtures/sample.mp3` -- already tracked, unchanged (used by the new test via `include_bytes!`)

## Commit

SHA: `5f13f56`
Message: `refactor(player): LiveDecoder trait behind LiveSource (symphonia unchanged)`

## Concerns

None. The refactor is purely structural: behavior is identical for MP3/AAC-LC streams. The `LiveSource::new(consumer, hint_mime)` public entry point keeps its exact signature. `SymphoniaDecoder` is module-private (no `pub`), accessible to the test via `super::*` in the existing `mod tests`. The trait is also module-private, ready to be used by Task 3/4 additions.