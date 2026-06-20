// src/components/wishlist/PatternList.test.tsx
import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act, waitFor } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $patternSelection } from "../../stores/wishlist";
import { $announcer } from "../../stores/announcer";
import { replaceSelection } from "../../stores/selection";
import { PatternList, type PatternListHandle } from "./PatternList";

beforeEach(() => replaceSelection($patternSelection, new Set()));

function renderList(onBulkRemove = vi.fn().mockResolvedValue(2)) {
  const ref = createRef<PatternListHandle>();
  const items = [{ pattern: "*ad*" }, { pattern: "*jingle*" }, { pattern: "*promo*" }];
  const utils = render(
    <PatternList ref={ref} items={items} ariaLabel="Wishlist" showDate={false}
      emptyMessage="empty" exitZone={vi.fn()} onEmpty={vi.fn()} onEdit={vi.fn()}
      onRemove={vi.fn()} onBulkRemove={onBulkRemove} />,
  );
  return { ref, onBulkRemove, items, ...utils };
}

it("requestBulkRemove confirms with the count, calls onBulkRemove, announces the summary", async () => {
  replaceSelection($patternSelection, new Set(["*ad*", "*promo*"]));
  const { ref, onBulkRemove, getByText } = renderList();
  act(() => ref.current!.requestBulkRemove());
  expect(getByText(m.confirm_delete_selected_patterns({ count: 2 }))).toBeTruthy();
  fireEvent.click(getByText(m["delete"]())); // default confirm label
  await waitFor(() => expect(onBulkRemove).toHaveBeenCalledWith(["*ad*", "*promo*"]));
  await waitFor(() => expect($announcer.get()?.message).toBe(m.patterns_removed_bulk({ count: 2 })));
});
