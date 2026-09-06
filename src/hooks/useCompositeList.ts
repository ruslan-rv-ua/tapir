import { useCallback, useLayoutEffect, useRef, useState, useEffect } from 'react';
import type React from 'react'; // for React.KeyboardEvent type
import { isInModal } from '../lib/shortcutGuard';
import { announce } from '../stores/announcer';

export type SegmentKind =
  | 'summary'
  | 'track'
  | 'tech'
  | 'status'
  | 'metadata'
  | 'country'
  | 'language'
  | 'codec'
  | 'bitrate'
  | 'genre'
  | 'popularity'
  | 'conditions'
  // Per-button action stops — each action button is its own focus stop,
  // reached via Left/Right and activated natively (Enter/Space/click).
  | 'action-play'
  | 'action-record'
  | 'action-menu' // streams / profiles
  | 'action-add' // browser results
  | 'action-edit'
  | 'action-delete' // wishlist / ignorelist / profiles
  // Profile rows
  | 'action-switch'
  | 'action-duplicate'
  | 'action-rename'
  | 'action-export'
  // Schedule rows
  | 'action-toggle';

export type ActionType =
  | 'primary'
  | 'toggle'
  | 'delete'
  | 'copy'
  | 'edit'
  | 'edit-content'
  | 'transfer-copy'
  | 'transfer-move';

/**
 * Modifier keys held during an activation key (Enter/Space) or Delete.
 * Lists map these to fixed alternate actions — by app-wide convention
 * Shift+Enter = listen (play/preview), Ctrl+Enter = record (where recording
 * exists), Alt+Enter = hand the item to an external app — regardless of what
 * the plain-Enter primary action is configured to.
 */
export interface ActionModifiers {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

/**
 * True when `el` is a native interactive control that handles its own
 * Enter/Space/click. When such a control is the active focus stop, the hook
 * stays out of the way: it does not preventDefault Enter/Space and does not
 * synthesize an onAction call, letting the browser activate the control.
 */
function modifiers(e: React.KeyboardEvent): ActionModifiers {
  return { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey };
}

function isNativeControl(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === 'BUTTON' ||
    tag === 'INPUT' ||
    tag === 'SELECT' ||
    tag === 'TEXTAREA' ||
    (tag === 'A' && el.hasAttribute('href')) ||
    el.isContentEditable
  );
}

export interface CompositeListItem {
  /** Stable unique identifier. */
  id: string;
  /**
   * Ordered segment kinds available for this item — do NOT include 'summary'.
   * 'summary' is always implicitly first.
   */
  segments: Exclude<SegmentKind, 'summary'>[];
}

interface FocusMemory {
  itemId: string;
  /** Fallback if itemId is no longer in the list. */
  prevIndex: number;
  activeSegment: SegmentKind;
  scrollTop: number;
}

/** Two-method bridge to the consumer's selection store (atom). */
export interface CompositeSelection {
  /** Event-time snapshot (atom.get). */
  current: () => ReadonlySet<string>;
  /**
   * Delegates to the store's replaceSelection (new Set identity). MUST update the
   * store synchronously: the hook calls `current()` immediately after `replace()`
   * (e.g. to snapshot the range-anchor base), so a deferred/batched update would
   * read stale state. A nanostores `atom.set` satisfies this.
   */
  replace: (next: ReadonlySet<string>) => void;
}

/** Emitted after every selection gesture so the consumer can localize an announce. */
export interface SelectionChange {
  /** single = Ctrl+Space/Ctrl+Click/simple click; group = range/all/clear. */
  kind: "single" | "group";
  /** pointer gestures already moved DOM focus (NVDA reads the row) → caller skips single. */
  via: "key" | "pointer";
  /** New selection size. */
  count: number;
  /** Toggled row (single only). */
  lastId?: string;
  /** Its new state (single only). */
  selected?: boolean;
}

/**
 * The single trailing action a list may end with — "Load more" under the browser
 * results is the only one today. Deliberately a DESCRIBED ACTION, not arbitrary
 * markup: the list renders the button and owns everything that happens after it
 * is pressed, so the next such control cannot re-invent the rules
 * (ADR 2026-09-03 §4, docs/decisions/2026-09-03-trailing-stop-crosses-only-on-down.md).
 */
export interface TrailingStop {
  /** Visible label. The consumer swaps it while `busy` — there is no second slot. */
  label: string;
  /**
   * A batch is in flight. Busy-ness rides on the label and `aria-busy`; the
   * button must NEVER become natively `disabled` — `disabled` on the focused
   * element throws focus to <body>, which is this very bug from the other side
   * (precedent: dialog-focus-after-async-warning).
   */
  busy?: boolean;
  /** Fetch the next batch. A REJECTION means "failed": focus stays on the button. */
  onActivate: () => void | Promise<void>;
  /** Spoken when the activation brought no new rows. */
  exhaustedMessage: string;
}

interface UseCompositeListOptions<T extends CompositeListItem> {
  items: T[];
  /**
   * Identity of the RESULT SET on screen — the owning screen's criteria spelled
   * as one string, `null` for a list that has no criteria to change.
   *
   * A CHANGED key means the person replaced the set (another filter chip, query,
   * station, sort order): the current stop goes back to the first row, even if
   * the row it sat on survived — the old result set ended, and a row present in
   * both is a coincidence, not an identity. The SAME key with different `items`
   * is DRIFT — the data moved on its own — and the stop stays where it is, or
   * clamps to the neighbour by index when its row is gone.
   *
   * Required on purpose: forgetting to say what replaces the set used to be a
   * spoken contract that only one screen of three remembered, and a list left
   * with no stop is skipped by a native Tab altogether. ADR 2026-09-06,
   * docs/decisions/2026-09-06-new-result-set-forgets-the-current-stop.md.
   */
  resultSetKey: string | null;
  /** Present ⇒ the list ends with one trailing action stop after the last row. */
  trailingStop?: TrailingStop;
  onTabOut: (forward: boolean) => void;
  onAction: (
    type: ActionType,
    itemId: string,
    segment: SegmentKind,
    modifiers: ActionModifiers,
  ) => void;
  /**
   * Called when items becomes empty while list had focus.
   * Parent should switch to empty-state zone.
   */
  onEmpty?: () => void;
  /** Opt-in: enables the selection layer. Omit → list behaves exactly as before. */
  selection?: CompositeSelection;
  onSelectionChange?: (change: SelectionChange) => void;
}

/** Semantic key intents resolved from a KeyboardEvent (pure; no list state). */
type ActionId =
  | "up" | "down" | "left" | "right"
  | "home" | "end" | "pageup" | "pagedown"
  | "enter" | "space" | "delete" | "edit" | "edit-content" | "tab" | "copy" | "selectToggle"
  | "selectRangeUp" | "selectRangeDown" | "selectAll" | "clearSelection"
  | "transfer-copy" | "transfer-move";

/**
 * Intents that address the ROW under the cursor. On the trailing stop there is
 * no row, so each one goes silent — and silent WITHOUT consume(), so the key
 * travels on to the global registries (ADR 2026-09-03 §2; the precedent is
 * Escape in an empty list). Left/Right belong here too: they move WITHIN a row.
 *
 * Not listed, on purpose: `selectAll` and `clearSelection` act on the ZONE and
 * keep working (the selection is still on screen), and `enter`/`space` belong to
 * the button itself.
 */
const ROW_SCOPED_INTENTS: ReadonlySet<ActionId> = new Set<ActionId>([
  "left", "right", "copy", "selectToggle",
  "delete", "edit", "edit-content", "transfer-copy", "transfer-move",
]);

/**
 * The slice of a KeyboardEvent this module's pure key logic reads. Narrower
 * than React.KeyboardEvent on purpose: it lets the resolver be called with a
 * synthesized "same key, no modifiers held" copy (see bareStroke below), and
 * lets the modifier matrix be covered by a table test instead of dozens of hook
 * mounts.
 */
type KeyStroke = Pick<
  React.KeyboardEvent,
  "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
>;

/**
 * Map a keyboard event to a single list intent, or null to let it bubble.
 * Letters/Space use e.code (Cyrillic-layout safe); navigation/activation keys
 * use e.key.
 *
 * THE MODEL: a list key is BARE unless this function names it otherwise
 * (ADR 2026-09-04, docs/decisions/2026-09-04-list-keys-are-bare-unless-named.md).
 * Every combination the list owns is declared ABOVE the guard; the `switch`
 * below the guard only ever sees a naked key. So a key added to the switch
 * years from now inherits no combinations, and forgetting to name one fails
 * LOUDLY — the combo does nothing, visible on the first press — instead of
 * silently duplicating the row action under someone else's shortcut.
 *
 * Modifiers that ride ALONG instead of selecting the intent (on Enter:
 * Shift = listen, Ctrl = record, Alt = hand to an external app) are still not
 * encoded here — they travel via `modifiers(e)` at dispatch time.
 */
function resolveKeyAction(e: KeyStroke): ActionId | null {
  /* ---- named exceptions: the combinations the list does own ---------- */
  if (
    (e.code === "Space" || e.key === " ") &&
    (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey
  ) return "selectToggle";
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === "KeyC") return "copy";
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === "KeyA") return "selectAll";
  if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (e.key === "ArrowDown") return "selectRangeDown";
    if (e.key === "ArrowUp") return "selectRangeUp";
  }
  // Enter takes EXACTLY ONE modifier out of {Shift, Ctrl, Alt} — or none. A
  // PAIR is refused rather than ranked: the three lists reading `mods` each
  // ordered their ifs differently, so nobody could say what Ctrl+Shift+Enter
  // meant. Refusing pairs cancels the question. Concretely load-bearing:
  // AltGr reports as ctrl+alt on European layouts (webviewAccelerators.ts
  // already accounts for it), so AltGr+Enter used to reach the `mods.alt`
  // branch and hand the stream to an external player. Meta carries no list
  // action at all.
  if (e.key === "Enter") {
    if (e.metaKey) return null;
    const held = Number(e.shiftKey) + Number(e.ctrlKey) + Number(e.altKey);
    return held > 1 ? null : "enter";
  }
  // F5 — "copy to…" row key, Shift+F5 — "move to…". The KEY is borrowed from
  // Norton Commander / Total Commander (where blind users learned it); the
  // two-panel model is NOT — the destination is asked for by a dialog. Move is
  // Shift+F5, not F6: F6 is zone navigation and a Microsoft platform convention.
  // Shift is the only modifier that carries meaning here; it SELECTS the intent
  // rather than riding along in modifiers(e) (the precedent is selectRange*,
  // not Enter). That is also why F5 is named above the guard while its F2/F4
  // neighbours are not: for them Shift means nothing, so the guard says so.
  if (e.key === "F5") {
    if (e.ctrlKey || e.altKey || e.metaKey) return null;
    return e.shiftKey ? "transfer-move" : "transfer-copy";
  }
  // Tab leaves the zone; Shift picks the direction, read by the handler rather
  // than encoded in the intent. Ctrl+Tab is an ATTEMPT at a shortcut, not
  // navigation (the KeyRecorder precedent), so the list does not answer to it.
  if (e.key === "Tab") {
    if (e.ctrlKey || e.altKey || e.metaKey) return null;
    return "tab";
  }

  /* ---- the guard: past this line a list key is bare, or it is not ours -- */
  // Ctrl/Alt/Meta address other layers (the Tier-2 registry, OS hotkeys,
  // WebView2 accelerators, Windows' own Alt+Space window menu); Shift has no
  // foreign layer, but no declared meaning here either. Same verdict for both:
  // not named above ⇒ not ours (ADR §1–§2).
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return null;

  switch (e.key) {
    case "ArrowUp": return "up";
    case "ArrowDown": return "down";
    case "ArrowLeft": return "left";
    case "ArrowRight": return "right";
    case "Home": return "home";
    case "End": return "end";
    case "PageUp": return "pageup";
    case "PageDown": return "pagedown";
    case "Escape": return "clearSelection";
    // Enter is NOT here: it is named above the guard, bare form included, and a
    // case for it down here would be a second listing of the same key one line
    // below the very guard that exists to keep one listing (ADR §6).
    case "Delete": return "delete";
    // F2 — desktop "rename/edit" row key (Explorer/VS Code/NVDA convention);
    // F4 — the row's CONTENT, the other half of the Total Commander / FAR pair
    // (F2 = name, F4 = content), in Songs the tag editor. Generic intents: each
    // list decides what they mean, and no-ops if it has no answer. Both used to
    // carry a hand-written modifier guard; the shared guard above covers them,
    // including the load-bearing case — Alt+F4 stays the system window close.
    case "F2": return "edit";
    case "F4": return "edit-content";
  }
  if (e.code === "Space" || e.key === " ") return "space";
  return null;
}

/**
 * What this keystroke WOULD have meant with nothing held down. The single
 * question the default-suppression rules below ask, and the reason they own no
 * key list of their own: a second list would drift, and the thirteenth key
 * added to the switch would silently miss the guard — the very trap the model
 * above exists to close, merely moved one step further out (ADR §6).
 */
function bareAction(e: KeyStroke): ActionId | null {
  return resolveKeyAction({
    key: e.key,
    code: e.code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  });
}

/**
 * True when the list must swallow the browser's default for a keystroke it
 * REFUSED. Refusing means the key travels on — no stopPropagation, so the
 * global registries still see it — but "we did not act" must not turn into
 * "the browser acted instead": Ctrl+End, Ctrl+Home, Shift+Space, Ctrl+Up/Down
 * and Shift/Ctrl+Page* all scroll the nearest scrollable ancestor, which is
 * this list's own overflow container. Scrolling without moving focus drags the
 * viewport away from the cursor and says nothing about it (ADR §4).
 *
 * With Alt or Meta held the event is not touched at all: that is the OS layer,
 * and the page has no business in it. The concrete gain is Alt+Space — the
 * Windows window menu (Move / Size / Close), a real platform affordance the
 * list used to steal.
 *
 * Only meaningful on the refusal path: a keystroke that resolves to an intent
 * is consumed outright and never asks.
 */
export function suppressesDefault(e: KeyStroke): boolean {
  if (e.altKey || e.metaKey) return false;      // OS layer — hands off (§4)
  if (!e.ctrlKey && !e.shiftKey) return false;  // bare — resolveKeyAction had it
  return bareAction(e) !== null;                // "would this key have been ours?"
}

/**
 * The one exemption from the rule above: a native control (a row's action
 * button, the trailing stop) activates on Enter/Space by itself regardless of
 * Shift, and suppresses the scroll while doing it — so there is no viewport
 * drift to prevent, and a guard firing first would break something that works.
 * Navigation keys get no such exemption: focus on an action button inside a row
 * is an ordinary cursor position (every Left/Right lands there), and Ctrl+End
 * from it would scroll the list to the end with the cursor still on row N
 * (ADR §5).
 */
function yieldsToNativeControl(e: KeyStroke): boolean {
  const bare = bareAction(e);
  return (bare === "enter" || bare === "space") && isNativeControl(document.activeElement);
}

/**
 * 2D roving focus for segment-based composite lists.
 *
 * DOM convention: every focus stop in the list must carry:
 *   data-item-id="<item.id>"
 *   data-segment="<SegmentKind>"
 * and a roving tabIndex (0 when active, -1 otherwise).
 *
 * Action buttons are first-class focus stops: render them as native <button>
 * elements with their own data-segment (e.g. 'action-play') and roving tabIndex.
 * They self-activate on Enter/Space/click; the hook only drives roving + arrow
 * navigation for them and will not synthesize onAction for activation keys while
 * a native control is focused.
 *
 * Vertical movement (Up/Down/Home/End/PageUp/PageDown) always lands on the
 * target item's 'summary' (whole-row) stop — the active segment is not carried
 * across rows.
 */
export function useCompositeList<T extends CompositeListItem>({
  items,
  resultSetKey,
  trailingStop,
  onTabOut,
  onAction,
  onEmpty,
  selection,
  onSelectionChange,
}: UseCompositeListOptions<T>) {
  const [activeItemId, setActiveItemId] = useState<string | null>(
    items.length > 0 ? items[0].id : null,
  );
  const [activeSegment, setActiveSegment] = useState<SegmentKind>('summary');
  // The cursor sits on the trailing stop. `activeItemId` is deliberately LEFT
  // pointing at the row the cursor came from: Up returns there, the focus memory
  // never learns about the stop (ADR §3), and if the stop vanishes underneath
  // (hasMore flips) the cursor simply falls back onto its row rather than
  // leaving the list with no tabIndex=0 stop at all — hence the derived flag
  // below, which every reader uses instead of the raw state.
  const [onTrailing, setOnTrailing] = useState(false);
  const cursorOnTrailing = onTrailing && trailingStop != null;

  // `activeItemId` as the effects below must read it. A layout effect can move
  // the stop before the passive drift effect gets its turn, and that effect's
  // own closure would still be holding the row from the set that is gone.
  const activeItemIdRef = useRef(activeItemId);
  activeItemIdRef.current = activeItemId;

  const memoryRef = useRef<FocusMemory>({
    itemId: items[0]?.id ?? '',
    prevIndex: 0,
    activeSegment: 'summary',
    scrollTop: 0,
  });
  const listRef = useRef<HTMLUListElement | null>(null);
  /** The trailing stop's <button>, when the list renders one. */
  const trailingRef = useRef<HTMLButtonElement | null>(null);
  // Focus anchor for the empty-state region (rendered instead of the <ul> when
  // there are no rows). Lets restoreFocus land the zone on the empty message so
  // cycleZone doesn't skip a row-less list — see restoreFocus below.
  const emptyRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusRef = useRef<{ itemId: string; segment: SegmentKind } | null>(null);
  // Whether the list currently/recently owns focus. Used by live reconciliation
  // to tell "the active row was removed (recover focus)" apart from "the user
  // tabbed away on purpose (leave focus alone)".
  const hasFocusRef = useRef(false);
  // Whether the user has DELIBERATELY moved within the list (arrow/Home/End/Page,
  // a click, or a programmatic focusItem after a bulk op). Set only by real
  // navigation — NOT by mere focus-in (restoreFocus / a transient focus) and NOT
  // by the mount-time seed. While this is false the active row is kept pinned to
  // the current first row (see the re-seed effect below), so both Tab-entry and a
  // native Tab into the list land on items[0] even after the list reorders.
  const userNavigatedRef = useRef(false);

  // Keep options in refs to avoid stale closure
  const onTabOutRef = useRef(onTabOut);
  onTabOutRef.current = onTabOut;
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const onEmptyRef = useRef(onEmpty);
  onEmptyRef.current = onEmpty;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  // Read after an await, when the render-time values are a batch out of date.
  const trailingStopRef = useRef(trailingStop);
  trailingStopRef.current = trailingStop;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Range anchor (id) + snapshot of the selection when the anchor was (re)set.
  const anchorRef = useRef<string | null>(null);
  const anchorBaseRef = useRef<ReadonlySet<string>>(new Set());

  // Fire pending focus after DOM updates (tabIndex changes happen during render)
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-item-id="${CSS.escape(pending.itemId)}"][data-segment="${pending.segment}"]`,
    );
    el?.focus();
  });

  // Track focus ownership of the list (focusin bubbles from any descendant).
  useEffect(() => {
    const ul = listRef.current;
    if (!ul) return;
    const onFocusIn = () => {
      hasFocusRef.current = true;
    };
    ul.addEventListener('focusin', onFocusIn);
    return () => ul.removeEventListener('focusin', onFocusIn);
  }, []);

  /**
   * Seat the current stop on a row's summary — the one move the hook makes on
   * its own behalf, in all three places it makes it (re-seed, a new result set,
   * drift). The ref travels WITH the state because the effects below read it
   * rather than their own closure: an effect that runs later in the same flush
   * would otherwise still be looking at the row from a render ago.
   *
   * Key and pointer handlers do not go through here — they move focus as well
   * as the stop, and a render always lands between them and any effect.
   */
  const seatStopOnRow = useCallback((itemId: string) => {
    setActiveItemId(itemId);
    setActiveSegment('summary');
    activeItemIdRef.current = itemId;
  }, []);

  // Update focus memory whenever active position changes
  useEffect(() => {
    if (!activeItemId) return;
    const idx = items.findIndex((it) => it.id === activeItemId);
    memoryRef.current = {
      itemId: activeItemId,
      prevIndex: idx >= 0 ? idx : memoryRef.current.prevIndex,
      activeSegment,
      scrollTop: listRef.current?.scrollTop ?? 0,
    };
  }, [activeItemId, activeSegment, items]);

  // Keep the active row pinned to the CURRENT first row until the user navigates.
  // Also how a new result set finishes what the effect above started: that one
  // moves the stop onto the rows still on screen, this one follows it onto the
  // first row of the set that arrives.
  // The list can reorder after mount — most importantly when the persisted sort
  // order (e.g. "added", newest-first) arrives after the data has already loaded
  // and rendered under the default order. The mount-time seed (items[0] at first
  // render) would otherwise leave the roving tabIndex=0 AND the focus memory on a
  // row that is no longer first, so a Tab into the list — whether via restoreFocus
  // or a native Tab onto the tabIndex=0 stop — lands on the wrong row. Skipped once
  // the user deliberately arrows/clicks (their position wins) and while the list
  // currently holds focus (never yank a live cursor).
  useEffect(() => {
    if (userNavigatedRef.current) return;
    if (items.length === 0) return;
    if (activeItemId === items[0].id) return;
    if (listRef.current?.contains(document.activeElement)) return;
    seatStopOnRow(items[0].id);
  }, [items, activeItemId, seatStopOnRow]);

  // A NEW RESULT SET: the screen changed its criteria, so the remembered row
  // belongs to a set that no longer exists — the current stop goes back to the
  // first row (ADR 2026-09-06 §1). Not a guess from `items`: a different array
  // arrives both when the person re-filters and when the data drifts on its own,
  // and only the screen knows which of the two happened.
  //
  // A LAYOUT effect, and it reads `itemsRef` rather than waiting for the new
  // rows: the criteria change first and the rows follow — half a second later
  // for a debounced text search — and the roving tabIndex=0 stop is exactly
  // where a native Tab lands in that window.
  const resultSetKeyRef = useRef(resultSetKey);
  useLayoutEffect(() => {
    if (resultSetKeyRef.current === resultSetKey) return;
    resultSetKeyRef.current = resultSetKey;
    // ADR §5: the rule is about the NEXT entry. While the list holds focus the
    // current stop IS the focus, and nothing may move it out from under it.
    const ae = document.activeElement;
    if (listRef.current?.contains(ae)) return;
    userNavigatedRef.current = false;
    setOnTrailing(false);
    const rows = itemsRef.current;
    // An empty new result set has no row to be the way in — correct, and why
    // the empty state carries its own focusable anchor (accessibility.md §3.1).
    if (rows.length === 0) return;
    seatStopOnRow(rows[0].id);
    // The list HELD focus and focus is now nowhere: either the person's own row
    // went with the old result set, or they blurred out of the list earlier.
    // Both leave a live person on <body>, which is the failure this project
    // refuses (ADR 2026-09-05) — so the first row of the new set takes the focus
    // as well as the stop. Asked of the present, not of history: whether what
    // holds focus right now is alive.
    if (hasFocusRef.current && (!ae || ae === document.body || !ae.isConnected)) {
      pendingFocusRef.current = { itemId: rows[0].id, segment: 'summary' };
    }
    // `memoryRef` is deliberately left alone: with userNavigatedRef false nothing
    // reads it back as a position, while a Shift+click still anchors its range on
    // `memoryRef.current.itemId` (see onClick) — blanking it would collapse that
    // span to the clicked row.
  }, [resultSetKey, seatStopOnRow]);

  // DRIFT: the active row left the result set without the criteria changing.
  //
  // Two duties, deliberately separated (ADR 2026-09-06 §3). The current stop
  // ALWAYS re-seats — a non-empty list with no tabIndex=0 stop is omitted from
  // the sequential focus order, so a native Tab walks straight past it. Focus is
  // only recovered when it was the vanished row that held it; a person who has
  // moved to another live control keeps it.
  useEffect(() => {
    const active = activeItemIdRef.current;
    if (!active) return;
    const exists = items.some((it) => it.id === active);
    if (exists) return;

    const ae = document.activeElement;
    const focusInList = listRef.current?.contains(ae) ?? false;
    const focusLivesOutside =
      !focusInList && !!ae && ae !== document.body && ae.isConnected;
    // The list never held focus (e.g. async data load on mount) and focus is
    // nowhere in particular — nothing to recover, and the re-seed effect above
    // owns the stop in that state.
    if (!focusInList && !focusLivesOutside && !hasFocusRef.current) return;

    if (items.length === 0) {
      // No row to seat the stop on. Handing the screen its empty state is a
      // FOCUS duty, so it belongs to the same half as recovering focus.
      if (!focusLivesOutside) onEmptyRef.current?.();
      return;
    }
    const targetIdx = Math.max(
      0,
      Math.min(memoryRef.current.prevIndex, items.length - 1),
    );
    const target = items[targetIdx];
    seatStopOnRow(target.id);
    if (!focusLivesOutside) {
      pendingFocusRef.current = { itemId: target.id, segment: 'summary' };
    }
    // `items` really is the whole dependency now (`seatStopOnRow` is stable):
    // everything else this reads is a ref, `activeItemId` included — which is
    // what lets it run once per change of the rows instead of once per move of
    // the cursor.
  }, [items, seatStopOnRow]);

  function resolveSegments(item: T): SegmentKind[] {
    return ['summary', ...item.segments] as SegmentKind[];
  }

  /** Contiguous ids from `fromId` to `toId` over the current visible items. */
  const rangeIds = useCallback((fromId: string, toId: string): string[] => {
    const i = items.findIndex((it) => it.id === fromId);
    const j = items.findIndex((it) => it.id === toId);
    if (i < 0 || j < 0) return [toId];
    const [lo, hi] = i <= j ? [i, j] : [j, i];
    return items.slice(lo, hi + 1).map((it) => it.id);
  }, [items]);

  /** (Re)set the anchor and snapshot the *current* selection as its base. */
  const setAnchor = useCallback((id: string) => {
    anchorRef.current = id;
    anchorBaseRef.current = new Set(selectionRef.current?.current() ?? []);
  }, []);

  /** Toggle one row's membership; (re)sets the anchor; emits a single change. */
  const toggleSelection = useCallback((id: string, via: "key" | "pointer") => {
    const sel = selectionRef.current;
    if (!sel) return;
    const next = new Set(sel.current());
    const willSelect = !next.has(id);
    if (willSelect) next.add(id);
    else next.delete(id);
    sel.replace(next);
    setAnchor(id); // base snapshot now includes the just-toggled row
    onSelectionChangeRef.current?.({ kind: "single", via, count: next.size, lastId: id, selected: willSelect });
  }, [setAnchor]);

  const moveFocus = useCallback(
    (itemId: string, segment: SegmentKind) => {
      // Any move through here (arrow/Home/End/Page, range-extend, or a
      // programmatic focusItem after a bulk op) is a deliberate position — stop
      // the re-seed effect from pinning the active row to items[0].
      userNavigatedRef.current = true;
      // Every landing is on a ROW, so it is also the single way off the
      // trailing stop: Up, Home/End, Page*, Shift-extend and focusItem all
      // funnel through here and none of them has to remember to clear the flag.
      setOnTrailing(false);
      setActiveItemId(itemId);
      setActiveSegment(segment);
      pendingFocusRef.current = { itemId, segment };
    },
    [],
  );

  /**
   * Move the cursor onto the trailing stop. `activeItemId` stays on the row we
   * came from (see the state declaration), so the focus memory is untouched and
   * Up has somewhere to return to.
   */
  const moveToTrailing = useCallback(() => {
    userNavigatedRef.current = true;
    setOnTrailing(true);
    // tabIndex only flips on the next render; programmatic focus does not wait.
    trailingRef.current?.focus();
  }, []);

  /** Programmatically move focus to a specific item's segment (default summary). */
  const focusItem = useCallback(
    (itemId: string, segment: SegmentKind = 'summary') => {
      if (!items.some((it) => it.id === itemId)) return;
      moveFocus(itemId, segment);
    },
    [items, moveFocus],
  );

  // Attached in the CAPTURE phase (see return value) so navigation keys are
  // handled before any descendant control reacts — notably the React Aria menu
  // trigger, which would otherwise open its menu on Up/Down.
  const onKeyDownCapture = useCallback(
    (e: React.KeyboardEvent) => {
      // Fully consume a key: stop the default action and prevent it from
      // reaching descendant controls or window-level handlers.
      const consume = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      // Swallow nothing while inside a modal. Shares shortcutGuard's
      // MODAL_SELECTOR (incl. [aria-modal="true"]) — keep this off the inline
      // literal it used to be, which had drifted and missed aria-modal.
      if (isInModal()) return;

      const action = resolveKeyAction(e);
      if (!action) {
        // Refused — but "the list did not act" must not become "the browser
        // acted instead". The key is NOT consumed (no stopPropagation: it goes
        // on to the global registries), only its default is dropped, and only
        // when the default would scroll this list out from under a cursor that
        // never moved. See suppressesDefault / yieldsToNativeControl.
        if (suppressesDefault(e) && !yieldsToNativeControl(e)) e.preventDefault();
        return;
      }

      if (!activeItemId) {
        if (action === "tab") {
          consume();
          onTabOutRef.current(!e.shiftKey);
        }
        return;
      }

      if (action === "tab") {
        consume();
        onTabOutRef.current(!e.shiftKey);
        return;
      }

      if (cursorOnTrailing) {
        // The stop is a native <button>: the browser activates it, and the hook
        // must not also synthesize a row action for the row it came from.
        if (action === "enter" || action === "space") return;
        // No row under the cursor → the row-scoped intents have nothing to act
        // on. See ROW_SCOPED_INTENTS for why they stay silent without consume().
        if (ROW_SCOPED_INTENTS.has(action)) {
          // …with one thing still to suppress: to the browser Ctrl+Space is a
          // Space, and a focused <button> activates on it. "Silent" has to mean
          // the batch does not fire, so the DEFAULT is prevented while
          // propagation is left alone — the key still reaches the global
          // registries, which is what the no-consume rule protects.
          if (action === "selectToggle") e.preventDefault();
          return;
        }
        // Everything else falls through: Ctrl+A and Escape still own the zone,
        // and the vertical moves below read `activeItemId` — still the row the
        // cursor came from — to find their way back onto a row.
      }

      // Ctrl/Cmd+C → generic "copy" for the active row; the consumer decides what
      // to copy. List-scoped on purpose (a registry match would hijack Ctrl+C in
      // text fields across the whole section).
      if (action === "copy") {
        consume();
        onActionRef.current("copy", activeItemId, activeSegment, modifiers(e));
        return;
      }

      const currentIdx = items.findIndex((it) => it.id === activeItemId);
      if (currentIdx < 0) return;
      const currentItem = items[currentIdx];
      const allSegments = resolveSegments(currentItem);
      const segIdx = allSegments.indexOf(activeSegment);

      // Plain row navigation (up/down/home/end/page) re-anchors the selection to
      // the landed row so a following Shift-extend spans from the new cursor, not
      // the old anchor. left/right are within-row moves and deliberately do not
      // re-anchor; Shift-range gestures keep the existing anchor (see Task 6).
      switch (action) {
        case "up": {
          consume();
          // Off the trailing stop, back onto the last row — the only way in was
          // Down from it, so that is where "back" means (ADR §1).
          const id = cursorOnTrailing
            ? items[items.length - 1]?.id
            : currentIdx > 0
              ? items[currentIdx - 1].id
              : undefined;
          if (id != null) {
            moveFocus(id, "summary");
            if (selectionRef.current) setAnchor(id);
          }
          break;
        }

        case "down": {
          consume();
          if (cursorOnTrailing) break; // already the last stop
          if (currentIdx < items.length - 1) {
            const id = items[currentIdx + 1].id;
            moveFocus(id, "summary");
            if (selectionRef.current) setAnchor(id);
            break;
          }
          // Past the last row. Down is the ONLY key that crosses into the
          // trailing stop — End/PageDown/Shift+↓ mean "row" literally and stay
          // on rows (ADR §1, which also records why).
          if (trailingStopRef.current) moveToTrailing();
          break;
        }

        case "left":
          consume();
          if (segIdx > 0) moveFocus(activeItemId, allSegments[segIdx - 1]);
          break;

        case "right":
          consume();
          if (segIdx < allSegments.length - 1) moveFocus(activeItemId, allSegments[segIdx + 1]);
          break;

        case "home": {
          consume();
          if (items.length > 0) {
            const id = items[0].id;
            moveFocus(id, "summary");
            if (selectionRef.current) setAnchor(id);
          }
          break;
        }

        case "end": {
          consume();
          if (items.length > 0) {
            const id = items[items.length - 1].id;
            moveFocus(id, "summary");
            if (selectionRef.current) setAnchor(id);
          }
          break;
        }

        case "pageup": {
          consume();
          const container = listRef.current;
          if (!container || items.length === 0) break;
          const firstItemEl = container.querySelector<HTMLElement>("[data-item-id]");
          const itemH = firstItemEl?.offsetHeight || 40;
          const page = Math.max(1, Math.floor(container.clientHeight / itemH));
          const targetIdx = Math.max(0, currentIdx - page);
          const id = items[targetIdx].id;
          moveFocus(id, "summary");
          if (selectionRef.current) setAnchor(id);
          break;
        }

        case "pagedown": {
          consume();
          const container = listRef.current;
          if (!container || items.length === 0) break;
          const firstItemEl = container.querySelector<HTMLElement>("[data-item-id]");
          const itemH = firstItemEl?.offsetHeight || 40;
          const page = Math.max(1, Math.floor(container.clientHeight / itemH));
          const targetIdx = Math.min(items.length - 1, currentIdx + page);
          const id = items[targetIdx].id;
          moveFocus(id, "summary");
          if (selectionRef.current) setAnchor(id);
          break;
        }

        case "selectToggle":
          // Selection toggle for the active row. NOT gated by isNativeControl:
          // it works from any segment incl. an action button, and consume() mutes
          // the native click. No-op (and no consume) when selection is disabled.
          if (!selectionRef.current) break;
          consume();
          toggleSelection(activeItemId, "key");
          break;

        case "selectRangeDown":
        case "selectRangeUp": {
          consume();
          const dir = action === "selectRangeDown" ? 1 : -1;
          const nextIdx = Math.max(0, Math.min(items.length - 1, currentIdx + dir));
          const cursorId = items[nextIdx].id;
          moveFocus(cursorId, "summary");
          const sel = selectionRef.current;
          if (!sel) break; // no adapter → behaves like a plain arrow move
          // Guard: an external clear leaves a stale anchorBase that base ∪ range
          // would resurrect. On an empty selection, anchor to the FOCUSED row
          // (activeItemId — moveFocus above only queues the cursor move, React
          // hasn't flushed it) with an empty base. Explorer-inclusive: the span
          // is {focused row .. cursor}, so the starting row joins the range
          // instead of being silently dropped. Resetting the base still keeps
          // stale rows from outside the span from resurrecting.
          if (sel.current().size === 0) {
            anchorRef.current = activeItemId;
            anchorBaseRef.current = new Set();
          }
          if (anchorRef.current == null) anchorRef.current = cursorId;
          const span = rangeIds(anchorRef.current, cursorId);
          const next = new Set(anchorBaseRef.current);
          for (const id of span) next.add(id);
          sel.replace(next);
          onSelectionChangeRef.current?.({ kind: "group", via: "key", count: next.size });
          break;
        }

        case "selectAll": {
          const sel = selectionRef.current;
          if (!sel) break;
          consume();
          const next = new Set(sel.current());
          const visibleIds = items.map((it) => it.id);
          const allSelected = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
          if (allSelected) visibleIds.forEach((id) => next.delete(id));
          else visibleIds.forEach((id) => next.add(id));
          sel.replace(next);
          onSelectionChangeRef.current?.({ kind: "group", via: "key", count: next.size });
          break;
        }

        case "clearSelection": {
          const sel = selectionRef.current;
          if (sel && sel.current().size > 0) {
            consume();
            sel.replace(new Set());
            anchorRef.current = null;
            anchorBaseRef.current = new Set();
            onSelectionChangeRef.current?.({ kind: "group", via: "key", count: 0 });
          }
          // empty (or no adapter): do NOT consume — Escape is free in the list.
          break;
        }

        case "enter":
          if (isNativeControl(document.activeElement)) break;
          consume();
          onActionRef.current("primary", activeItemId, activeSegment, modifiers(e));
          break;

        case "space":
          if (isNativeControl(document.activeElement)) break;
          consume();
          onActionRef.current("toggle", activeItemId, activeSegment, modifiers(e));
          break;

        case "edit":
          // Single-row edit/rename (e.g. Streams → open AddStreamDialog in edit
          // mode). Unlike "delete" this never fans out to the selection; the
          // consumer routes it by activeItemId. Lists that don't handle "edit"
          // simply ignore it (the consume below still mutes the bare key).
          consume();
          onActionRef.current("edit", activeItemId, activeSegment, modifiers(e));
          break;

        case "delete":
          consume();
          onActionRef.current("delete", activeItemId, activeSegment, modifiers(e));
          break;

        case "edit-content":
        case "transfer-copy":
        case "transfer-move":
          // Generic row intents: edit the row's content (Songs: tags), hand the
          // row somewhere else (Streams: copy/move to another profile). Like
          // edit/delete they are NOT gated on isNativeControl — they fire from
          // any segment, action buttons included. Lists that don't handle them
          // ignore them; the consume() still mutes the bare key. Each intent
          // name IS the ActionType name, so it forwards to onAction untranslated.
          consume();
          onActionRef.current(action, activeItemId, activeSegment, modifiers(e));
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeItemId, activeSegment, items, cursorOnTrailing, moveFocus, moveToTrailing, toggleSelection, setAnchor, rangeIds],
  );

  /* ---------------------------------------------------------------- */
  /* Trailing stop activation                                          */
  /* ---------------------------------------------------------------- */

  /**
   * What the pending activation needs to settle: the row count when it fired,
   * and its wording. The wording is captured HERE rather than read afterwards —
   * an exhausted list drops the trailing stop in the very commit that resolves
   * it, so by then the descriptor holding the message is already gone.
   */
  const appendBaseRef = useRef<{ base: number; exhaustedMessage: string } | null>(null);
  // Bumped when the action RESOLVES, so focus settles in a commit where the new
  // rows are already in the DOM. A ref alone cannot do this: the "nothing new
  // arrived" outcome changes nothing React would re-render for.
  const [appendTick, setAppendTick] = useState(0);

  /**
   * Enter, Space and a click all land here — one behaviour, no modality to tell
   * apart. The three outcomes and where each leaves the cursor are the list's
   * business, not the consumer's (ADR §4).
   */
  const activateTrailing = useCallback(async () => {
    const stop = trailingStopRef.current;
    if (!stop || stop.busy) return; // busy is the guard `disabled` is not allowed to be
    appendBaseRef.current = {
      base: itemsRef.current.length,
      exhaustedMessage: stop.exhaustedMessage,
    };
    try {
      await stop.onActivate();
    } catch {
      // Failed: rows and cursor untouched, focus stays on the button that failed.
      // Saying so is the consumer's job — it owns the wording of its failure.
      appendBaseRef.current = null;
      return;
    }
    setAppendTick((n) => n + 1);
  }, []);

  useLayoutEffect(() => {
    const pending = appendBaseRef.current;
    if (pending == null) return;
    appendBaseRef.current = null;
    const rows = itemsRef.current;
    if (rows.length === 0) return;
    // Focus the row NOW as well as queueing it: the trailing stop can unmount in
    // this very commit (the last batch turns "load more" off), and without this
    // focus would visit <body> in between.
    const land = (id: string) => {
      moveFocus(id, 'summary');
      listRef.current
        ?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"][data-segment="summary"]`)
        ?.focus();
    };
    if (rows.length > pending.base) {
      // New rows are inserted BEFORE the button, so staying on the button would
      // mean standing behind everything that just arrived. No announcement: the
      // landed row is itself the answer, and a second voice on the same event
      // would talk over it (ADR 2026-08-31 on visible carriers).
      land(rows[pending.base].id);
      return;
    }
    // Nothing new. The button is about to disappear, and its two states — there
    // or not — are the only carrier this fact has inside a role="application"
    // list, so the fact is spoken as well.
    land(rows[rows.length - 1].id);
    if (pending.exhaustedMessage) announce(pending.exhaustedMessage, 'polite');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appendTick]);

  // Delegated mouse selection on the <ul> (only active when `selection` is set),
  // mirroring onContextMenu. All gestures move DOM focus to the clicked row, so
  // NVDA reads it (with the ", виділено" suffix) — that's why single-row pointer
  // changes are emitted via:"pointer" (the consumer must NOT re-announce them).
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      const sel = selectionRef.current;
      if (!sel) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // The row's own controls handle their own clicks.
      if (target.closest("button, a, input, select, textarea")) return;
      const row = target.closest<HTMLElement>("[data-item-id]");
      const id = row?.dataset.itemId;
      if (!id || !items.some((it) => it.id === id)) return;

      // A click is a deliberate position — pin the re-seed effect off.
      userNavigatedRef.current = true;
      // Move active + DOM focus to the clicked row.
      setActiveItemId(id);
      setActiveSegment("summary");
      pendingFocusRef.current = { itemId: id, segment: "summary" };

      if (e.ctrlKey && !e.shiftKey) {
        toggleSelection(id, "pointer");
        return;
      }
      if (e.shiftKey) {
        if (sel.current().size === 0) {
          // Explorer-inclusive (mirrors the keyboard branch): anchor to the
          // PREVIOUSLY-active row so it joins the span, not the clicked id.
          // Read from memoryRef.current (always fresh) — activeItemId is not in
          // this callback's deps, so its closure value would be stale.
          anchorRef.current = memoryRef.current.itemId;
          anchorBaseRef.current = new Set();
        }
        if (anchorRef.current == null) anchorRef.current = id;
        const span = rangeIds(anchorRef.current, id);
        const next = new Set(anchorBaseRef.current);
        for (const x of span) next.add(x);
        sel.replace(next);
        onSelectionChangeRef.current?.({ kind: "group", via: "pointer", count: next.size });
        return;
      }
      // Simple click → collapse to {id}, anchor here.
      sel.replace(new Set([id]));
      setAnchor(id);
      onSelectionChangeRef.current?.({ kind: "single", via: "pointer", count: 1, lastId: id, selected: true });
    },
    [items, rangeIds, setAnchor, toggleSelection],
  );

  // Single source of truth for the per-row context menu: WebView2 emits a
  // `contextmenu` event for right-click, the Menu key, AND Shift+F10. Handling
  // it here suppresses the native menu and opens the row's own menu for all three.
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Always suppress the native WebView2 menu inside the list — a role=application
      // list has no selectable text or inputs, so the native menu shows nothing useful.
      e.preventDefault();

      const row = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-item-id]');
      const itemId = row?.dataset.itemId;
      if (!itemId || !items.some((it) => it.id === itemId)) return; // empty list space → just suppress

      // Make the row active WITHOUT queuing programmatic focus (no pendingFocusRef):
      // React Aria owns focus once the menu opens, and a pending focus would fight it.
      setActiveItemId(itemId);
      setActiveSegment('summary');

      // Open the menu, anchored to this row's ⋯ trigger (shared DOM convention).
      const trigger = listRef.current?.querySelector<HTMLElement>(
        `[data-item-id="${CSS.escape(itemId)}"][data-context-menu-trigger]`,
      );
      trigger?.click();
    },
    [items],
  );

  /** isFocused(itemId, segment) → true iff this element should have tabIndex=0 */
  const isFocused = useCallback(
    (itemId: string, segment: SegmentKind): boolean =>
      !cursorOnTrailing && activeItemId === itemId && activeSegment === segment,
    [activeItemId, activeSegment, cursorOnTrailing],
  );

  /** Called when zone receives focus from outside (Tab/F6 entry). */
  const restoreFocus = useCallback(
    (_direction: 'forward' | 'backward') => {
      // Entry always lands on a row: the memory never learned the stop (ADR §3).
      setOnTrailing(false);
      if (items.length === 0) {
        // No rows to land on. Focus the empty-state region (CompositeList renders
        // it as a focusable [data-zone-id] anchor) so the zone still ACCEPTS focus
        // — otherwise cycleZone sees no focus change and skips the whole list,
        // landing on a later zone (the reported wishlist Tab→status-bar bug).
        // NVDA then reads the empty message. During loading/error there is no
        // emptyRef, so focus declines exactly as before.
        emptyRef.current?.focus();
        return;
      }
      const mem = memoryRef.current;
      let targetIdx: number;
      let targetSeg: SegmentKind;

      if (!userNavigatedRef.current) {
        // The user has never deliberately moved within the list, so there is no
        // real remembered position — the memory is just the (possibly reordered)
        // mount-time seed. Land on the current first visible row. The re-seed
        // effect normally keeps the seed correct already; this is the belt-and
        // -suspenders for the entry path.
        targetIdx = 0;
        targetSeg = 'summary';
      } else {
        const existingIdx = items.findIndex((it) => it.id === mem.itemId);
        if (existingIdx >= 0) {
          targetIdx = existingIdx;
          const item = items[existingIdx];
          const segs = resolveSegments(item);
          targetSeg = segs.includes(mem.activeSegment) ? mem.activeSegment : 'summary';
        } else {
          targetIdx = Math.max(0, Math.min(mem.prevIndex, items.length - 1));
          targetSeg = 'summary';
        }
      }

      const target = items[targetIdx];
      setActiveItemId(target.id);
      setActiveSegment(targetSeg);
      if (listRef.current) listRef.current.scrollTop = mem.scrollTop;
      // Focus immediately: React bails out of re-render when state values haven't changed
      // (user returns to the same position), so useLayoutEffect would never fire in that case.
      // tabIndex=-1 elements are still focusable programmatically.
      const el = listRef.current?.querySelector<HTMLElement>(
        `[data-item-id="${CSS.escape(target.id)}"][data-segment="${targetSeg}"]`,
      );
      // The queue is the FALLBACK, not a belt: arming it as well would leave it
      // armed exactly in the bail-out case this focus call exists for, and the
      // next commit — for any reason at all — would then pull focus back into
      // the list from wherever the person had since moved it.
      if (el) el.focus();
      else pendingFocusRef.current = { itemId: target.id, segment: targetSeg };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  );

  return {
    listRef, emptyRef, trailingRef, onKeyDownCapture, onContextMenu, onClick,
    isFocused, isTrailingFocused: cursorOnTrailing, activateTrailing,
    restoreFocus, focusItem, activeItemId, activeSegment,
  };
}
