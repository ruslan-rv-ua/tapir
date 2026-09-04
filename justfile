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

# All three frontend gates: tests, type check, production build
check:
    pnpm test
    pnpm typecheck
    pnpm vite:build
