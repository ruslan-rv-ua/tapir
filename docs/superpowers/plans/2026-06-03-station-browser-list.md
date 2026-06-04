# Station Browser List Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn each station-browser row into a rich, screen-reader-first composite row — one focus stop per metadata value, plus icon-only Preview (listen-before-add) and Add buttons — backed by a new `preview_station` backend command.

**Architecture:** Mirror the Streams `StreamList`/`StreamItem` split: a new `StationItem.tsx` (row + `getStationSegments` helper) keeps `StationList.tsx` thin. Preview plays an arbitrary URL through a near-clone of the existing live-stream player path, tagged with a new `PlaybackSource::Preview { url, name }` so the UI can match "what is previewing". Liveness is surfaced only when problematic (`lastcheckok === 0` or a failed preview), never as a positive badge.

**Tech Stack:** Rust (Tauri v2, serde, rodio), React 19 + TypeScript, nanostores, lucide-react, Paraglide i18n, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-03-station-browser-list-design.md`

**Gates (run from repo root unless noted):**
- Frontend tests: `pnpm test`
- Frontend build (also regenerates Paraglide messages via the vite plugin): `pnpm vite:build`
- Backend tests: `cargo test` (run in `src-tauri/`)
- `tsc` is NOT a gate (~51 pre-existing untyped-Paraglide errors).

---

## Task 1: Backend — `PlaybackSource::Preview` variant

**Files:**
- Modify: `src-tauri/src/player/engine.rs` (enum ~25-30; tests ~895-901)
- Modify: `src-tauri/src/tray/menu.rs:119-146` (exhaustive match)

- [ ] **Step 1: Write the failing serde test**

In `src-tauri/src/player/engine.rs`, add after the `playback_source_file_serializes` test (currently ends ~line 901):

```rust
    #[test]
    fn playback_source_preview_serializes() {
        let src = PlaybackSource::Preview { url: "http://host/stream".into(), name: "Radio X".into() };
        let json = serde_json::to_string(&src).unwrap();
        assert!(json.contains("\"type\":\"preview\""));
        assert!(json.contains("\"url\":\"http://host/stream\""));
        assert!(json.contains("\"name\":\"Radio X\""));
        // round-trips back to the same variant
        let back: PlaybackSource = serde_json::from_str(&json).unwrap();
        assert!(matches!(back, PlaybackSource::Preview { .. }));
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml playback_source_preview_serializes`
Expected: FAIL to compile — `no variant named Preview`.

- [ ] **Step 3: Add the enum variant**

In `src-tauri/src/player/engine.rs`, extend the `PlaybackSource` enum (currently ends with the `File` arm at ~line 29):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PlaybackSource {
    #[serde(rename = "stream", rename_all = "camelCase")]
    Stream { stream_id: String },
    #[serde(rename = "file", rename_all = "camelCase")]
    File { path: String },
    #[serde(rename = "preview", rename_all = "camelCase")]
    Preview { url: String, name: String },
}
```

- [ ] **Step 4: Add the missing match arm in the tray menu**

Adding the variant breaks the exhaustive `match source` in `build_now_playing_label`. In `src-tauri/src/tray/menu.rs`, add a `Preview` arm after the `File` arm (currently ends ~line 146):

```rust
        PlaybackSource::Preview { name, .. } => {
            Some(format!("Прев'ю: {name}"))
        }
```

- [ ] **Step 5: Run backend tests to verify pass + compile**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS — the new test passes and the crate compiles (tray match is now exhaustive).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/player/engine.rs src-tauri/src/tray/menu.rs
git commit -m "feat(player): add PlaybackSource::Preview variant"
```

---

## Task 2: Backend — `preview` method + `preview_station` command

**Files:**
- Modify: `src-tauri/src/player/engine.rs` (`play_stream` ~543-843)
- Modify: `src-tauri/src/commands/player_commands.rs` (after `play_stream`, ~line 19)
- Modify: `src-tauri/src/lib.rs:160` (invoke_handler registration)

Playback opens real audio I/O and cannot run under `cargo test` in CI; the gate here is **compilation + the existing test suite staying green**. Behaviour is verified manually in Task 8.

- [ ] **Step 1: Extract the shared live-playback body into `play_live`**

In `src-tauri/src/player/engine.rs`, the method currently declared as (lines ~543-548):

```rust
    pub async fn play_stream(
        &self,
        stream_id: String,
        url: String,
        app: &AppHandle,
    ) -> Result<()> {
```

Rename it and **add** a `source` parameter, **keeping** `stream_id` (the writer task at ~line 710 still uses it to key `track-changed` / tray events):

```rust
    async fn play_live(
        &self,
        stream_id: String,
        url: String,
        source: PlaybackSource,
        app: &AppHandle,
    ) -> Result<()> {
```

- [ ] **Step 2: Use the passed source when building the session**

Still inside that method, the session is built with a hard-coded `Stream` source (currently ~line 833):

```rust
            source: PlaybackSource::Stream { stream_id: stream_id.clone() },
```

Replace that line with the parameter:

```rust
            source,
```

Leave everything else in the body unchanged — in particular the writer task's `stream_id_writer = stream_id.clone()` (~line 710) and the trailing `info!("Player: playing live stream {stream_id}")` (~line 841) both still compile, since `stream_id` remains a parameter. (For a preview, `stream_id` is empty, so `track-changed` events carry an empty id and match no profile stream — preview shows no per-track UI, which is the intended behaviour.)

- [ ] **Step 3: Add thin `play_stream` and `preview` wrappers**

Immediately after the closing `}` of `play_live` (currently ~line 843, before the `}` that closes the `impl`), add:

```rust
    pub async fn play_stream(
        &self,
        stream_id: String,
        url: String,
        app: &AppHandle,
    ) -> Result<()> {
        self.play_live(stream_id.clone(), url, PlaybackSource::Stream { stream_id }, app).await
    }

    pub async fn preview(
        &self,
        url: String,
        name: String,
        app: &AppHandle,
    ) -> Result<()> {
        let source = PlaybackSource::Preview { url: url.clone(), name };
        // Empty stream_id: a preview has no profile stream to key track events to.
        self.play_live(String::new(), url, source, app).await
    }
```

- [ ] **Step 4: Add the `preview_station` command**

In `src-tauri/src/commands/player_commands.rs`, add after the `play_stream` command (ends ~line 19):

```rust
#[tauri::command]
pub async fn preview_station(
    url: String,
    name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.player.preview(url, name, &app).await.map_err(|e| e.to_string())
}
```

- [ ] **Step 5: Register the command**

In `src-tauri/src/lib.rs`, in the `tauri::generate_handler!` list, add after `commands::player_commands::play_stream,` (line 160):

```rust
            commands::player_commands::preview_station,
```

- [ ] **Step 6: Build + run backend tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS — crate compiles, all existing tests green.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/player/engine.rs src-tauri/src/commands/player_commands.rs src-tauri/src/lib.rs
git commit -m "feat(player): preview_station command (play arbitrary URL, no recording)"
```

---

## Task 3: Frontend IPC — `previewStation` wrapper + PlayerPanel preview source

**Files:**
- Modify: `src/lib/tauri.ts:163-173`
- Modify: `src/components/player/PlayerPanel.tsx:26-35`

- [ ] **Step 1: Add the `Preview` arm to the `PlaybackSource` union**

In `src/lib/tauri.ts`, change the union (currently lines 163-166):

```ts
export type PlaybackSource =
  | { type: "stream"; streamId: string }
  | { type: "file"; path: string }
  | { type: "preview"; url: string; name: string };
```

- [ ] **Step 2: Add the `previewStation` wrapper**

In `src/lib/tauri.ts`, add next to `playStream` (after the `playStream` function, ~line 189):

```ts
export async function previewStation(url: string, name: string): Promise<void> {
  return invoke("preview_station", { url, name });
}
```

- [ ] **Step 3: Handle the preview source in PlayerPanel's label (prevents a crash)**

`useSourceLabel` currently calls `source.path.split(...)` for any non-stream source, which throws when `source` is a preview (no `path`). In `src/components/player/PlayerPanel.tsx`, update `useSourceLabel` (lines 26-35):

```ts
function useSourceLabel(): string {
  const { source } = useStore($playerStatus);
  const streams = useStore($streams);
  if (!source) return "";
  if (source.type === "stream") {
    const stream = streams.find((s) => s.id === source.streamId);
    return stream?.name ?? source.streamId;
  }
  if (source.type === "preview") return source.name;
  return source.path.split(/[\\/]/).pop() ?? source.path;
}
```

(The existing render switches on `source.type === "file"` vs else, and `=== "stream"` for track/bitrate; a preview source correctly falls through to the plain source-name block and shows the station name with no track/bitrate. No other PlayerPanel change is needed.)

- [ ] **Step 4: Build to verify types + that nothing else switches exhaustively on the union**

Run: `pnpm vite:build`
Expected: PASS (build succeeds).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tauri.ts src/components/player/PlayerPanel.tsx
git commit -m "feat(player): previewStation IPC wrapper + PlayerPanel preview label"
```

---

## Task 4: i18n — new message keys

**Files:**
- Modify: `src/i18n/messages/en.json`
- Modify: `src/i18n/messages/uk.json`

The Paraglide vite plugin regenerates `src/i18n/paraglide/messages/*` during `pnpm vite:build`. Keys must be added to **both** locale files (same set of keys) or the build warns about missing translations.

- [ ] **Step 1: Add the new keys to `uk.json`**

In `src/i18n/messages/uk.json`, add after the `"segment_metadata": "Метадані",` line (~line 254):

```json
  "segment_country": "країна",
  "segment_language": "мова",
  "segment_codec": "кодек",
  "segment_bitrate": "бітрейт",
  "segment_genre": "жанр",
  "segment_popularity": "популярність",
  "station_summary_offline": "Недоступна, {name}",
  "station_summary_previewing": "Відтворюється, {name}",
  "station_preview_play": "Прослухати {name}",
  "station_preview_stop": "Зупинити {name}",
  "station_preview_failed": "Не вдалося підключитися до {name}",
```

- [ ] **Step 2: Add the same keys to `en.json`**

In `src/i18n/messages/en.json`, add after the `"segment_metadata": "Metadata",` line (~line 254):

```json
  "segment_country": "country",
  "segment_language": "language",
  "segment_codec": "codec",
  "segment_bitrate": "bitrate",
  "segment_genre": "genre",
  "segment_popularity": "popularity",
  "station_summary_offline": "Unavailable, {name}",
  "station_summary_previewing": "Playing, {name}",
  "station_preview_play": "Listen to {name}",
  "station_preview_stop": "Stop {name}",
  "station_preview_failed": "Could not connect to {name}",
```

- [ ] **Step 3: Regenerate Paraglide output + verify build**

Run: `pnpm vite:build`
Expected: PASS — `src/i18n/paraglide/messages/` now contains the new message functions (e.g. `segment_country.js`).

- [ ] **Step 4: Commit (include regenerated Paraglide output)**

```bash
git add src/i18n/messages/en.json src/i18n/messages/uk.json src/i18n/paraglide
git commit -m "i18n: station metadata segment + preview message keys"
```

---

## Task 5: Add the new `SegmentKind`s

**Files:**
- Modify: `src/hooks/useCompositeList.ts:4-23`

- [ ] **Step 1: Extend the `SegmentKind` union**

In `src/hooks/useCompositeList.ts`, add the six per-value metadata kinds to the union. Insert after the `'metadata'` line (line 8):

```ts
  | 'metadata'
  | 'country'
  | 'language'
  | 'codec'
  | 'bitrate'
  | 'genre'
  | 'popularity'
  | 'conditions'
```

(These strings are only used as `data-segment` identities for roving focus; the spoken role comes from each segment's i18n `roleDescription`.)

- [ ] **Step 2: Verify build**

Run: `pnpm vite:build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCompositeList.ts
git commit -m "feat(browser): add per-value metadata SegmentKinds"
```

---

## Task 6: `getStationSegments` helper (TDD)

**Files:**
- Create: `src/components/browser/StationItem.tsx` (helper only for now)
- Create: `src/components/browser/StationItem.test.tsx`

- [ ] **Step 1: Write the failing unit tests**

Create `src/components/browser/StationItem.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import type { StationResult } from "../../lib/tauri";
import { getStationSegments } from "./StationItem";

const mkStation = (over: Partial<StationResult> = {}): StationResult => ({
  stationuuid: "u1",
  name: "Radio Bayraktar",
  url: "http://host/s",
  urlResolved: "http://host/s/resolved",
  codec: "MP3",
  bitrate: 128,
  country: "Ukraine",
  countrycode: "UA",
  tags: "jazz,news",
  language: "ukrainian",
  votes: 10,
  clickcount: 1200,
  hasExtendedInfo: null,
  homepage: "",
  lastcheckok: 1,
  ...over,
});

describe("getStationSegments", () => {
  it("emits one stop per present value, in order, then the two actions", () => {
    expect(getStationSegments(mkStation())).toEqual([
      "country", "language", "codec", "bitrate", "genre", "popularity",
      "action-play", "action-add",
    ]);
  });

  it("omits country when empty", () => {
    expect(getStationSegments(mkStation({ country: "" }))).not.toContain("country");
  });

  it("omits genre when tags is empty", () => {
    expect(getStationSegments(mkStation({ tags: "" }))).not.toContain("genre");
  });

  it("omits bitrate when 0 and popularity when clickcount is 0", () => {
    const segs = getStationSegments(mkStation({ bitrate: 0, clickcount: 0 }));
    expect(segs).not.toContain("bitrate");
    expect(segs).not.toContain("popularity");
  });

  it("always ends with both action stops", () => {
    const segs = getStationSegments(mkStation({ country: "", language: "", codec: "", bitrate: 0, tags: "", clickcount: 0 }));
    expect(segs).toEqual(["action-play", "action-add"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/components/browser/StationItem.test.tsx`
Expected: FAIL — cannot resolve `./StationItem` / `getStationSegments` is not exported.

- [ ] **Step 3: Create `StationItem.tsx` with the helper**

Create `src/components/browser/StationItem.tsx`:

```tsx
import type { StationResult } from "../../lib/tauri";
import type { SegmentKind } from "../../hooks/useCompositeList";

/**
 * Left/Right focus-stop order for a station row (Layout A: one stop per value).
 * Each metadata stop is included only when its value is present; the two action
 * stops are always present. Mirrors getStreamSegments.
 */
export function getStationSegments(station: StationResult): Exclude<SegmentKind, "summary">[] {
  const segments: Exclude<SegmentKind, "summary">[] = [];
  if (station.country) segments.push("country");
  if (station.language) segments.push("language");
  if (station.codec) segments.push("codec");
  if (station.bitrate) segments.push("bitrate");
  if (station.tags) segments.push("genre");
  if (station.clickcount) segments.push("popularity");
  segments.push("action-play", "action-add");
  return segments;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/components/browser/StationItem.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/browser/StationItem.tsx src/components/browser/StationItem.test.tsx
git commit -m "feat(browser): getStationSegments helper"
```

---

## Task 7: `StationItem` component (TDD)

**Files:**
- Modify: `src/components/browser/StationItem.tsx` (add the component)
- Modify: `src/components/browser/StationItem.test.tsx` (add a11y/behaviour tests)

- [ ] **Step 1: Write the failing a11y + behaviour tests**

Append to `src/components/browser/StationItem.test.tsx` (add the imports at the top of the file alongside the existing ones):

```tsx
import { render, fireEvent } from "@testing-library/react";
import { vi, beforeEach, afterEach } from "vitest";
import * as tauri from "../../lib/tauri";
import { StationItem } from "./StationItem";
import { $playerStatus } from "../../stores/player";

vi.mock("../../lib/tauri", () => ({
  previewStation: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
}));

function renderItem(over: Partial<Parameters<typeof StationItem>[0]> = {}) {
  const props = {
    station: mkStation(),
    isFocused: (seg: string) => seg === "summary",
    isActiveRow: true,
    isAdded: false,
    isUnavailable: false,
    onAdd: vi.fn(),
    onPreviewFailed: vi.fn(),
    ...over,
  };
  // isFocused is typed (segment: SegmentKind) => boolean; the cast keeps the test terse.
  const result = render(<ul><StationItem {...(props as Parameters<typeof StationItem>[0])} /></ul>);
  return { ...result, props };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null }));

describe("StationItem — accessibility structure", () => {
  it("exposes the row as a listitem named after the station and described as a station", () => {
    const { container } = renderItem();
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("role")).toBe("listitem");
    expect(li.getAttribute("aria-label")).toContain("Radio Bayraktar");
    expect(li.getAttribute("aria-roledescription")).toMatch(/станц|station/i);
  });

  it("renders one role=group stop per metadata value with a value-only label", () => {
    const { container } = renderItem();
    const country = container.querySelector('[data-segment="country"]')!;
    expect(country.getAttribute("role")).toBe("group");
    expect(country.getAttribute("aria-roledescription")).toMatch(/країн|country/i);
    expect(country.getAttribute("aria-label")).toBe("Ukraine");
    expect(container.querySelector('[data-segment="bitrate"]')!.getAttribute("aria-label")).toMatch(/128/);
  });

  it("renders preview and add as individual button focus stops", () => {
    const { container } = renderItem();
    const segs = Array.from(container.querySelectorAll("button[data-segment]")).map((b) => b.getAttribute("data-segment"));
    expect(segs).toEqual(expect.arrayContaining(["action-play", "action-add"]));
  });
});

describe("StationItem — preview button", () => {
  it("previews this station's resolved URL on click", () => {
    const { container } = renderItem();
    fireEvent.click(container.querySelector('button[data-segment="action-play"]')!);
    expect(tauri.previewStation).toHaveBeenCalledWith("http://host/s/resolved", "Radio Bayraktar");
  });

  it("shows the stop state + stops playback when this station is the active preview source", () => {
    $playerStatus.set({
      state: "playing",
      source: { type: "preview", url: "http://host/s/resolved", name: "Radio Bayraktar" },
      volume: 0.75, positionMs: null, durationMs: null,
    });
    const { container } = renderItem();
    const btn = container.querySelector('button[data-segment="action-play"]')!;
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.getAttribute("aria-label")).toMatch(/зупинити|stop/i);
    fireEvent.click(btn);
    expect(tauri.stopPlayback).toHaveBeenCalled();
  });

  it("calls onPreviewFailed when the preview connection rejects", async () => {
    (tauri.previewStation as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("connect failed"));
    const { container, props } = renderItem();
    fireEvent.click(container.querySelector('button[data-segment="action-play"]')!);
    await vi.waitFor(() => expect(props.onPreviewFailed).toHaveBeenCalled());
  });
});

describe("StationItem — add button + liveness", () => {
  it("calls onAdd when not yet added", () => {
    const { container, props } = renderItem();
    fireEvent.click(container.querySelector('button[data-segment="action-add"]')!);
    expect(props.onAdd).toHaveBeenCalled();
  });

  it("marks the add button aria-disabled and does not call onAdd when already added", () => {
    const { container, props } = renderItem({ isAdded: true });
    const btn = container.querySelector('button[data-segment="action-add"]')!;
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(btn);
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it("prefixes the summary with the unavailable clause and renders a warning marker when unavailable", () => {
    const { container } = renderItem({ isUnavailable: true });
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toMatch(/недоступна|unavailable/i);
    // One extra decorative svg (the warning icon) beyond the action-button icons.
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/components/browser/StationItem.test.tsx`
Expected: FAIL — `StationItem` is not exported.

- [ ] **Step 3: Implement the `StationItem` component**

In `src/components/browser/StationItem.tsx`, add the imports at the top (keep the existing two type imports) and append the component below `getStationSegments`:

```tsx
import type { ReactNode } from "react";
import { useStore } from "@nanostores/react";
import { Play, Square, Plus, Check, TriangleAlert, Globe, Languages, Music, Signal, Tag, Headphones } from "lucide-react";
import { CompositeRow, CompositeSegment, CompositeAction, COMPOSITE_FOCUS_RING } from "../common/composite-list";
import { $playerStatus } from "../../stores/player";
import { previewStation, stopPlayback } from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import { useAnnounce } from "../../hooks/useAnnounce";
import * as m from "../../i18n/paraglide/messages";

interface StationItemProps {
  station: StationResult;
  isFocused: (segment: SegmentKind) => boolean;
  isActiveRow: boolean;
  isAdded: boolean;
  /** lastcheckok === 0 OR a preview attempt has failed this session. */
  isUnavailable: boolean;
  onAdd: () => void;
  onPreviewFailed: () => void;
}

export function StationItem({
  station,
  isFocused,
  isActiveRow,
  isAdded,
  isUnavailable,
  onAdd,
  onPreviewFailed,
}: StationItemProps) {
  const playerStatus = useStore($playerStatus);
  const announce = useAnnounce();
  const resolved = station.urlResolved || station.url;
  const isPreviewing =
    playerStatus.state !== "stopped" &&
    playerStatus.source?.type === "preview" &&
    playerStatus.source.url === resolved;

  const handlePreviewToggle = async () => {
    if (isPreviewing) {
      try {
        await stopPlayback();
      } catch (err) {
        addToast(String(err), "error");
      }
      return;
    }
    try {
      await previewStation(resolved, station.name);
    } catch (err) {
      addToast(String(err), "error");
      announce(m.station_preview_failed({ name: station.name }), "polite");
      onPreviewFailed();
    }
  };

  // Down-scan summary: name + country + genre, with a state prefix when relevant.
  const summaryMeta = [station.country, station.tags].filter(Boolean).join(", ");
  const summaryName = summaryMeta ? `${station.name}, ${summaryMeta}` : station.name;
  const summaryLabel = isPreviewing
    ? m.station_summary_previewing({ name: summaryName })
    : isUnavailable
      ? m.station_summary_offline({ name: summaryName })
      : summaryName;

  const previewLabel = isPreviewing
    ? m.station_preview_stop({ name: station.name })
    : m.station_preview_play({ name: station.name });
  const addLabel = isAdded ? m.browser_added() : m.add_stream();

  const metaCells: {
    kind: Exclude<SegmentKind, "summary">;
    show: boolean;
    icon: ReactNode;
    role: string;
    value: string;
  }[] = [
    { kind: "country",    show: !!station.country,    icon: <Globe size={12} aria-hidden />,      role: m.segment_country(),    value: station.country },
    { kind: "language",   show: !!station.language,   icon: <Languages size={12} aria-hidden />,  role: m.segment_language(),   value: station.language },
    { kind: "codec",      show: !!station.codec,      icon: <Music size={12} aria-hidden />,      role: m.segment_codec(),      value: station.codec },
    { kind: "bitrate",    show: !!station.bitrate,    icon: <Signal size={12} aria-hidden />,     role: m.segment_bitrate(),    value: `${station.bitrate} kbps` },
    { kind: "genre",      show: !!station.tags,       icon: <Tag size={12} aria-hidden />,        role: m.segment_genre(),      value: station.tags },
    { kind: "popularity", show: !!station.clickcount, icon: <Headphones size={12} aria-hidden />, role: m.segment_popularity(), value: String(station.clickcount) },
  ];

  return (
    <CompositeRow
      itemId={station.stationuuid}
      isFocused={isFocused}
      isActiveRow={isActiveRow}
      label={summaryLabel}
      roleDescription={m.item_role_station()}
      className="border-b border-slate-800 px-3 py-2 forced-colors:border-[ButtonText]"
      activeClassName="bg-slate-800/60"
    >
      {/* Line 1: name + action buttons */}
      <div className="flex items-center gap-2">
        {isUnavailable && (
          <TriangleAlert size={14} aria-hidden className="shrink-0 text-amber-500 forced-colors:text-[Highlight]" />
        )}
        <span
          className={`truncate font-medium ${
            isUnavailable ? "text-slate-400 line-through decoration-slate-600" : "text-slate-100"
          }`}
        >
          {station.name}
        </span>
        <div className="ml-auto flex shrink-0 gap-1">
          <CompositeAction
            itemId={station.stationuuid}
            segment="action-play"
            isFocused={isFocused}
            ariaPressed={isPreviewing}
            onClick={handlePreviewToggle}
            label={previewLabel}
            title={previewLabel}
            className={`inline-flex items-center justify-center rounded-md p-1.5 ${
              isPreviewing
                ? "bg-blue-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
                : "bg-slate-700 text-slate-200 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
            }`}
          >
            {isPreviewing ? <Square size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          </CompositeAction>
          <button
            type="button"
            data-item-id={station.stationuuid}
            data-segment="action-add"
            tabIndex={isFocused("action-add") ? 0 : -1}
            aria-disabled={isAdded || undefined}
            aria-label={addLabel}
            title={addLabel}
            onClick={() => {
              if (!isAdded) onAdd();
            }}
            className={`inline-flex items-center justify-center rounded-md p-1.5 ${COMPOSITE_FOCUS_RING} ${
              isAdded
                ? "cursor-not-allowed text-emerald-400"
                : "bg-blue-600 text-white hover:bg-blue-700 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
            }`}
          >
            {isAdded ? <Check size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
          </button>
        </div>
      </div>

      {/* Line 2: per-value metadata stops */}
      <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-slate-400">
        {metaCells
          .filter((c) => c.show)
          .map((c) => (
            <CompositeSegment
              key={c.kind}
              itemId={station.stationuuid}
              segment={c.kind}
              isFocused={isFocused}
              label={c.value}
              roleDescription={c.role}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
            >
              <span className="text-slate-500">{c.icon}</span>
              <span>{c.value}</span>
            </CompositeSegment>
          ))}
      </div>
    </CompositeRow>
  );
}
```

- [ ] **Step 4: Run the StationItem tests to verify pass**

Run: `pnpm test src/components/browser/StationItem.test.tsx`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/components/browser/StationItem.tsx src/components/browser/StationItem.test.tsx
git commit -m "feat(browser): StationItem row with per-value stops + preview/add"
```

---

## Task 8: Wire `StationList` to `StationItem`

**Files:**
- Modify: `src/components/browser/StationList.tsx` (full rewrite of the body)

- [x] **Step 1: Rewrite `StationList.tsx` to render `StationItem`**

Replace the entire contents of `src/components/browser/StationList.tsx` with:

```tsx
import { forwardRef, useCallback, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { $streams } from "../../stores/streams";
import { addStation } from "../../stores/browser";
import { CompositeList } from "../common/composite-list";
import { ListCardState } from "../common/ListCard";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { StationResult } from "../../lib/tauri";
import { useAnnounce } from "../../hooks/useAnnounce";
import { addToast } from "../../stores/toasts";
import { StationItem, getStationSegments } from "./StationItem";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  stations: StationResult[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore?: () => void;
  emptyMessage: string;
  exitZone: (forward: boolean) => void;
}

export const StationList = forwardRef<ZoneEntry, Props>(
  ({ stations, loading, error, hasMore, onLoadMore, emptyMessage, exitZone }, ref) => {
    const streams = useStore($streams);
    const announce = useAnnounce();
    const [failedPreview, setFailedPreview] = useState<Set<string>>(new Set());

    const existingUrls = useMemo(() => new Set(streams.map((s) => s.url)), [streams]);
    const isAlreadyAdded = useCallback(
      (station: StationResult) => existingUrls.has(station.urlResolved || station.url),
      [existingUrls],
    );

    const items = useMemo(
      () => stations.map((s) => ({ id: s.stationuuid, segments: getStationSegments(s) })),
      [stations],
    );

    const handleAdd = useCallback(
      async (station: StationResult) => {
        if (isAlreadyAdded(station)) return;
        try {
          await addStation(station);
          announce(m.browser_station_added({ name: station.name }), "polite");
        } catch (err) {
          addToast(String(err), "error");
        }
      },
      [isAlreadyAdded, announce],
    );

    const markPreviewFailed = useCallback((id: string) => {
      setFailedPreview((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }, []);

    return (
      <CompositeList
        ref={ref}
        zoneId="browser-results"
        ariaLabel={m.zone_browser_results()}
        items={items}
        className="flex-1 overflow-auto"
        onTabOut={exitZone}
        loading={
          loading ? (
            <ListCardState role="status" aria-live="polite" className="text-slate-400">
              {m.browser_loading()}
            </ListCardState>
          ) : undefined
        }
        error={error ? <ListCardState role="alert" className="text-red-400">{error}</ListCardState> : undefined}
        empty={<ListCardState role="status">{emptyMessage}</ListCardState>}
        footer={
          hasMore && onLoadMore ? (
            <li>
              <button onClick={onLoadMore} className="w-full py-2 text-sm text-slate-400 hover:bg-slate-800">
                {m.browser_load_more()}
              </button>
            </li>
          ) : undefined
        }
        // Enter on the whole-row summary adds the station (primary action).
        onAction={(type, itemId, segment) => {
          if (type !== "primary" || segment !== "summary") return;
          const station = stations.find((s) => s.stationuuid === itemId);
          if (station) void handleAdd(station);
        }}
        renderRow={({ id, isActive, isFocused }) => {
          const station = stations.find((s) => s.stationuuid === id)!;
          return (
            <StationItem
              key={id}
              station={station}
              isFocused={isFocused}
              isActiveRow={isActive}
              isAdded={isAlreadyAdded(station)}
              isUnavailable={station.lastcheckok === 0 || failedPreview.has(id)}
              onAdd={() => void handleAdd(station)}
              onPreviewFailed={() => markPreviewFailed(id)}
            />
          );
        }}
      />
    );
  },
);
StationList.displayName = "StationList";
```

- [x] **Step 2: Run the full frontend test suite**

Run: `pnpm test`
Expected: PASS — StationItem tests green; existing `CompositeList.test.tsx`, `StreamItem.test.tsx`, etc. unaffected.
(Done: 181 passed. Also fixed a stale assertion in `StreamItem.test.tsx` left by commit `337d2f8` — the `segment_tech` role description had been renamed to "bitrate".)

- [x] **Step 3: Build**

Run: `pnpm vite:build`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/components/browser/StationList.tsx
git commit -m "feat(browser): use StationItem in StationList with per-row liveness"
```

- [ ] **Step 5: Manual verification (NVDA + playback)**

Run: `pnpm tauri dev`
Verify:
1. Open the Station browser, run a search (or use the popular list).
2. With NVDA on, Down-arrow through rows — each announces "{name}, {country}, {genre}" + "станція". Right-arrow drills through country → language → codec → bitrate → genre → popularity → preview → add, each announcing its value + role.
3. Press the Preview (▶) button on a live station — audio plays; the button flips to Stop (■, `aria-pressed`); the player bar shows the station name. Press again — playback stops.
4. Preview a known-dead station (or disconnect network) — a toast + NVDA announcement fire and the row gains the ⚠ marker + "Недоступна" summary prefix.
5. Press Add (＋) — the station is added; the button becomes ✓ and `aria-disabled`.

---

## Self-Review notes (already reconciled)

- **Spec coverage:** per-value stops (T5–T7), `getStationSegments` (T6), preview backend (T1–T2), IPC + player label (T3), liveness marker only-when-problematic (T7–T8), i18n (T4), tests (T6–T7), `connection::connect` reuse seam — preserved implicitly (`play_live` shares the connect path; no new probing). Bulk-check / m3u import remain out of scope.
- **Deferred from the spec (conscious, low-risk):** decorative per-segment icons ARE included (Globe/Languages/Music/Signal/Tag/Headphones); the country flag emoji is omitted (visual-only polish, needs a codepoint helper); `votes` is not folded into the popularity label (popularity shows `clickcount` only) — add later if wanted.
- **Type consistency:** `previewStation(url, name)` / `PlaybackSource::Preview { url, name }` / `{ type: "preview"; url; name }` agree across Rust, `tauri.ts`, store, and component. `getStationSegments` returns exactly the kinds added to `SegmentKind` in T5. Preview match `source.url === resolved` uses the same `urlResolved || url` fallback the backend stores.
```
