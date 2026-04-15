import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { PatternTable } from "./PatternTable";
import { AddPatternDialog } from "./AddPatternDialog";
import { useAnnounce } from "../../hooks/useAnnounce";
import { addToast } from "../../stores/toasts";
import * as tauri from "../../lib/tauri";
import type { WishlistEntry } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

type DialogState =
  | null
  | { mode: "add"; listType: "wishlist" | "ignorelist"; initialPattern?: string }
  | { mode: "edit"; listType: "wishlist" | "ignorelist"; pattern: string };

export function WishlistPanel() {
  const [wishlist, setWishlist] = useState<WishlistEntry[]>([]);
  const [ignorelist, setIgnorelist] = useState<string[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const announce = useAnnounce();

  // Load data on mount
  useEffect(() => {
    tauri.getWishlist().then(setWishlist).catch(console.error);
    tauri.getIgnorelist().then(setIgnorelist).catch(console.error);
  }, []);

  // --- Wishlist handlers ---
  const handleAddWishlist = useCallback(async (pattern: string) => {
    try {
      const entry = await tauri.addToWishlist(pattern);
      setWishlist((prev) => [...prev.filter((e) => e.pattern !== pattern), entry]);
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
      setWishlist((prev) => prev.map((e) => e.pattern === dialog.pattern ? entry : e));
      announce(m.announcement_pattern_updated({ pattern: newPattern }), "polite");
      setDialog(null);
    } catch (err) {
      addToast(String(err), "error");
    }
  }, [dialog, announce]);

  const handleRemoveWishlist = useCallback(async (pattern: string) => {
    try {
      await tauri.removeFromWishlist(pattern);
      setWishlist((prev) => prev.filter((e) => e.pattern !== pattern));
      announce(m.announcement_pattern_removed({ pattern }), "polite");
    } catch (err) {
      addToast(String(err), "error");
    }
  }, [announce]);

  // --- Ignorelist handlers ---
  const handleAddIgnorelist = useCallback(async (pattern: string) => {
    try {
      await tauri.addToIgnorelist(pattern);
      setIgnorelist((prev) => [...prev.filter((p) => p !== pattern), pattern]);
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
      setIgnorelist((prev) => prev.map((p) => p === dialog.pattern ? newPattern : p));
      announce(m.announcement_pattern_updated({ pattern: newPattern }), "polite");
      setDialog(null);
    } catch (err) {
      addToast(String(err), "error");
    }
  }, [dialog, announce]);

  const handleRemoveIgnorelist = useCallback(async (pattern: string) => {
    try {
      await tauri.removeFromIgnorelist(pattern);
      setIgnorelist((prev) => prev.filter((p) => p !== pattern));
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

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
      {/* Wishlist section */}
      <section aria-labelledby="wishlist-heading">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="wishlist-heading" className="text-sm font-semibold text-slate-300">
            {m.wishlist_section_title()}
          </h2>
          <button
            onClick={() => setDialog({ mode: "add", listType: "wishlist" })}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
          >
            {m.add_pattern()}
          </button>
        </div>
        <PatternTable
          items={wishlist.map((e) => ({ pattern: e.pattern, addedAt: e.addedAt }))}
          ariaLabel={m.wishlist_section_title()}
          showDate={true}
          emptyMessage={m.empty_wishlist()}
          onEdit={(pattern) => setDialog({ mode: "edit", listType: "wishlist", pattern })}
          onRemove={handleRemoveWishlist}
        />
      </section>

      {/* Ignorelist section */}
      <section aria-labelledby="ignorelist-heading">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="ignorelist-heading" className="text-sm font-semibold text-slate-300">
            {m.ignorelist_section_title()}
          </h2>
          <button
            onClick={() => setDialog({ mode: "add", listType: "ignorelist" })}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
          >
            {m.add_pattern()}
          </button>
        </div>
        <PatternTable
          items={ignorelist.map((p) => ({ pattern: p }))}
          ariaLabel={m.ignorelist_section_title()}
          showDate={false}
          emptyMessage={m.empty_ignorelist()}
          onEdit={(pattern) => setDialog({ mode: "edit", listType: "ignorelist", pattern })}
          onRemove={handleRemoveIgnorelist}
        />
      </section>

      {/* Dialog */}
      {dialog && createPortal(
        <AddPatternDialog
          listType={dialog.listType}
          initialPattern={dialog.mode === "add" ? dialog.initialPattern : undefined}
          editingPattern={dialog.mode === "edit" ? dialog.pattern : undefined}
          onSubmit={handleDialogSubmit}
          onClose={() => setDialog(null)}
        />,
        document.body
      )}
    </div>
  );
}