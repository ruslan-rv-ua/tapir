# Tapir — Agent Guidelines

## Project State

Active development — **Phase 3F** (Profile Manager).
Breaking changes are expected at any time — no migrations, no backward-compatibility guarantees.
See [docs/implementation-phases.md](docs/implementation-phases.md) for the full roadmap.

| Фаза | Статус | Гілка |
|------|--------|-------|
| Phase 1 — Core Recording | ✅ Complete | `feature/refine-phase-1` |
| Phase 2A — Player subsystem | ✅ Complete | `feature/phase-2` |
| Phase 2B — Wishlist + Ignorelist + Context Menu | ✅ Complete | `feature/phase-2b` |
| Phase 2C — SettingsDialog + Shortcuts | ✅ Complete | `feature/phase-2c` |
| Phase 3A — System Tray | ✅ Complete | merged to `develop` |
| Phase 3B — Stream Browser | ✅ Complete | `feature/phase-3b` |
| Phase 3C — Saved Songs Manager | ✅ Complete | merged to `develop` |
| Phase 3D — Scheduler | ✅ Complete | `feature/phase-3d-scheduler` |
| Phase 3E — Single Instance | ✅ Complete | `feature/phase-3e-single-instance` |
| Phase 3F — Profile Manager | ✅ Complete | `feature/pahse-3F-profiles` |
| Phase 3G — CLI Arguments | ✅ Complete | `feature/backlog-unimplemented-phases` |
| Phase 3H — Post-processing | ⬜ Not started | — |
| Phase 3I — Polish Bundle | ⬜ Not started | — |
| Phase 3J — Stream Import/Export | ✅ Complete | merged to `develop` |
| Phase 3K — Crash Recovery | ✅ Complete | `feature/phase-3k-crash-recovery` |

## Developer Context

The developer is **blind** and uses **NVDA** screen reader on Windows.
All UI must be fully operable and understandable via NVDA — test with screen reader, not just visually.

## Architecture

Backend-first: all state and business logic lives in Rust (Tauri v2).
Frontend (React 19) is a presentation layer that communicates exclusively via Tauri IPC.
See [docs/architecture.md](docs/architecture.md) for module structure and data flow.

## Key Constraints

- **Accessibility-first**: every UI element must work with NVDA/JAWS/Narrator. Use React Aria Components, ARIA landmarks, `aria-live` regions. See [docs/accessibility.md](docs/accessibility.md).
- **Portable**: single EXE, no installer. Data stored in `data/` next to the executable. See `src-tauri/src/portable.rs`.
- **Window decorations**: `decorations: true` is required (NVDA mouse tracking — Tauri #12901).
- **i18n**: Ukrainian first, English second. Uses Paraglide.js (compile-time, type-safe). Messages in `src/i18n/messages/{uk,en}.json`.

## Build & Run

Requires: Rust toolchain, Node.js, pnpm, [just](https://github.com/casey/just).

| Command | Purpose |
|---------|---------|
| `just install` | Install JS dependencies |
| `just dev` | Start Tauri dev server (Vite + Rust watcher) |
| `just build-fast` | Quick release build (`release-fast` profile) |
| `just build` | Optimized release build (slow, small binary) |
| `just clean` | Clean Rust build artifacts |

Output binary: `src-tauri/target/release-fast/tapir.exe` (build-fast) or `src-tauri/target/release/tapir.exe` (build).

## Conventions

- **Language**: respond in Ukrainian unless asked otherwise.
- **Scaffolded code**: functions marked `#[allow(dead_code)]` with `Scaffold:` doc-comments are intentional stubs for upcoming phases — do not remove.
- **Frontend state**: Nanostores (`src/stores/`), not React state, for anything shared across components.
- **Error types**: `RadioError` enum via `thiserror` (`src-tauri/src/errors.rs`).
- **No over-engineering**: only implement what the current phase requires.
- **Test panics**: `.unwrap()` inside `#[cfg(test)]` is fine — the panic already names the test, `file:line` and the underlying error (`serde_json` even reports the JSON line/column). Reach for `.expect()` only where the panic alone would not identify what broke. A backlog record proposing a blanket `.unwrap()` → `.expect()` sweep was **declined** on 2026-08-07: it bought no diagnostics that the test runner does not already print, and clippy's own `allow-unwrap-in-tests` / `allow-expect-in-tests` knobs treat both forms as idiomatic in tests.

## Documentation

All project documentation lives in `docs/`. Key files:

- [PRD.md](docs/PRD.md) — product requirements
- [architecture.md](docs/architecture.md) — system design
- [data-models.md](docs/data-models.md) — data structures and storage
- [tech-stack.md](docs/tech-stack.md) — technology choices and rationale
- [accessibility.md](docs/accessibility.md) — a11y requirements
- [implementation-phases.md](docs/implementation-phases.md) — roadmap і scope кожної фази
- [backlog/README.md](docs/backlog/README.md) — беклог; алгоритм роботи для агентів і нормований формат записів (front-matter)

**Manual testing** (`docs/testing/`):
- [test-streams.md](docs/testing/test-streams.md) — тестові URL радіо-потоків
- [nvda-profile-scoped-settings.md](docs/testing/nvda-profile-scoped-settings.md) — прогін профільних налаштувань і діалогу профілю
Чеклісти NVDA-прогону (`docs/testing/nvda-<slug>.md`) створюються для записів беклогу
з `a11y: true` і видаляються на прийманні — метод і шаблон живуть у скілі
`.claude/skills/writing-nvda-checklists/`.

## Agent skills

Конфігурація для інженерних скілів живе в [docs/agents/](docs/agents/).

### Issue tracker

Задачі живуть локальними markdown-файлами в [docs/backlog/](docs/backlog/), не в
GitHub Issues. Див. [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).

### Triage labels

Міток немає — п'ять канонічних ролей triage мапляться на поля front-matter
(`status` / `type` / `a11y` / `priority`). Див.
[docs/agents/triage-labels.md](docs/agents/triage-labels.md).

### Domain docs

Single-context: `CONTEXT.md` у корені (створюється лінькаво) + ADR-и в
[docs/decisions/](docs/decisions/) з іменами `YYYY-MM-DD-<slug>.md`. Див.
[docs/agents/domain.md](docs/agents/domain.md).
