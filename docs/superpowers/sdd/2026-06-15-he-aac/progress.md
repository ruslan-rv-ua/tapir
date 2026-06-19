# SDD Progress Ledger — HE-AAC Live Playback

Plan: docs/superpowers/plans/2026-06-15-he-aac-playback.md
Branch: fix/player-decode-failure
Start BASE: f54dd86 (plan doc commit; #1 work builds on the #2 fix already on this branch)
Final-review base: f54dd86 (HE-AAC work only; `main` is stale per project memory)

## Decisions / resolved plan nits
- Branch: continuing on fix/player-decode-failure (branch name matches this work; plan states #1 builds on the #2 fix already here).
- Spike verification substitutes ffprobe (objective channels+rate) for "sanity-listen" — plan Task 1 Step 4 explicitly allows ffprobe. Network to SomaFM confirmed (200, audio/aac); ffprobe + cargo present.
- Trait signature: architecture prose says `next_pcm -> Option<(Vec<f32>, SignalSpec)>`, but Task 2's concrete definition is `next_pcm -> Option<Vec<f32>>` + separate `spec(&self) -> SignalSpec`. Task 2 concrete form governs; a queried spec() also handles risk #3 (spec change after SBR kicks in).
- Task 7 paraglide: `src/i18n/paraglide/` is gitignored. Do NOT `git add` paraglide (overrides Task 7's commit command); regenerate via vite:build, commit only message JSON. Matches prior project decision.
- Bash tool is broken in this env; all shell via PowerShell. Subagents must use PowerShell, not Bash. Helper scripts reimplemented in PowerShell at `.git/sdd/*.ps1`.
- Task 5 (in-app NVDA/audio playback acceptance) cannot be done autonomously → deferred to user, like prior ledger.
- Task 4 routing (USER DECISION 2026-06-18): plan's "try-MF-then-fallback-to-symphonia" is impractical on a live non-rewindable rtrb consumer (MF consumes the ADTS header during source resolution before failing, so symphonia can't restart cleanly). DECISION: deterministic routing — AAC content-types → MF (handles LC+HE-AAC); audio/mpeg + unknown/missing → symphonia (unchanged). MF init failure → propagate error (Task 6 types it as UnsupportedStreamFormat). NO mid-stream symphonia fallback. Aligns with plan Open-Q#1 (N-edition → graceful error). Behavior change: AAC-LC now decodes via MF not symphonia (Task 5 step 5 verifies).

## Tasks
- Task 1: Spike — MF decode of groovesalad-16-aac → PCM, pick MFT vs SourceReader — COMPLETE (commit 14b6256). Gate PASSED (ffprobe-verified stereo 32kHz). Decision: IMFSourceReader.
- Task 2: Extract LiveDecoder trait (symphonia unchanged) — COMPLETE (commit 5f13f56, review Approved, 308/308 +1 test)
- Task 3: MfAacDecoder (Media Foundation), Windows-only — COMPLETE (commits 0d50bdb→ae37baf→a1198c5, review Approved after 2 fix passes). 310 tests pass. Decodes real gs16.aac → 1,359,872 f32 @ 32000/2.
- Task 4: Route AAC→MF, MP3/LC→symphonia — COMPLETE (commits 93b76b6 routing + a78bf45 lint fix, review Approved, 313 tests). Controller verified clippy clean.
- Task 5: Manual verification (DEFERRED to user) — pending
- Task 6: Typed UnsupportedStreamFormat error — COMPLETE (commit 3daa6ca, 314 tests). Controller-reviewed the diff directly (small/well-specified). Token "UnsupportedStreamFormat" reaches frontend via e.to_string(); only decoder-reject + timeout arms changed; network/device/panic arms untouched. Task 7 BASE = 3daa6ca.
- Task 7: i18n unsupported-format message — COMPLETE (commit 1ca5a27, 3 files, NO paraglide staged ✓). vite:build OK, pnpm test 463 pass. Controller verified mapping (String(err)==="UnsupportedStreamFormat" → m.player_error_unsupported_format()) + both locale keys. Task 8 BASE = 1ca5a27.
- Task 8: Docs — COMPLETE (commit 74c2d90). tech-stack.md + architecture.md updated (MF path, LiveDecoder routing, why symphonia insufficient, UnsupportedStreamFormat). Controller-done (docs-only).

## Minor findings (for final review triage)
- Task 2 (engine.rs test): fixture fed to rtrb ring byte-by-byte (O(n) push loop) — cosmetic, works at 8KB; could use write_chunk/slice.
- Task 2 (engine.rs SymphoniaDecoder::next_pcm): warn!/debug! log lines still prefixed `[LiveSource]` though code now lives in `SymphoniaDecoder` — log-attribution nit. (Consider fixing when Task 3/4 touch this area.)
- Task 3 (mf_aac.rs): timeout-abandoned MF init relies on producer-drop→is_abandoned (not the `stop` flag) to unblock, since MfAacDecoder::drop (which sets stop) only runs after new() returns. Verified working (engine.rs cancel drops producer); module docs slightly overstate `stop`'s role pre-Ok(Self). Doc-note only.
- Task 3 (mf_aac.rs): byte-stream implements full IMFAttributes surface + carries a direct windows-core dep — load-bearing for URL-less source resolution; a simpler reader-attributes path may exist but was deliberately not pursued (risk to working decode). +2 extra windows features (StructuredStorage, Variant) for PROPVARIANT. Justified, not gratuitous.

## STATUS: ALL TASKS COMPLETE (Task 5 = manual, deferred to user). Final HEAD = 74c2d90.
## Branch finish: user chose KEEP AS-IS (consistent with prior SDD branch). No merge/push/delete. Integration target = develop (HEAD is 12 ahead, 0 behind → clean FF when user decides); main is stale (983 behind); origin = github Tapir_draft.git. Manual acceptance (plan Task 5: in-app HE-AAC playback + NVDA, MP3/LC no-regression, record+play) DEFERRED to user before any release tag.

## FINAL whole-branch review (opus, f54dd86..74c2d90): READY TO MERGE = YES.
0 Critical, 0 Important. mf_aac.rs concurrency/COM final state verified sound on every named risk (no COM escapes decode thread; teardown reader→MFShutdown→CoUninitialize on owning thread; Drop deadlock-free; history O(1)-bounded w/ committed tests; below-base read fails loudly). No MP3/AAC-LC regression; #2 non-destructive play_live + PROBE_TIMEOUT intact (MF init blocks via rendezvous, bounded by timeout); error token reaches frontend cleanly. 4 Minors, ALL deferrable → backlog:
- M1 (functional edge, narrow): engine.rs routes `audio/mp4`→MF but build_reader hard-seeds MF_BYTESTREAM_CONTENT_TYPE="audio/aac"; a real fragmented-mp4 live stream (NOT a Tapir scenario — live AAC is ADTS audio/aac) would fail source resolution → graceful UnsupportedStreamFormat. Fix later: drop audio/mp4 from MF arm (→symphonia, which has isomp4) OR thread real content_type into RtrbByteStream::new.
- M2: decode_loop no-sample `continue` lacks a yield backstop (MF's blocking Read paces it in practice; theoretical hot-loop). Add yield_now()/empty-counter later.
- M3: SymphoniaDecoder::next_pcm logs still prefixed `[LiveSource]` (cosmetic).
- M4: Task 2 regression test fills ring byte-by-byte (cosmetic).
Decision: merge-as-is per reviewer; M1-M4 → backlog (not blocking; audio/mp4-over-ICY not real).

## Log
- Setup: reset stale ledger (previous run = bulk-stream-operations-B, completed/finished). Established Start BASE f54dd86.
- Task 6: complete (commit 3daa6ca, controller-reviewed diff). - Task 7: complete (commit 1ca5a27, 3 files, no NEW paraglide; 9 baseline paraglide files tracked = established project state, unchanged). - Task 8: complete (commit 74c2d90, docs-only, controller-done). Task 5 = manual, DEFERRED to user.
- Task 4: complete (commit 93b76b6 + lint-fix a78bf45). Deterministic routing via pure helper decoder_kind_for_mime (3 cfg-correct unit tests). Review Approved. Reviewer ⚠️ on HISTORY_PROBE_REGION → controller ran clippy: removing the module #[allow(dead_code)] DID expose a dead_code warning (implementer's "0 new warnings" was wrong). Fixed with narrow #[allow(dead_code)] on the constant (a78bf45); re-verified clippy 32 warns (all pre-existing), mf_aac tests pass. Task 5 BASE = a78bf45.
- Task 3: complete (commits 0d50bdb feat → ae37baf fix1 → a1198c5 fix2). Review found 1 Critical + 2 Important: (C) unsafe impl Send unsound — decoder built on spawn_blocking(MTA) thread but rodio/cpal pull next_pcm on cpal's STA audio thread = cross-apartment COM. Fixed (fix1) by giving MfAacDecoder a dedicated decode thread owning all COM/MF; next_pcm = channel recv; unsafe impl Send removed (now naturally Send). (I) Drop ran CoUninitialize on wrong thread/order — fixed (fix1), teardown reader→MFShutdown→CoUninitialize on the owning thread. (I) unbounded history — fix1 CLAIMED bounded but re-review caught it was STILL unbounded (absolute 64KB floor, not trailing window); fix2 (a1198c5) made it a true 256KiB trailing window + loud-fatal guard on below-base reads, with 2 committed pure-logic tests proving the bound (history ≤278528 over 4MiB) — controller-verified the code directly. Cross-thread offline re-validation passed (1.36M f32 @ 32000/2 pulled on a separate thread; Drop-no-hang verified). Lesson: don't trust "now bounded" claims without a long-enough test — the 21s offline decode never trimmed. Task 4 BASE = a1198c5.
- Task 2: complete (commit 5f13f56, review Approved). Pre-existing fixture src-tauri/tests/fixtures/sample.mp3 reused (no new fixture). Spec ✅, error-cap/EOF/Source semantics preserved verbatim. 2 Minors recorded above. Task 3 BASE = 5f13f56.
- Task 1 (spike): complete (commit 14b6256). Gate PASSED — controller ran ffprobe on decoded WAV: pcm_s16le/32000/2ch (16kHz mono core → SBR-doubled 32kHz stereo). Decision IMFSourceReader (no raw-MFT input type needed → kills risk #2). Spec stable from frame 1 (risk #3 resolved; keep defensive CURRENTMEDIATYPECHANGED). Production caveat: live path needs custom IMFByteStream over rtrb + MFCreateSourceReaderFromByteStream. Spike Outcome recorded in plan. Prototype discarded; Cargo.toml reverted. No per-task code-review subagent for the spike (throwaway) — gate = controller ffprobe verification. Samples kept at target/spike/{gs16.aac,lc.aac} (gitignored, untracked) for Task 2 fixture reference. Task 2 BASE = 14b6256.
