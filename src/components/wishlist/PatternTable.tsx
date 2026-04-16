import { Table, TableHeader, TableBody, Column, Row, Cell } from "react-aria-components";
import { createPortal } from "react-dom";
import { useState } from "react";
import { ConfirmDialog } from "../common/ConfirmDialog";
import * as m from "../../i18n/paraglide/messages";

interface PatternItem {
  pattern: string;
  addedAt?: string; // undefined for ignorelist entries
}

interface Props {
  items: PatternItem[];
  ariaLabel: string;
  showDate: boolean;
  emptyMessage: string;
  onEdit: (pattern: string) => void;
  onRemove: (pattern: string) => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function PatternTable({ items, ariaLabel, showDate, emptyMessage, onEdit, onRemove }: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <>
      <Table aria-label={ariaLabel} className="w-full text-sm">
        <TableHeader>
          <Column isRowHeader className="px-3 py-2 text-left text-xs font-medium text-slate-400">
            {m.column_pattern()}
          </Column>
          {showDate && (
            <Column className="px-3 py-2 text-left text-xs font-medium text-slate-400">
              {m.column_added_at()}
            </Column>
          )}
          <Column className="px-3 py-2 text-right text-xs font-medium text-slate-400">
            {m.column_actions()}
          </Column>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <Row key={item.pattern} className="border-b border-slate-800 hover:bg-slate-800/50 forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]">
              <Cell className="px-3 py-2 font-mono text-slate-200">{item.pattern}</Cell>
              {showDate && (
                <Cell className="px-3 py-2 text-slate-400">
                  {item.addedAt ? formatDate(item.addedAt) : "—"}
                </Cell>
              )}
              <Cell className="px-3 py-2 text-right">
                <div className="flex justify-end gap-1">
                  <button
                    onClick={() => onEdit(item.pattern)}
                    aria-label={`${m.edit_pattern()}: ${item.pattern}`}
                    className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => setConfirmDelete(item.pattern)}
                    aria-label={`${m.remove_pattern()}: ${item.pattern}`}
                    className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300"
                  >
                    ✕
                  </button>
                </div>
              </Cell>
            </Row>
          ))}
        </TableBody>
      </Table>
      {confirmDelete && createPortal(
        <ConfirmDialog
          title={m.remove_pattern()}
          message={m.confirm_remove_pattern({ pattern: confirmDelete })}
          onConfirm={() => {
            onRemove(confirmDelete);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />,
        document.body
      )}
    </>
  );
}
