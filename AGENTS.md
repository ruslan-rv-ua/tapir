# Tapir — Agent Guidelines

## Project State

Active development — **Phase 3** (System Tray + Stream Browser + Manager + Scheduler).
Breaking changes are expected at any time — no migrations, no backward-compatibility guarantees.
See [docs/implementation-phases.md](docs/implementation-phases.md) for the full roadmap.

| Фаза | Статус | Гілка |
|------|--------|-------|
| Phase 1 — Core Recording | ✅ Complete | `feature/refine-phase-1` |
| Phase 2A — Player subsystem | ✅ Complete | `feature/phase-2` (not yet merged) |
| Phase 2B — Wishlist + Ignorelist + Context Menu | ✅ Complete | `feature/phase-2b` |
| Phase 2C — SettingsDialog + Shortcuts | ✅ Complete | `feature/phase-2c` |
| Phase 3A — System Tray | ⬜ Not started | — |
| Phase 3B — Stream Browser | ⬜ Not started | — |
| Phase 3C — Saved Songs Manager | ⬜ Not started | — |
| Phase 3D — Scheduler | ⬜ Not started | — |
| Phase 3E–3I — Single Instance, Profiles, CLI, Post-processing, Polish | ⬜ Not started | — |

**Phase 2C SettingsDialog — що реалізовано:**
- SettingsDialog — модальний діалог з 5 табами (React Aria Tabs)
- GeneralTab — мова, тема, чекбокси, подвійний клік, поріг диску
- RecordingTab — папка записів, шаблони імен, чекбокси, мін. тривалість треку
- ReconnectionTab — 4 NumberField для конфігурації перепідключення
- HotkeysTab — 5 глобальних хоткеїв з KeyRecorder + валідація дублікатів
- AudioTab — вибір пристрою виведення (list_output_devices + set_output_device)
- useAutoSave — debounce 300ms + flush on unmount + toast при помилках
- `shortcuts.rs` — реєстрація глобальних хоткеїв через tauri-plugin-global-shortcut
- `tauri-plugin-window-state` — збереження позиції/розміру вікна
- Ctrl+, для відкриття налаштувань, кнопка ⚙️ в ActivityBar
- 52+ i18n ключів (uk + en)

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

## Documentation

All project documentation lives in `docs/`. Key files:

- [PRD.md](docs/PRD.md) — product requirements
- [architecture.md](docs/architecture.md) — system design
- [data-models.md](docs/data-models.md) — data structures and storage
- [tech-stack.md](docs/tech-stack.md) — technology choices and rationale
- [accessibility.md](docs/accessibility.md) — a11y requirements
- [implementation-phases.md](docs/implementation-phases.md) — roadmap і scope кожної фази

**Manual testing** (`docs/testing/`):
- [manual-testing-phase1.md](docs/testing/manual-testing-phase1.md) — чекліст для Phase 1
- [manual-testing-phase2-player.md](docs/testing/manual-testing-phase2-player.md) — чекліст для Phase 2 Player
- [test-streams.md](docs/testing/test-streams.md) — тестові URL радіо-потоків

**Research** (`docs/research/`):
- [research-tapir-post-v1-roadmap.md](docs/research/research-tapir-post-v1-roadmap.md) — дослідження для планування фаз
