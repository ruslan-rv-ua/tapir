import { SHORTCUTS, type ShortcutGroup } from "../../lib/shortcuts";
import * as m from "../../i18n/paraglide/messages";

const GROUP_ORDER: ShortcutGroup[] = ["global", "navigation", "context", "list"];

const GROUP_LABEL: Record<ShortcutGroup, () => string> = {
  global: m.shortcuts_group_global,
  navigation: m.shortcuts_group_navigation,
  context: m.shortcuts_group_context,
  list: m.shortcuts_group_list,
};

/** Data-driven shortcuts reference — the single source of truth is SHORTCUTS. */
export function ShortcutsHelp() {
  return (
    <>
      {GROUP_ORDER.map((group) => {
        const rows = SHORTCUTS.filter((s) => s.group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} aria-label={GROUP_LABEL[group]()} className="mb-4 last:mb-0">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              {GROUP_LABEL[group]()}
            </h2>
            <dl className="flex flex-col gap-1">
              {rows.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-4 text-sm">
                  <dt className="text-slate-300">{s.label()}</dt>
                  <dd>
                    <kbd className="rounded border border-slate-600 bg-slate-900 px-2 py-0.5 font-mono text-xs text-slate-200">
                      {s.combo}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </>
  );
}
