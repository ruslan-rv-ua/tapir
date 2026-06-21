import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render, fireEvent } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { SelectionToolbar } from "./SelectionToolbar";

function renderToolbar(over: Partial<Parameters<typeof SelectionToolbar>[0]> = {}) {
  const props = {
    selCount: 2,
    visibleCount: 5,
    allVisibleSelected: false,
    selectAllRef: createRef<HTMLButtonElement>(),
    actionRef: createRef<HTMLButtonElement>(),
    actionLabel: m.delete_selected({ count: 2 }),
    onSelectAll: vi.fn(),
    onAction: vi.fn(),
    ...over,
  };
  return { props, ...render(<SelectionToolbar {...props} />) };
}

describe("SelectionToolbar", () => {
  it("toggles the select-all label between select_all and clear_selection", () => {
    const { getByText, rerender, props } = renderToolbar();
    expect(getByText(m.select_all())).toBeTruthy();
    rerender(<SelectionToolbar {...props} allVisibleSelected={true} />);
    expect(getByText(m.clear_selection())).toBeTruthy();
  });

  it("disables select-all when there are no visible rows", () => {
    const { props } = renderToolbar({ visibleCount: 0 });
    expect(props.selectAllRef.current!.getAttribute("aria-disabled")).toBe("true");
  });

  it("disables the action and does not fire it when selection is empty", () => {
    const { props } = renderToolbar({ selCount: 0, actionLabel: m.delete_selected({ count: 0 }) });
    expect(props.actionRef.current!.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(props.actionRef.current!);
    expect(props.onAction).not.toHaveBeenCalled();
  });

  it("the action button's visible text equals its accessible name", () => {
    const { props } = renderToolbar();
    expect(props.actionRef.current!.textContent).toBe(m.delete_selected({ count: 2 }));
    expect(props.actionRef.current!.getAttribute("aria-label")).toBe(m.delete_selected({ count: 2 }));
  });

  it("fires onAction when selection is non-empty", () => {
    const { props } = renderToolbar();
    fireEvent.click(props.actionRef.current!);
    expect(props.onAction).toHaveBeenCalled();
  });

  it("shows a non-live count and renders it only when selCount > 0", () => {
    const { queryByText, rerender, props } = renderToolbar();
    expect(queryByText(m.selected_count_label({ count: 2 }))).toBeTruthy();
    rerender(<SelectionToolbar {...props} selCount={0} actionLabel={m.delete_selected({ count: 0 })} />);
    expect(queryByText(m.selected_count_label({ count: 0 }))).toBeNull();
  });
});
