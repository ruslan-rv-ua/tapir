# Copy Stream URL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Copy URL" for the focused stream — via a context-menu item and a list-scoped Ctrl+C — copying `StreamInfo.url` to the clipboard.

**Architecture:** Ctrl+C is handled inside `useCompositeList` (list-scoped, like Delete), emitting a generic `"copy"` action that `StreamList` maps to copying the row's URL via a shared `copyStreamUrl` helper (`navigator.clipboard.writeText` + toast + a11y announce). The same helper backs a new `StreamContextMenu` item. The combo is registered in `shortcuts.ts` as a `list`-group entry **without** `match` — F1-help + KeyRecorder reserved guard only — so it is never centrally dispatched (which would hijack Ctrl+C in text fields).

**Tech Stack:** React + TypeScript, react-aria-components, nanostores, paraglide i18n, Vitest + Testing Library, Tauri v2 (WebView2).

**Spec:** [docs/superpowers/specs/2026-06-14-copy-stream-url-design.md](../specs/2026-06-14-copy-stream-url-design.md)

**Gates (per project):** `pnpm test` and `pnpm vite:build` must be green. Do NOT rely on `tsc` (≈51 pre-existing untyped-paraglide errors).

---

## File map

- `src/i18n/messages/en.json`, `src/i18n/messages/uk.json` — new keys `copy_url`, `stream_url_copied` (regenerated into `src/i18n/paraglide/`).
- `src/hooks/useCompositeList.ts` — extend `ActionType` with `"copy"`; add Ctrl+C branch + trigger comment.
- `src/hooks/useCompositeList.test.tsx` — tests for the `"copy"` action.
- `src/components/streams/StreamContextMenu.tsx` — `onCopyUrl` prop + "Copy URL" `MenuItem` + handler case.
- `src/components/streams/StreamContextMenu.test.tsx` — mock + menu-item test.
- `src/components/streams/StreamItem.tsx` — thread `onCopyUrl` prop to the menu.
- `src/components/streams/StreamList.tsx` — `copyStreamUrl` helper, handle `"copy"` in `onAction`, pass `onCopyUrl`.
- `src/components/streams/StreamList.test.tsx` — clipboard mock + Ctrl+C and menu integration tests.
- `src/lib/shortcuts.ts` — reserved `copy-url` list entry.
- `src/lib/reservedShortcuts.test.ts` — new test: reserved + not centrally dispatched.
- `docs/decisions/2026-06-07-shortcut-configurability-asymmetry.md` — one trigger line for the list axis.

---

## Task 1: i18n messages

**Files:**
- Modify: `src/i18n/messages/en.json:110-118`
- Modify: `src/i18n/messages/uk.json:110-118`

- [ ] **Step 1: Add the English keys**

In `src/i18n/messages/en.json`, add `copy_url` immediately after the `copy_to_profile` line (110), and `stream_url_copied` immediately after the `stream_copied_to_profile` line (118):

```json
  "copy_url": "Copy URL",
```
```json
  "stream_url_copied": "Copied URL of “{name}”",
```

- [ ] **Step 2: Add the Ukrainian keys**

In `src/i18n/messages/uk.json`, add the same keys in the same positions:

```json
  "copy_url": "Копіювати URL",
```
```json
  "stream_url_copied": "Адресу «{name}» скопійовано",
```

- [ ] **Step 3: Regenerate paraglide + verify build**

Run: `pnpm vite:build`
Expected: build succeeds; the paraglide vite plugin regenerates `src/i18n/paraglide/` so `m.copy_url` and `m.stream_url_copied` now exist.

- [ ] **Step 4: Commit**

```bash
git add src/i18n
git commit -m "$(cat <<'EOF'
i18n(streams): add copy_url + stream_url_copied messages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `useCompositeList` — generic `"copy"` action on Ctrl+C

**Files:**
- Modify: `src/hooks/useCompositeList.ts:34` (ActionType), `:260-266` (insert branch after the no-active guard)
- Test: `src/hooks/useCompositeList.test.tsx` (add to the `describe("activation keys", …)` block)

- [ ] **Step 1: Write the failing tests**

In `src/hooks/useCompositeList.test.tsx`, inside `describe("activation keys", …)`, add after the existing `"Delete fires delete; bare F10…"` test:

```ts
  it("Ctrl+C fires copy for the active row", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");
    press("c", { code: "KeyC", ctrlKey: true });
    expect(onAction).toHaveBeenCalledWith("copy", "a", "summary", { shift: false, ctrl: true });
  });

  it("Ctrl+C with no active item does nothing", () => {
    const onAction = vi.fn();
    render(<Harness items={[]} onAction={onAction} />);
    press("c", { code: "KeyC", ctrlKey: true });
    expect(onAction).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/hooks/useCompositeList.test.tsx`
Expected: FAIL — `"Ctrl+C fires copy…"` fails because `onAction` is never called with `"copy"` (TS also flags `"copy"` as not assignable to `ActionType`).

- [ ] **Step 3: Extend the action type**

In `src/hooks/useCompositeList.ts`, line 34, change:

```ts
export type ActionType = 'primary' | 'toggle' | 'delete';
```

to:

```ts
export type ActionType = 'primary' | 'toggle' | 'delete' | 'copy';
```

- [ ] **Step 4: Add the Ctrl+C branch**

In `src/hooks/useCompositeList.ts`, inside `onKeyDownCapture`, immediately AFTER the no-active-item guard block (the `if (!activeItemId) { … return; }` ending at line 266) and BEFORE `const currentIdx = …`, insert:

```ts
      // Ctrl/Cmd+C → generic "copy" for the active row; the consumer (e.g. StreamList)
      // decides what to copy. e.code, not e.key — Cyrillic layouts (accessibility.md §12).
      // List-scoped on purpose: a registry "match" would hijack Ctrl+C in text fields
      // across the whole section.
      // REFACTOR TRIGGER: 2 hardcoded list key→action mappings now (Delete, Ctrl+C).
      // On a 3rd/4th, replace this if/switch scatter with a key→actionType table.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === "KeyC") {
        consume();
        onActionRef.current("copy", activeItemId, activeSegment, modifiers(e));
        return;
      }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test src/hooks/useCompositeList.test.tsx`
Expected: PASS (all tests in the file, including the two new ones).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useCompositeList.ts src/hooks/useCompositeList.test.tsx
git commit -m "$(cat <<'EOF'
feat(composite-list): emit generic "copy" action on Ctrl+C

List-scoped, like Delete. Consumers decide what to copy. e.code guards
Cyrillic layouts. Trigger comment for the future key->actionType table.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: "Copy URL" menu item + clipboard wiring

This task threads one required `onCopyUrl` prop from `StreamList` → `StreamItem` → `StreamContextMenu` and adds the shared `copyStreamUrl` helper. Because the prop is required, all three files must land together to typecheck; commit once at the end. (Vitest transpiles per-file and does not whole-project typecheck, so each test step can pass before the full chain is wired — the final `pnpm vite:build` is the type gate.)

**Files:**
- Modify: `src/components/streams/StreamContextMenu.tsx:1-2` (import), `:11-23` (Props), `:39-72` (handler), `:132` (new item)
- Modify: `src/components/streams/StreamContextMenu.test.tsx:7-21` (mock), `:36-44` (handlers), add test
- Modify: `src/components/streams/StreamItem.tsx:35-59` (Props), `:295-304` (menu usage)
- Modify: `src/components/streams/StreamList.tsx:141-152` (helper), `:164-174` (onAction), `:175-191` (renderRow)
- Modify: `src/components/streams/StreamList.test.tsx` (clipboard mock + tests)

- [ ] **Step 1: Write the failing StreamContextMenu test**

In `src/components/streams/StreamContextMenu.test.tsx`, add `copy_url` to the message mock (after `copy_to_profile` on line 18):

```ts
  copy_url: () => "Копіювати URL",
```

Add `onCopyUrl` to the handlers in `renderMenu` (line 37-39 `h` object):

```ts
    onCopyToProfile: vi.fn(), onMoveToProfile: vi.fn(), onCopyUrl: vi.fn(),
```

Add a new test inside `describe("StreamContextMenu — copy/move to profile", …)`:

```ts
  it("calls onCopyUrl when Copy URL is clicked", async () => {
    const { container, onCopyUrl } = renderMenu(mkStatus("idle"));
    open(container);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Копіювати URL" }));
    expect(onCopyUrl).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/components/streams/StreamContextMenu.test.tsx`
Expected: FAIL — no menuitem named "Копіювати URL" (and TS: `onCopyUrl` not on Props).

- [ ] **Step 3: Implement StreamContextMenu**

In `src/components/streams/StreamContextMenu.tsx`:

Add `Link` to the lucide import (line 2):

```ts
import { Copy, FolderInput, Link } from "lucide-react";
```

Add `onCopyUrl` to `Props` (after `onMoveToProfile`, line 19) and to the destructure (line 23):

```ts
  onCopyUrl: () => void;
```
```ts
export function StreamContextMenu({ stream, status, menuFocused, onAddToWishlist, onAddToIgnorelist, onCopyUrl, onCopyToProfile, onMoveToProfile, onDelete }: Props) {
```

Add a handler case in `handleAction` (alongside the other cases, e.g. before `case "copy-to-profile"`):

```ts
        case "copy-url":
          onCopyUrl();
          break;
```

Add the `MenuItem` immediately before the `id="copy-to-profile"` item (line 132):

```tsx
          <MenuItem
            id="copy-url"
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            <span aria-hidden="true" className="mr-2 inline-flex"><Link size={14} /></span>{m.copy_url()}
          </MenuItem>
```

- [ ] **Step 4: Run the StreamContextMenu test to verify it passes**

Run: `pnpm test src/components/streams/StreamContextMenu.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing StreamList integration tests**

In `src/components/streams/StreamList.test.tsx`, add a clipboard mock. After the `mkStream` import block, define the spy and install it in `beforeEach` (add to the existing `beforeEach` body, lines 55-62):

```ts
const writeText = vi.fn().mockResolvedValue(undefined);
```

Inside `beforeEach`, add:

```ts
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  writeText.mockClear();
```

Add a new describe block at the end of the file:

```ts
describe("StreamList — copy stream URL", () => {
  it("Ctrl+C on the focused row copies its URL and toasts", async () => {
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "c", code: "KeyC", ctrlKey: true });
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("http://x/a"));
    await waitFor(() =>
      expect($toasts.get().some((t) => t.message === m.stream_url_copied({ name: "Alpha" }))).toBe(true),
    );
  });

  it("context-menu Copy URL copies the row's URL", async () => {
    const { container } = renderList();
    fireEvent.click(
      container.querySelector<HTMLElement>('li[data-item-id="b"] button[data-segment="action-menu"]')!,
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: m.copy_url() }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("http://x/b"));
  });
});
```

- [ ] **Step 6: Run the StreamList tests to verify they fail**

Run: `pnpm test src/components/streams/StreamList.test.tsx`
Expected: FAIL — `writeText` never called (no `copy` handling, no menu item wired through `StreamItem`).

- [ ] **Step 7: Thread the prop through StreamItem**

In `src/components/streams/StreamItem.tsx`:

Add to `Props` (after `onMoveToProfile`, line 44) and to the destructure (after `onMoveToProfile`, line 57):

```ts
  onCopyUrl: () => void;
```

Pass it to the menu (in the `<StreamContextMenu … />` usage, line 295-304):

```tsx
          onCopyUrl={onCopyUrl}
```

- [ ] **Step 8: Add the helper + handling in StreamList**

In `src/components/streams/StreamList.tsx`:

Add the helper (e.g. right after `handleConfirmDelete`, before the `return`, near line 152):

```ts
  const copyStreamUrl = async (stream: StreamInfo) => {
    try {
      await navigator.clipboard.writeText(stream.url);
      addToast(m.stream_url_copied({ name: stream.name }), "info");
      announce(m.stream_url_copied({ name: stream.name }), "polite");
    } catch (err) {
      addToast(String(err), "error");
    }
  };
```

In the `onAction` callback (line 164-174), add a `copy` branch at the top:

```ts
        onAction={(type, itemId, segment, mods) => {
          if (type === "copy") {
            const stream = streams.find((s) => s.id === itemId);
            if (stream) copyStreamUrl(stream);
            return;
          }
          if (type === "delete") {
```

In `renderRow`, pass the prop to `StreamItem` (alongside `onCopyToProfile`, line 186):

```tsx
              onCopyUrl={() => copyStreamUrl(stream)}
```

- [ ] **Step 9: Run the streams tests to verify they pass**

Run: `pnpm test src/components/streams`
Expected: PASS (StreamContextMenu, StreamItem, StreamList).

- [ ] **Step 10: Type gate**

Run: `pnpm vite:build`
Expected: build succeeds (the required `onCopyUrl` prop is threaded everywhere `StreamItem`/`StreamContextMenu` are used).

- [ ] **Step 11: Commit**

```bash
git add src/components/streams
git commit -m "$(cat <<'EOF'
feat(streams): copy stream URL via context menu + Ctrl+C

Shared copyStreamUrl helper (navigator.clipboard + toast + announce),
backing a new "Copy URL" menu item and the list "copy" action.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Register Ctrl+C in the shortcut registry (help + reserved)

**Files:**
- Modify: `src/lib/shortcuts.ts:119-125` (add a `list`-group entry near `row-menu`)
- Test: `src/lib/reservedShortcuts.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/lib/reservedShortcuts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { findReservedConflict } from "./reservedShortcuts";
import { matchShortcut } from "./shortcuts";

describe("Ctrl+C copy-url registration", () => {
  it("is reserved against the KeyRecorder", () => {
    expect(findReservedConflict("Ctrl+C")).not.toBeNull();
  });

  it("is NOT centrally dispatched (no match) — left to useCompositeList", () => {
    const e = {
      ctrlKey: true, metaKey: false, altKey: false, shiftKey: false,
      code: "KeyC", key: "c",
    } as unknown as KeyboardEvent;
    expect(matchShortcut(e, { activeSection: "streams" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/reservedShortcuts.test.ts`
Expected: FAIL — `findReservedConflict("Ctrl+C")` returns `null` (no such reserved combo yet).

- [ ] **Step 3: Add the registry entry**

In `src/lib/shortcuts.ts`, add to the `SHORTCUTS` array, immediately after the `row-menu` entry (line 119-125):

```ts
  {
    id: "copy-url",
    combo: "Ctrl+C",
    label: m.copy_url,
    group: "list",
    reserved: true,
  },
```

(No `match`, no `when` — handled by `useCompositeList`; listed only for F1 help + reserved guard.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/reservedShortcuts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shortcuts.ts src/lib/reservedShortcuts.test.ts
git commit -m "$(cat <<'EOF'
feat(shortcuts): register Ctrl+C (copy-url) as reserved list combo

Help + KeyRecorder guard only; no match (dispatched by useCompositeList).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Record the list-axis refactor trigger in the ADR

**Files:**
- Modify: `docs/decisions/2026-06-07-shortcut-configurability-asymmetry.md` (the `## Коли переглянути` section, lines 75-80)

- [ ] **Step 1: Add the trigger bullet**

In `docs/decisions/2026-06-07-shortcut-configurability-asymmetry.md`, under `## Коли переглянути`, append a bullet:

```markdown
- list-група в `useCompositeList` розростається (3-4+ key→action мапінгів, нині
  Delete + Ctrl+C) → винести розсип `if`/`switch` у таблицю key→actionType. Це
  друга вісь, поза Tier 2 (глобальний реєстр) — тригер живе і коментарем біля
  `ActionType` в `useCompositeList.ts`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/2026-06-07-shortcut-configurability-asymmetry.md
git commit -m "$(cat <<'EOF'
docs(adr): note list-axis refactor trigger for composite-list shortcuts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Full-suite verification

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: PASS (all files).

- [ ] **Step 2: Run the production build**

Run: `pnpm vite:build`
Expected: build succeeds.

- [ ] **Step 3: Manual smoke check (optional but recommended)**

Run: `pnpm dev`, open the Streams screen, focus a stream row, press Ctrl+C → toast "Адресу … скопійовано"; paste elsewhere to confirm the URL. Open the row's ⋯ menu → "Копіювати URL" → same result. In a text field (e.g. Add Stream dialog) confirm Ctrl+C still copies selected text normally.

---

## Self-Review (completed by plan author)

- **Spec coverage:** clipboard helper (Task 3) ✓; context-menu item (Task 3) ✓; list-scoped Ctrl+C via `useCompositeList` generic action (Task 2 + 3) ✓; registry reserved/help entry without `match` (Task 4) ✓; i18n keys (Task 1) ✓; doc trigger comment (Task 2) + ADR line (Task 5) ✓; YAGNI boundaries respected (no `useContextualShortcuts`, no key→action table, no clipboard plugin) ✓; all acceptance criteria mapped to tasks/steps ✓.
- **Placeholder scan:** none — every code/test step carries real content and exact commands.
- **Type consistency:** `ActionType` gains `"copy"` (Task 2) and is consumed as `"copy"` in `StreamList.onAction` (Task 3); `onCopyUrl: () => void` is identical across `StreamContextMenu`, `StreamItem`, `StreamList`; `copyStreamUrl(stream: StreamInfo)` matches the `StreamInfo` import already in `StreamList`; `m.copy_url` / `m.stream_url_copied` defined in Task 1 before first use.
