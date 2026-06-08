import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $shortcutsHelpOpen } from "../../stores/navigation";
import { SHORTCUTS, type ShortcutGroup } from "../../lib/shortcuts";
import * as m from "../../i18n/paraglide/messages";

const GROUP_ORDER: ShortcutGroup[] = ["global", "navigation", "context", "list"];

const GROUP_LABEL: Record<ShortcutGroup, () => string> = {
  global: m.shortcuts_group_global,
  navigation: m.shortcuts_group_navigation,
  context: m.shortcuts_group_context,
  list: m.shortcuts_group_list,
};

export function KeyboardShortcutsDialog() {
  const isOpen = useStore($shortcutsHelpOpen);
  if (!isOpen) return null;

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) $shortcutsHelpOpen.set(false);
      }}
      isDismissable
    >
      <Modal className="flex max-h-[80vh] w-[90vw] max-w-lg flex-col rounded-lg bg-slate-800 shadow-2xl outline-none">
        <Dialog aria-label={m.shortcuts_help_title()} className="flex h-full flex-col outline-none">
          <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
            <Heading slot="title" className="text-lg font-semibold text-slate-100">
              {m.shortcuts_help_title()}
            </Heading>
            <button
              onClick={() => $shortcutsHelpOpen.set(false)}
              aria-label={m.settings_close()}
              className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              ✖
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {GROUP_ORDER.map((group) => {
              const rows = SHORTCUTS.filter((s) => s.group === group);
              if (rows.length === 0) return null;
              return (
                <section key={group} aria-label={GROUP_LABEL[group]()} className="mb-4 last:mb-0">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
                    {GROUP_LABEL[group]()}
                  </h3>
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
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
