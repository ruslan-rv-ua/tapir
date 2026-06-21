import { Modal, ModalOverlay, Dialog, Heading } from "react-aria-components";
import type { ProfileMeta } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import { getLocale } from "../../i18n/paraglide/runtime";

export type TransferSubject = { kind: "single"; name: string } | { kind: "bulk"; count: number };

/** Localized "{count} streams" — mirrors ProfileItem so NVDA hears the same phrasing everywhere. */
function streamCountLabel(count: number): string {
  const category = new Intl.PluralRules(getLocale()).select(count);
  switch (category) {
    case "one":
      return m.profile_stream_count_one({ count });
    case "few":
      return m.profile_stream_count_few({ count });
    case "many":
      return m.profile_stream_count_many({ count });
    default:
      return m.profile_stream_count_other({ count });
  }
}

interface Props {
  mode: "copy" | "move";
  /** What is being transferred — drives the title by ROUTE, not by count (finding 2). */
  subject: TransferSubject;
  /** Non-active profiles the stream(s) can be sent to. */
  profiles: ProfileMeta[];
  onSelect: (profileName: string) => void;
  onCreateNew: () => void;
  onCancel: () => void;
}

export function StreamTransferDialog({ mode, subject, profiles, onSelect, onCreateNew, onCancel }: Props) {
  const title =
    subject.kind === "bulk"
      ? mode === "copy"
        ? m.copy_selected_to_profile_title({ count: subject.count })
        : m.move_selected_to_profile_title({ count: subject.count })
      : mode === "copy"
        ? m.copy_stream_to_profile_title({ name: subject.name })
        : m.move_stream_to_profile_title({ name: subject.name });

  const optionClass =
    "flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-slate-200 outline-none hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400";

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      isOpen
      onOpenChange={(open) => { if (!open) onCancel(); }}
    >
      <Modal className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <Dialog className="outline-none flex flex-col gap-4">
          <Heading slot="title" className="text-base font-semibold text-slate-100">{title}</Heading>

          {profiles.length === 0 ? (
            <p className="text-sm text-slate-400">{m.transfer_no_other_profiles()}</p>
          ) : (
            <ul aria-label={m.transfer_target_profiles()} className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {profiles.map((p, i) => (
                <li key={p.name}>
                  <button
                    autoFocus={i === 0}
                    onClick={() => onSelect(p.name)}
                    aria-label={`${p.name}, ${streamCountLabel(p.streamCount)}`}
                    className={optionClass}
                  >
                    <span className="truncate">{p.name}</span>
                    <span
                      aria-hidden="true"
                      className="ml-2 inline-flex min-w-[1.5rem] justify-center rounded-full bg-slate-700/80 px-1.5 text-[10px] leading-5 text-slate-300 forced-colors:border forced-colors:border-[ButtonText]"
                    >
                      {p.streamCount}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            autoFocus={profiles.length === 0}
            onClick={onCreateNew}
            className="rounded px-3 py-2 text-left text-sm text-blue-300 outline-none hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
          >
            {m.transfer_create_new_profile()}
          </button>

          <div className="flex justify-end">
            <button
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-sm text-slate-300 outline-none hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:text-[ButtonText]"
            >
              {m.cancel()}
            </button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
