# Configurable Log Level + Diagnostics Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user choose the log verbosity (and finish wiring the already-declared but dead `log_rotation` / `log_max_size_mb` settings) from the General settings tab.

**Architecture:** Add a `LogLevel` enum + `log_level` field to the Rust `GlobalSettings`; load settings once before building the `tauri-plugin-log` plugin and configure level/rotation/max-size from them; expose a simple "detailed logging" checkbox plus a collapsible "Advanced" block in the React General tab, backed by a tiny pure helper module. Level/rotation/size apply on next launch (the plugin builds once at startup).

**Tech Stack:** Rust (Tauri v2, `tauri-plugin-log` 2.8, serde), React 19 + react-aria-components, nanostores, Inlang/Paraglide i18n, vitest.

**Spec:** [docs/superpowers/specs/2026-05-30-configurable-log-level-design.md](../specs/2026-05-30-configurable-log-level-design.md)

---

## File Structure

- `src-tauri/src/settings.rs` — add `LogLevel` enum (+ `to_filter`), `log_level` field, default, and unit tests. (Data model — owns the new type.)
- `src-tauri/src/lib.rs` — reorder `run()` so settings load before the plugin builder; add `rotation_strategy_for` helper (+ test) and configure the plugin from settings.
- `src/lib/logLevel.ts` — **new**: `LogLevel` union type + pure `isVerbose` / `toggleVerbose` helpers (single source of truth for the toggle↔level mapping).
- `src/lib/logLevel.test.ts` — **new**: vitest tests for the helpers.
- `src/lib/tauri.ts` — add `logLevel` to the `GlobalSettings` interface (importing the type from `logLevel.ts`).
- `src/components/settings/GeneralTab.tsx` — add the "Logging" section (verbose checkbox + Advanced `<details>`).
- `src/i18n/messages/en.json`, `src/i18n/messages/uk.json` — new message keys.
- `docs/data-models.md` — document the new `logLevel` field.

---

## Task 1: Rust `LogLevel` enum + `log_level` field

**Files:**
- Modify: `src-tauri/src/settings.rs`
- Test: `src-tauri/src/settings.rs` (inline `#[cfg(test)] mod tests`)

- [ ] **Step 1: Write the failing tests**

Append to the end of `src-tauri/src/settings.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_level_default_is_info() {
        assert_eq!(LogLevel::default(), LogLevel::Info);
    }

    #[test]
    fn log_level_to_filter_maps_each_variant() {
        assert_eq!(LogLevel::Error.to_filter(), log::LevelFilter::Error);
        assert_eq!(LogLevel::Warn.to_filter(), log::LevelFilter::Warn);
        assert_eq!(LogLevel::Info.to_filter(), log::LevelFilter::Info);
        assert_eq!(LogLevel::Debug.to_filter(), log::LevelFilter::Debug);
        assert_eq!(LogLevel::Trace.to_filter(), log::LevelFilter::Trace);
    }

    #[test]
    fn settings_without_log_level_defaults_to_info() {
        // An existing settings.json that predates this field must still load.
        let json = r#"{ "language": "en-US", "theme": "auto", "activeProfile": "Default" }"#;
        let settings: GlobalSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.log_level, LogLevel::Info);
    }

    #[test]
    fn log_level_serde_round_trip() {
        let mut s = GlobalSettings::default();
        s.log_level = LogLevel::Trace;
        let json = serde_json::to_string(&s).unwrap();
        let back: GlobalSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.log_level, LogLevel::Trace);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml log_level`
Expected: FAIL to compile — `cannot find type LogLevel` / `no field log_level`.

- [ ] **Step 3: Add the enum**

In `src-tauri/src/settings.rs`, after the `DoubleClickAction` enum (around line 59), insert:

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Error,
    Warn,
    #[default]
    Info,
    Debug,
    Trace,
}

impl LogLevel {
    pub fn to_filter(self) -> log::LevelFilter {
        match self {
            LogLevel::Error => log::LevelFilter::Error,
            LogLevel::Warn => log::LevelFilter::Warn,
            LogLevel::Info => log::LevelFilter::Info,
            LogLevel::Debug => log::LevelFilter::Debug,
            LogLevel::Trace => log::LevelFilter::Trace,
        }
    }
}
```

- [ ] **Step 4: Add the field to `GlobalSettings`**

In the `GlobalSettings` struct, after the `log_max_size_mb` field (line 41), add:

```rust
    #[serde(default)]
    pub log_level: LogLevel,
```

- [ ] **Step 5: Add the field to the `Default` impl**

In `impl Default for GlobalSettings`, after `log_max_size_mb: 10,` (line 111), add:

```rust
            log_level: LogLevel::Info,
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml log_level`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/settings.rs
git commit -m "feat(settings): add LogLevel enum and log_level field

Defaults to Info; backward-compatible via serde(default).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Wire the plugin from settings in `lib.rs`

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/lib.rs` (inline `#[cfg(test)] mod tests`)

- [ ] **Step 1: Write the failing test for the rotation mapping**

Append to the end of `src-tauri/src/lib.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotation_true_keeps_one_false_keeps_all() {
        // log_rotation == true preserves the current bounded-disk behavior (KeepOne).
        assert!(matches!(rotation_strategy_for(true), RotationStrategy::KeepOne));
        assert!(matches!(rotation_strategy_for(false), RotationStrategy::KeepAll));
    }
}
```

(Note: `RotationStrategy` derives only `Clone`/`Debug`, so the test must use `matches!`, not `assert_eq!`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml rotation_true_keeps_one`
Expected: FAIL to compile — `cannot find function rotation_strategy_for`.

- [ ] **Step 3: Add the `rotation_strategy_for` helper**

In `src-tauri/src/lib.rs`, add this free function just above `pub fn run()` (after the `use` lines, around line 22):

```rust
/// Maps the user's `log_rotation` toggle to a plugin rotation strategy.
/// `true` (default) keeps disk bounded (KeepOne, == previous behavior);
/// `false` keeps the full timestamped history (KeepAll).
fn rotation_strategy_for(keep_recycling: bool) -> RotationStrategy {
    if keep_recycling {
        RotationStrategy::KeepOne
    } else {
        RotationStrategy::KeepAll
    }
}
```

- [ ] **Step 4: Reorder `run()` and configure the plugin from settings**

Replace the start of `run()` — from `pub fn run() {` through the end of the log plugin `.plugin(...)` block (current lines 23–38) — with:

```rust
pub fn run() {
    // Create data dirs before anything reads/writes them: the log plugin targets
    // logs_dir() and GlobalSettings::load() may write default settings.json.
    portable::ensure_data_dirs().expect("Failed to create data directories");

    // Load settings once, before the builder, so the log plugin (which is built
    // at startup and cannot change afterwards) reflects the user's choices.
    let initial_settings = GlobalSettings::load().expect("Failed to load settings");

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(initial_settings.log_level.to_filter())
                .max_file_size(initial_settings.log_max_size_mb as u128 * 1_048_576)
                .rotation_strategy(rotation_strategy_for(initial_settings.log_rotation))
                .targets([
                    Target::new(TargetKind::Folder {
                        path: portable::logs_dir(),
                        file_name: Some("tapir".into()),
                    }),
                    Target::new(TargetKind::Stdout),
                ])
                .build(),
        )
```

- [ ] **Step 5: Move `initial_settings` into setup and drop the duplicate load**

The `.setup(|app| {` closure (current line 43) must become `move` and reuse `initial_settings`.

Change the closure signature:

```rust
        .setup(move |app| {
```

Inside that closure, **remove** the now-duplicate dir-creation and settings-load lines (current lines 44–45 and 59):

```rust
            portable::ensure_data_dirs()
                .expect("Failed to create data directories");
```
```rust
            let settings = GlobalSettings::load().expect("Failed to load settings");
```

Replace the removed `let settings = ...` line with:

```rust
            let settings = initial_settings;
```

(Keep the line that follows: `let profile = Profile::load(&settings.active_profile)...`. The window show/focus block and everything after stay unchanged.)

- [ ] **Step 6: Run the rotation test + full build**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (all settings tests + `rotation_true_keeps_one_false_keeps_all`), and the crate compiles (no unused-variable or move errors).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(log): drive log level, rotation and max size from settings

Load settings before building tauri-plugin-log and map log_rotation to a
RotationStrategy. ensure_data_dirs now runs before the plugin so logs_dir
and settings.json exist. Takes effect on next launch.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Frontend log-level helper module

**Files:**
- Create: `src/lib/logLevel.ts`
- Test: `src/lib/logLevel.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/logLevel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isVerbose, toggleVerbose } from "./logLevel";

describe("isVerbose", () => {
  it("is true for debug and trace", () => {
    expect(isVerbose("debug")).toBe(true);
    expect(isVerbose("trace")).toBe(true);
  });
  it("is false for info, warn, error", () => {
    expect(isVerbose("info")).toBe(false);
    expect(isVerbose("warn")).toBe(false);
    expect(isVerbose("error")).toBe(false);
  });
});

describe("toggleVerbose", () => {
  it("turning on a non-verbose level yields debug", () => {
    expect(toggleVerbose("info", true)).toBe("debug");
    expect(toggleVerbose("error", true)).toBe("debug");
  });
  it("turning on preserves an already-verbose trace level", () => {
    expect(toggleVerbose("trace", true)).toBe("trace");
  });
  it("turning off yields info", () => {
    expect(toggleVerbose("debug", false)).toBe("info");
    expect(toggleVerbose("trace", false)).toBe("info");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/logLevel.test.ts`
Expected: FAIL — cannot resolve `./logLevel`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/logLevel.ts`:

```ts
export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

/** True when the level produces verbose diagnostic output (debug or trace). */
export function isVerbose(level: LogLevel): boolean {
  return level === "debug" || level === "trace";
}

/**
 * Next log level when the "detailed logging" checkbox is toggled.
 * Turning it on bumps to `debug` (leaving an already-verbose `trace` alone);
 * turning it off resets to `info`.
 */
export function toggleVerbose(level: LogLevel, on: boolean): LogLevel {
  if (on) return isVerbose(level) ? level : "debug";
  return "info";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/logLevel.test.ts`
Expected: PASS (2 suites, 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/logLevel.ts src/lib/logLevel.test.ts
git commit -m "feat(ui): add log-level verbose toggle helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: i18n message keys

**Files:**
- Modify: `src/i18n/messages/en.json`
- Modify: `src/i18n/messages/uk.json`

- [ ] **Step 1: Add English keys**

In `src/i18n/messages/en.json`, after the `"settings_disk_threshold_desc": ...` line (line 187), insert:

```json
  "settings_logging": "Logging",
  "settings_log_verbose": "Detailed logging for diagnostics",
  "settings_log_verbose_desc": "Helps the developer find the cause of a problem. Takes effect after restart.",
  "settings_log_advanced": "Advanced",
  "settings_log_level": "Log level",
  "settings_log_level_error": "Error",
  "settings_log_level_warn": "Warning",
  "settings_log_level_info": "Info",
  "settings_log_level_debug": "Debug",
  "settings_log_level_trace": "Trace",
  "settings_log_keep_history": "Keep full log history",
  "settings_log_max_size": "Max log file size (MB)",
```

- [ ] **Step 2: Add Ukrainian keys**

In `src/i18n/messages/uk.json`, after the `"settings_disk_threshold_desc": ...` line (line 187), insert:

```json
  "settings_logging": "Логування",
  "settings_log_verbose": "Детальне логування для діагностики",
  "settings_log_verbose_desc": "Допомагає розробнику знайти причину збою. Діє після перезапуску.",
  "settings_log_advanced": "Додатково",
  "settings_log_level": "Рівень логування",
  "settings_log_level_error": "Помилки",
  "settings_log_level_warn": "Попередження",
  "settings_log_level_info": "Інформація",
  "settings_log_level_debug": "Зневадження",
  "settings_log_level_trace": "Трасування",
  "settings_log_keep_history": "Зберігати всю історію логів",
  "settings_log_max_size": "Макс. розмір файлу логу (МБ)",
```

- [ ] **Step 3: Verify JSON is valid and messages generate**

Run: `pnpm vite:build`
Expected: build succeeds; Paraglide compiles the new `settings_log_*` message functions without "unknown message" errors. (This regenerates `src/i18n/paraglide/messages`.)

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/uk.json
git commit -m "feat(i18n): add logging settings strings (en, uk)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Settings UI — `logLevel` type + General tab section

**Files:**
- Modify: `src/lib/tauri.ts:69-84`
- Modify: `src/components/settings/GeneralTab.tsx`

- [ ] **Step 1: Add `logLevel` to the `GlobalSettings` interface**

In `src/lib/tauri.ts`, add this import near the top of the file (with the other imports):

```ts
import type { LogLevel } from "./logLevel";
```

Then in the `GlobalSettings` interface, after `logMaxSizeMb: number;` (line 83), add:

```ts
  logLevel: LogLevel;
```

- [ ] **Step 2: Import the helpers in `GeneralTab.tsx`**

In `src/components/settings/GeneralTab.tsx`, after the existing `import type { GlobalSettings } from "../../lib/tauri";` line (line 21), add:

```ts
import { isVerbose, toggleVerbose } from "../../lib/logLevel";
```

- [ ] **Step 3: Add the Logging section**

In `src/components/settings/GeneralTab.tsx`, inside the outer `<div className="space-y-6">`, immediately **after** the closing `</NumberField>` of the Disk-threshold field (line 203) and **before** the closing `</div>` (line 204), insert:

```tsx
      {/* Logging */}
      <div className="space-y-3 border-t border-slate-700 pt-4">
        <h3 className="text-sm font-semibold text-slate-200">
          {m.settings_logging()}
        </h3>

        {/* Verbose toggle (simple) */}
        <Checkbox
          isSelected={isVerbose(settings.logLevel)}
          onChange={(val) =>
            update({ logLevel: toggleVerbose(settings.logLevel, val) })
          }
          className="flex items-start gap-2 text-sm text-slate-300"
        >
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-600 bg-slate-700">
            {isVerbose(settings.logLevel) && <span>✓</span>}
          </div>
          <span>
            <Label>{m.settings_log_verbose()}</Label>
            <span className="mt-1 block text-xs text-slate-500">
              {m.settings_log_verbose_desc()}
            </span>
          </span>
        </Checkbox>

        {/* Advanced (full control) */}
        <details className="rounded border border-slate-700">
          <summary className="cursor-pointer px-3 py-2 text-sm text-slate-300 outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
            {m.settings_log_advanced()}
          </summary>
          <div className="space-y-4 px-3 pb-3 pt-1">
            {/* Log level */}
            <Select
              selectedKey={settings.logLevel}
              onSelectionChange={(key) =>
                update({ logLevel: key as GlobalSettings["logLevel"] })
              }
            >
              <Label className="block text-sm font-medium text-slate-300">
                {m.settings_log_level()}
              </Label>
              <Button className="mt-1 flex w-48 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400">
                <SelectValue />
                <span aria-hidden="true">▼</span>
              </Button>
              <Popover className="w-48 rounded border border-slate-600 bg-slate-700 shadow-lg">
                <ListBox className="outline-none">
                  <ListBoxItem
                    id="error"
                    className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
                  >
                    {m.settings_log_level_error()}
                  </ListBoxItem>
                  <ListBoxItem
                    id="warn"
                    className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
                  >
                    {m.settings_log_level_warn()}
                  </ListBoxItem>
                  <ListBoxItem
                    id="info"
                    className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
                  >
                    {m.settings_log_level_info()}
                  </ListBoxItem>
                  <ListBoxItem
                    id="debug"
                    className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
                  >
                    {m.settings_log_level_debug()}
                  </ListBoxItem>
                  <ListBoxItem
                    id="trace"
                    className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600"
                  >
                    {m.settings_log_level_trace()}
                  </ListBoxItem>
                </ListBox>
              </Popover>
            </Select>

            {/* Keep full history (inverted log_rotation) */}
            <Checkbox
              isSelected={!settings.logRotation}
              onChange={(val) => update({ logRotation: !val })}
              className="flex items-center gap-2 text-sm text-slate-300"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">
                {!settings.logRotation && <span>✓</span>}
              </div>
              <Label>{m.settings_log_keep_history()}</Label>
            </Checkbox>

            {/* Max file size */}
            <NumberField
              value={settings.logMaxSizeMb}
              onChange={(val) => {
                if (!Number.isNaN(val)) update({ logMaxSizeMb: val });
              }}
              minValue={1}
              maxValue={100}
              step={1}
            >
              <Label className="block text-sm font-medium text-slate-300">
                {m.settings_log_max_size()}
              </Label>
              <Group className="mt-1 flex w-32">
                <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
              </Group>
            </NumberField>
          </div>
        </details>
      </div>
```

(All components used — `Checkbox`, `Label`, `Select`, `SelectValue`, `ListBox`, `ListBoxItem`, `Popover`, `Button`, `NumberField`, `Input`, `Group` — are already imported at the top of `GeneralTab.tsx`. No new react-aria imports needed.)

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm vite:build`
Expected: build succeeds with no TypeScript errors (the `logLevel` field, `LogLevel` type, helper imports, and message functions all resolve).

- [ ] **Step 5: Run the full frontend test suite**

Run: `pnpm test`
Expected: PASS (existing suites + `logLevel.test.ts`), no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tauri.ts src/components/settings/GeneralTab.tsx
git commit -m "feat(ui): add logging section to General settings tab

Verbose toggle on top, full level/rotation/size controls in an Advanced
disclosure. logLevel is the single source of truth.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Document the new field

**Files:**
- Modify: `docs/data-models.md`

- [ ] **Step 1: Add `logLevel` to the JSON examples**

In `docs/data-models.md`, each line that reads `"logRotation": true,` (there are two, around lines 56 and 900) — add directly **below** it:

```json
  "logLevel": "info",
```

- [ ] **Step 2: Add `logLevel` to the TypeScript snippet**

The line `logRotation: boolean;` (around line 77) — add directly **below** it:

```ts
  logLevel: "error" | "warn" | "info" | "debug" | "trace";
```

- [ ] **Step 3: Add `log_level` to the Rust snippets**

Each line that reads `pub log_rotation: bool,` (around lines 108 and 968) — add directly **below** it:

```rust
    pub log_level: LogLevel,
```

- [ ] **Step 4: Commit**

```bash
git add docs/data-models.md
git commit -m "docs(data-models): document logLevel setting

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full Rust test + build**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all tests PASS, crate compiles clean.

- [ ] **Step 2: Full frontend test + build**

Run: `pnpm test` then `pnpm vite:build`
Expected: both PASS.

- [ ] **Step 3: Manual smoke test (requires a desktop session)**

Run: `pnpm dev`
Then:
1. Open Settings → General → Logging.
2. Tick "Detailed logging for diagnostics", close the app, relaunch, and confirm `data/logs/tapir.log` now contains `DEBUG` lines (was `INFO`).
3. Open Advanced, pick a level explicitly (e.g. Error), confirm the verbose checkbox unticks; pick Trace, confirm it ticks.
4. Confirm `data/settings.json` contains `"logLevel": ...` reflecting the choice.

Expected: behavior matches; no console errors. (Skip this step in headless/CI contexts and note it as unrun.)
