import { forwardRef, useMemo } from "react";
import { CompositeList, CompositeRow } from "../common/composite-list";
import { ListCardState } from "../common/ListCard";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { WishlistMatch } from "../../lib/tauri";
import { formatTime } from "../../lib/formatters";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  items: WishlistMatch[];
  exitZone: (forward: boolean) => void;
  /**
   * Порожній стан несе один факт, без якого порожній екран брехав би, і який
   * саме — залежить від вішліста, тож обирає його батько.
   */
  emptyMessage: string;
}

/**
 * Журнал збігів — хронологія для рідкісної події станції (ADR 2026-08-31
 * «Носії для подій станції» §3, §5).
 *
 * Дій над рядком немає навмисно: у момент збігу файлу ще може не бути
 * (`emit_wishlist_match` спрацьовує на початку треку, файл з'явиться на
 * finalize — і не завжди), а місце, де живуть файли, у застосунку вже є і
 * зветься «Збережені треки». Звідси й `segments: []` — рядок читається цілком,
 * розкладати його на зупинки `←`/`→` нема на що.
 */
export const MatchList = forwardRef<ZoneEntry, Props>(({ items, exitZone, emptyMessage }, ref) => {
  const listItems = useMemo(
    () => items.map((item) => ({ id: String(item.id), segments: [] as [] })),
    [items],
  );

  return (
    <CompositeList
      ref={ref}
      zoneId="wishlist-matches"
      ariaLabel={m.zone_wishlist_matches()}
      items={listItems}
      className="flex-1 overflow-auto"
      onTabOut={exitZone}
      // Рядок нічого не робить: Enter/Delete тут без адресата.
      onAction={() => {}}
      emptyLabel={emptyMessage}
      empty={<ListCardState role="status">{emptyMessage}</ListCardState>}
      renderRow={({ id, isActive, isFocused }) => {
        const item = items.find((it) => String(it.id) === id)!;
        const time = formatTime(item.matchedAt);
        const track = `${item.artist} — ${item.title}`;
        return (
          <CompositeRow
            key={id}
            itemId={id}
            isFocused={isFocused}
            isActiveRow={isActive}
            // Чотири факти одним рядком — журнал читають підряд, а не
            // обходять посегментно.
            label={m.match_row({ time, station: item.stationName, track, pattern: item.pattern })}
            roleDescription={m.item_role_match()}
            className="grid items-baseline border-b border-slate-800 forced-colors:border-[ButtonText]"
            activeClassName="bg-slate-800/60"
            style={{ gridTemplateColumns: "auto minmax(0,1fr) minmax(0,1.5fr) minmax(0,1fr)" }}
          >
            {/* Візуальні колонки; доступна назва рядка вже стоїть на <li>. */}
            <div className="px-3 py-2 text-sm tabular-nums text-slate-400">{time}</div>
            <div className="truncate px-3 py-2 text-sm text-slate-400">{item.stationName}</div>
            <div className="truncate px-3 py-2 text-slate-200">{track}</div>
            <div className="truncate px-3 py-2 font-mono text-sm text-slate-500">{item.pattern}</div>
          </CompositeRow>
        );
      }}
    />
  );
});
MatchList.displayName = "MatchList";
