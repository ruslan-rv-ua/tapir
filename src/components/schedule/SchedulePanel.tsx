import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@nanostores/react";
import {
  $schedules, $schedulesError, $schedulesLoading, loadSchedules,
} from "../../stores/schedule";
import { ScheduleTable, type ScheduleTableHandle } from "./ScheduleTable";
import { ScheduleForm } from "./ScheduleForm";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { ListCard, ListCardState } from "../common/ListCard";
import { ScreenHeader } from "../layout/ScreenHeader";
import { ScreenZone } from "../layout/ScreenZone";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { useAnnounce } from "../../hooks/useAnnounce";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as tauri from "../../lib/tauri";
import type { ScheduleDto, ScheduledRecording } from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

export function SchedulePanel({ onZonesChange, exitZone }: Props) {
  const schedules = useStore($schedules);
  const loading = useStore($schedulesLoading);
  const error = useStore($schedulesError);
  const announce = useAnnounce();

  const tableRef = useRef<ScheduleTableHandle | null>(null);
  // Stable proxy: таблиця демонтується на loading/error/empty — App не повинен
  // тримати мертвий ZoneEntry, інакше F6 мовчки глухне (патерн SongsPanel).
  const tableProxyRef = useRef<ZoneEntry>({
    id: "schedule-list",
    get el() { return tableRef.current?.el as HTMLElement; },
    focus: (dir) => tableRef.current?.focus(dir),
  });

  const [formFor, setFormFor] = useState<{ schedule: ScheduleDto | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ScheduleDto | null>(null);

  useEffect(() => { loadSchedules(); }, []);

  // ── Toolbar zone (одна кнопка «Додати розклад») ──
  const toolbarZoneRef = useRef<HTMLDivElement | null>(null);
  const addBtn = useRef<HTMLButtonElement | null>(null);
  const toolbarRefs = useMemo(() => [addBtn], []);
  const {
    onKeyDown: toolbarKeyDown,
    getTabIndex: toolbarTabIndex,
    restoreFocus: toolbarRestore,
  } = useRovingFocus(toolbarRefs, "horizontal", {
    mode: "mixed-boundary-handoff",
    onTabBoundary: (forward) => exitZone("schedule-toolbar", forward),
  });

  const hasRows = !loading && !error && schedules.length > 0;

  useEffect(() => {
    const toolbarZone: ZoneEntry = {
      id: "schedule-toolbar",
      get el() { return toolbarZoneRef.current!; },
      focus: toolbarRestore,
    };
    const zones: ZoneEntry[] = [toolbarZone];
    if (hasRows) zones.push(tableProxyRef.current);
    onZonesChange(zones);
  // onZonesChange — стабільний reference від App.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolbarRestore, hasRows]);

  const find = (id: string) => $schedules.get().find((s) => s.id === id);

  const handleToggle = async (id: string) => {
    const s = find(id);
    if (!s) return;
    try {
      const updated = await tauri.toggleSchedule(id, !s.enabled);
      announce(
        updated.enabled
          ? m.schedule_toggled_on({ name: updated.name })
          : m.schedule_toggled_off({ name: updated.name }),
        "assertive",
      );
      await loadSchedules();
    } catch (e) {
      // Напр., увімкнення відпрацьованого oneshot — помилка валідації (§2).
      addToast(String(e), "error");
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await tauri.deleteSchedule(confirmDelete.id);
      announce(m.schedule_deleted({ name: confirmDelete.name }), "assertive");
      await loadSchedules();
      requestAnimationFrame(() => {
        if ($schedules.get().length > 0) tableRef.current?.focus("forward");
        else addBtn.current?.focus();
      });
    } catch (e) {
      addToast(String(e), "error");
    }
    setConfirmDelete(null);
  };

  const handleSaved = async (saved: ScheduledRecording, isNew: boolean) => {
    setFormFor(null);
    announce(
      isNew ? m.schedule_added({ name: saved.name }) : m.schedule_saved({ name: saved.name }),
      "assertive",
    );
    await loadSchedules();
    requestAnimationFrame(() => tableRef.current?.focusSchedule(saved.id));
  };

  return (
    <div role="region" aria-label={m.schedule_section()} className="flex flex-1 flex-col overflow-hidden">
      {/* ── Toolbar zone ── */}
      <ScreenZone
        ref={toolbarZoneRef}
        id="schedule-toolbar"
        role="application"
        label={m.zone_schedule_toolbar()}
        onKeyDown={toolbarKeyDown}
      >
        <ScreenHeader title={m.schedule_section()}>
          <button
            ref={addBtn}
            tabIndex={toolbarTabIndex(0)}
            onClick={() => setFormFor({ schedule: null })}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:border forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]"
          >
            {m.schedule_add()}
          </button>
        </ScreenHeader>
      </ScreenZone>

      {/* ── Таблиця / стани ── */}
      <ListCard>
        {loading && (
          <ListCardState role="status" className="text-slate-400">
            {m.schedule_loading()}
          </ListCardState>
        )}
        {error && (
          <ListCardState role="alert" className="text-red-400">
            {m.schedule_error({ error })}
          </ListCardState>
        )}
        {!loading && !error && schedules.length === 0 && (
          <ListCardState role="status">{m.schedule_empty()}</ListCardState>
        )}
        {hasRows && (
          <ScheduleTable
            ref={tableRef}
            exitZone={(forward) => exitZone("schedule-list", forward)}
            onEmpty={() => addBtn.current?.focus()}
            onToggle={handleToggle}
            onEdit={(id) => { const s = find(id); if (s) setFormFor({ schedule: s }); }}
            onDelete={(id) => { const s = find(id); if (s) setConfirmDelete(s); }}
          />
        )}
      </ListCard>

      {/* ── Діалоги (portalled) ── */}
      {formFor && createPortal(
        <ScheduleForm
          schedule={formFor.schedule}
          onSaved={handleSaved}
          onClose={() => setFormFor(null)}
        />,
        document.body,
      )}

      {confirmDelete && createPortal(
        <ConfirmDialog
          title={m.schedule_confirm_delete_title()}
          message={m.schedule_confirm_delete_body({ name: confirmDelete.name })}
          confirmLabel={m.schedule_action_delete()}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />,
        document.body,
      )}
    </div>
  );
}
