## Task 6: Graceful fallback for anything still undecodable (Option 4 layer)

**Files:**
- Modify: `src-tauri/src/player/engine.rs` (error message in the `play_live` probe-failure arms)

- [ ] **Step 1:** When both decoders fail (or the `PROBE_TIMEOUT` fires), return a stable, user-facing error string distinct from network errors — e.g. an error kind the frontend can map, rather than raw anyhow text. Prefer a typed `RadioError` variant (`errors.rs`) like `UnsupportedStreamFormat` so the frontend can localize it (see Task 7) instead of showing English.

- [ ] **Step 2:** `cargo test` + `cargo clippy`. Commit:
  ```bash
  git commit -am "feat(player): typed UnsupportedStreamFormat error for undecodable streams"
  ```

---

