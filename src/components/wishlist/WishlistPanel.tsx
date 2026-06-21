import { Button, Tabs, TabList, Tab, TabPanel } from "react-aria-components";
import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@nanostores/react";
import { PatternList, type PatternListHandle } from "./PatternList";
import { SelectionToolbar } from "../common/SelectionToolbar";
import { AddPatternDialog } from "./AddPatternDialog";
import { ScreenZone } from "../layout/ScreenZone";
import { ScreenHeader } from "../layout/ScreenHeader";
import { ListCard } from "../common/ListCard";
import { useFocusBoundary } from "../../hooks/useFocusBoundary";
import { useAnnounce } from "../../hooks/useAnnounce";
import { addToast } from "../../stores/toasts";
import { $wishlist, $ignorelist, $patternSelection } from "../../stores/wishlist";
import { replaceSelection } from "../../stores/selection";
import * as tauri from "../../lib/tauri";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as m from "../../i18n/paraglide/messages";

type DialogState =
  | null
  | { mode: "add"; listType: "wishlist" | "ignorelist"; initialPattern?: string }
  | { mode: "edit"; listType: "wishlist" | "ignorelist"; pattern: string };

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

export function WishlistPanel({ onZonesChange, exitZone }: Props) {
  // --- Store subscriptions ---
  const wishlist = useStore($wishlist);
  const ignorelist = useStore($ignorelist);
  const selection = useStore($patternSelection);
  const selCount = selection.size;

  // --- Local state ---
  const [dialog, setDialog] = useState<DialogState>(null);
  const [activeTab, setActiveTab] = useState<"wishlist" | "ignorelist">("wishlist");
  const announce = useAnnounce();

  // Load data on mount
  useEffect(() => {
    tauri.getWishlist().then((w) => $wishlist.set(w)).catch((e) => { console.error(e); addToast(m.wishlist_load_error(), "error"); });
    tauri.getIgnorelist().then((i) => $ignorelist.set(i)).catch((e) => { console.error(e); addToast(m.wishlist_load_error(), "error"); });
  }, []);

  // --- Wishlist handlers ---
  const handleAddWishlist = useCallback(async (pattern: string) => {
    try {
      const entry = await tauri.addToWishlist(pattern);
      $wishlist.set([...$wishlist.get().filter((e) => e.pattern !== pattern), entry]);
      announce(m.announcement_pattern_added({ pattern }), "polite");
      setDialog(null);
    } catch (err) {
      addToast(String(err), "error");
    }
  }, [announce]);

  const handleEditWishlist = useCallback(async (newPattern: string) => {
    if (!dialog || dialog.mode !== "edit") return;
    try {
      const entry = await tauri.updateWishlistPattern(dialog.pattern, newPattern);
      $wishlist.set($wishlist.get().map((e) => e.pattern === dialog.pattern ? entry : e));
      announce(m.announcement_pattern_updated({ pattern: newPattern }), "polite");
      setDialog(null);
    } catch (err) {
      addToast(String(err), "error");
    }
  }, [dialog, announce]);

  const handleRemoveWishlist = useCallback(async (pattern: string) => {
    try {
      await tauri.removeFromWishlist(pattern);
      $wishlist.set($wishlist.get().filter((e) => e.pattern !== pattern));
      announce(m.announcement_pattern_removed({ pattern }), "polite");
    } catch (err) {
      addToast(String(err), "error");
    }
  }, [announce]);

  // --- Ignorelist handlers ---
  const handleAddIgnorelist = useCallback(async (pattern: string) => {
    try {
      await tauri.addToIgnorelist(pattern);
      $ignorelist.set([...$ignorelist.get().filter((p) => p !== pattern), pattern]);
      announce(m.announcement_pattern_added({ pattern }), "polite");
      setDialog(null);
    } catch (err) {
      addToast(String(err), "error");
    }
  }, [announce]);

  const handleEditIgnorelist = useCallback(async (newPattern: string) => {
    if (!dialog || dialog.mode !== "edit") return;
    try {
      await tauri.updateIgnorelistPattern(dialog.pattern, newPattern);
      $ignorelist.set($ignorelist.get().map((p) => p === dialog.pattern ? newPattern : p));
      announce(m.announcement_pattern_updated({ pattern: newPattern }), "polite");
      setDialog(null);
    } catch (err) {
      addToast(String(err), "error");
    }
  }, [dialog, announce]);

  const handleRemoveIgnorelist = useCallback(async (pattern: string) => {
    try {
      await tauri.removeFromIgnorelist(pattern);
      $ignorelist.set($ignorelist.get().filter((p) => p !== pattern));
      announce(m.announcement_pattern_removed({ pattern }), "polite");
    } catch (err) {
      addToast(String(err), "error");
    }
  }, [announce]);

  const handleDialogSubmit = useCallback((pattern: string) => {
    if (!dialog) return;
    if (dialog.mode === "edit") {
      if (dialog.listType === "wishlist") handleEditWishlist(pattern);
      else handleEditIgnorelist(pattern);
    } else {
      if (dialog.listType === "wishlist") handleAddWishlist(pattern);
      else handleAddIgnorelist(pattern);
    }
  }, [dialog, handleAddWishlist, handleEditWishlist, handleAddIgnorelist, handleEditIgnorelist]);

  // --- Zone navigation ---
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const patternListRef = useRef<PatternListHandle | null>(null);
  const addPatternBtnRef = useRef<HTMLButtonElement | null>(null);
  const selectAllBtnRef = useRef<HTMLButtonElement | null>(null);
  const deleteSelectedBtnRef = useRef<HTMLButtonElement | null>(null);

  const { refreshBoundary, restoreFocus: controlsRestore } = useFocusBoundary(
    controlsRef,
    (forward) => exitZone("wishlist-controls", forward),
  );

  // Re-discover boundary when tab changes
  useEffect(() => { refreshBoundary(); }, [activeTab, refreshBoundary]);

  // Memoize items to prevent identity churn in PatternList → restoreFocus
  const wishlistItems = useMemo(
    () => wishlist.map((e) => ({ pattern: e.pattern, addedAt: e.addedAt })),
    [wishlist],
  );
  const ignorelistItems = useMemo(
    () => ignorelist.map((p) => ({ pattern: p })),
    [ignorelist],
  );

  // --- Selection cluster ---
  const activeItems = activeTab === "wishlist" ? wishlistItems : ignorelistItems;
  const visibleIds = useMemo(() => activeItems.map((it) => it.pattern), [activeItems]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));

  const handleSelectAll = useCallback(() => {
    if (visibleIds.length === 0) return;
    const next = new Set(selection);
    if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    replaceSelection($patternSelection, next);
    announce(next.size === 0 ? m.selection_cleared() : m.selection_count({ count: next.size }), "polite");
  }, [visibleIds, allVisibleSelected, selection, announce]);

  const handleBulkRemove = useCallback(
    async (patterns: string[]): Promise<number> => {
      const drop = new Set(patterns);
      try {
        if (activeTab === "wishlist") {
          const n = await tauri.removeFromWishlistBulk(patterns);
          $wishlist.set($wishlist.get().filter((e) => !drop.has(e.pattern)));
          return n;
        }
        const n = await tauri.removeFromIgnorelistBulk(patterns);
        $ignorelist.set($ignorelist.get().filter((p) => !drop.has(p)));
        return n;
      } catch (err) {
        addToast(String(err), "error");
        throw err;
      }
    },
    [activeTab],
  );

  // Lifecycle: clear selection on tab change.
  useEffect(() => { replaceSelection($patternSelection, new Set()); }, [activeTab]);
  // Lifecycle: clear selection on unmount.
  useEffect(() => () => { replaceSelection($patternSelection, new Set()); }, []);

  // Stable callback ref — only sets the ref, useEffect handles zone registration
  const patternListCallbackRef = useCallback((zone: PatternListHandle | null) => {
    patternListRef.current = zone;
  }, []);

  // Stable proxy for the list zone. PatternList's ZoneEntry is recreated when its
  // items change (and the list remounts when switching tabs), but the registration
  // effect only re-runs on activeTab — so without the proxy a same-tab data change
  // could leave App holding a stale ZoneEntry whose focus() no-ops and F6 stalls.
  // The proxy is created once and always delegates to the CURRENT handle (the same
  // pattern App.tsx uses for permanent zones).
  const patternListProxyRef = useRef<ZoneEntry>({
    id: "wishlist-list",
    get el() { return patternListRef.current?.el as HTMLElement; },
    focus: (dir) => patternListRef.current?.focus(dir),
  });

  // Register zones whenever tab or controls restore changes
  useEffect(() => {
    const controlsZone: ZoneEntry = {
      id: "wishlist-controls",
      get el() { return controlsRef.current!; },
      focus: controlsRestore,
    };
    const zones: ZoneEntry[] = [controlsZone];
    if (patternListRef.current) zones.push(patternListProxyRef.current);
    onZonesChange(zones);
    // onZonesChange intentionally omitted — callers must pass a stable (useCallback-wrapped) reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, controlsRestore]);

  return (
    <Tabs
      selectedKey={activeTab}
      onSelectionChange={(k) => setActiveTab(k as "wishlist" | "ignorelist")}
      className="flex flex-1 flex-col overflow-hidden"
    >
      <div
        role="region"
        aria-label={m.wishlist_section()}
        className="flex flex-1 flex-col overflow-hidden"
      >
        {/* Screen title. The Add action lives in the controls zone below (with the
            Wishlist/Ignorelist tabs), so the <h1> itself carries no actions and is
            not part of a zone (FRD §7.1.3). */}
        <ScreenHeader title={m.wishlist_section()} />
        {/* Controls zone */}
        <ScreenZone
          ref={controlsRef}
          id="wishlist-controls"
          role="group"
          label={m.zone_wishlist_controls()}
          className="flex items-center gap-2 px-4 py-2"
        >
          <TabList
            aria-label={m.wishlist_section()}
            className="flex flex-1 gap-1"
          >
            <Tab
              id="wishlist"
              className="rounded px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 selected:bg-blue-600 selected:text-white text-slate-400 hover:text-slate-200 forced-colors:selected:bg-[Highlight] forced-colors:selected:text-[HighlightText]"
            >
              {m.wishlist_section_title()}
            </Tab>
            <Tab
              id="ignorelist"
              className="rounded px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 selected:bg-blue-600 selected:text-white text-slate-400 hover:text-slate-200 forced-colors:selected:bg-[Highlight] forced-colors:selected:text-[HighlightText]"
            >
              {m.ignorelist_section_title()}
            </Tab>
          </TabList>
          <Button
            ref={addPatternBtnRef}
            onPress={() => setDialog({ mode: "add", listType: activeTab })}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText] forced-colors:focus-visible:outline-[Highlight]"
          >
            {m.add_pattern()}
          </Button>
          <SelectionToolbar
            selCount={selCount}
            visibleCount={visibleIds.length}
            allVisibleSelected={allVisibleSelected}
            selectAllRef={selectAllBtnRef}
            actionRef={deleteSelectedBtnRef}
            actionLabel={m.delete_selected({ count: selCount })}
            onSelectAll={handleSelectAll}
            onAction={() => patternListRef.current?.requestBulkRemove()}
          />
        </ScreenZone>

        {/* Pattern list zones */}
        <TabPanel id="wishlist" className="flex flex-1 flex-col overflow-hidden">
          <ListCard>
            <PatternList
              ref={patternListCallbackRef}
              items={wishlistItems}
              ariaLabel={m.wishlist_section_title()}
              showDate={true}
              emptyMessage={m.empty_wishlist()}
              exitZone={(forward) => exitZone("wishlist-list", forward)}
              onEmpty={() => addPatternBtnRef.current?.focus()}
              onEdit={(pattern) => setDialog({ mode: "edit", listType: "wishlist", pattern })}
              onRemove={handleRemoveWishlist}
              onBulkRemove={handleBulkRemove}
            />
          </ListCard>
        </TabPanel>
        <TabPanel id="ignorelist" className="flex flex-1 flex-col overflow-hidden">
          <ListCard>
            <PatternList
              ref={patternListCallbackRef}
              items={ignorelistItems}
              ariaLabel={m.ignorelist_section_title()}
              showDate={false}
              emptyMessage={m.empty_ignorelist()}
              exitZone={(forward) => exitZone("wishlist-list", forward)}
              onEmpty={() => addPatternBtnRef.current?.focus()}
              onEdit={(pattern) => setDialog({ mode: "edit", listType: "ignorelist", pattern })}
              onRemove={handleRemoveIgnorelist}
              onBulkRemove={handleBulkRemove}
            />
          </ListCard>
        </TabPanel>
      </div>

      {/* Dialog */}
      {dialog && createPortal(
        <AddPatternDialog
          listType={dialog.listType}
          initialPattern={dialog.mode === "add" ? dialog.initialPattern : undefined}
          editingPattern={dialog.mode === "edit" ? dialog.pattern : undefined}
          onSubmit={handleDialogSubmit}
          onClose={() => setDialog(null)}
        />,
        document.body,
      )}
    </Tabs>
  );
}
