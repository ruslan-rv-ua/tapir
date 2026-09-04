default:
    @just --list

# Start Tauri dev server (Vite + Rust watcher)
dev:
    pnpm tauri dev

# Production build — minimal exe, slow compile
build:
    @pnpm tauri build --no-bundle

# Fast build — larger exe, quick compile (uses [profile.release-fast] in Cargo.toml)
build-fast:
    @pnpm tauri build --no-bundle -- --profile release-fast

# Frontend-only dev server on port 1420
vite-dev:
    pnpm vite dev --port 1420

# Frontend-only production build to /dist
vite-build:
    pnpm vite build

# Clean Rust build artifacts
clean:
    cargo clean --manifest-path src-tauri/Cargo.toml

# Install JS dependencies
install:
    pnpm install

# All four frontend gates. Build first: `src/i18n/paraglide/` is generated and
# gitignored, and both the tests and tsc read it — on a fresh clone the other two
# have nothing to resolve `messages` against until vite has compiled it. Lint runs
# last and with `--max-warnings 0`: exhaustive-deps and a dead eslint-disable are
# warnings by rule level, and without that flag they would never fail the gate.
check:
    pnpm vite:build
    pnpm test
    pnpm typecheck
    pnpm lint

# Both backend gates. `--all-targets` reaches test code too — that is where a
# third of the lints hid before clippy was turned into a gate. The deny level
# itself lives in `src-tauri/Cargo.toml`, so no `-D warnings` here.
check-rust:
    cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
    cargo test --manifest-path src-tauri/Cargo.toml
