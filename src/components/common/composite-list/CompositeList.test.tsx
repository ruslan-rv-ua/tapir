import { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import type { ZoneEntry } from "../../../hooks/useZoneNavigation";
import type { CompositeListItem } from "../../../hooks/useCompositeList";
import { CompositeList, CompositeRow, CompositeSegment, CompositeAction } from "./index";

const ITEMS: CompositeListItem[] = [
  { id: "a", segments: ["metadata", "action-add"] },
  { id: "b", segments: ["metadata", "action-add"] },
];

function renderList(extra: Record<string, unknown> = {}) {
  const ref = createRef<ZoneEntry>();
  const onTabOut = vi.fn();
  const onAction = vi.fn();
  const utils = render(
    <CompositeList
      ref={ref}
      zoneId="test-list"
      ariaLabel="Test list"
      items={ITEMS}
      onTabOut={onTabOut}
      onAction={onAction}
      renderRow={({ id, isActive, isFocused }) => (
        <CompositeRow
          key={id}
          itemId={id}
          isFocused={isFocused}
          isActiveRow={isActive}
          label={`Row ${id}`}
          roleDescription="item"
          className="row"
          activeClassName="active"
        >
          <CompositeSegment
            itemId={id}
            segment="metadata"
            isFocused={isFocused}
            label={`meta ${id}`}
            roleDescription="meta"
          >
            m
          </CompositeSegment>
          <CompositeAction
            itemId={id}
            segment="action-add"
            isFocused={isFocused}
            label={`act ${id}`}
            onClick={() => onAction("primary", id, "action-add")}
          >
            x
          </CompositeAction>
          <button
            data-item-id={id}
            data-context-menu-trigger
            data-testid={`trigger-${id}`}
            onClick={() => onAction("primary", id, "action-menu")}
          >
            ⋯
          </button>
        </CompositeRow>
      )}
      {...extra}
    />,
  );
  return { ref, onTabOut, onAction, ...utils };
}

const activeAttrs = () => ({
  id: document.activeElement?.getAttribute("data-item-id") ?? null,
  seg: document.activeElement?.getAttribute("data-segment") ?? null,
});

describe("CompositeList", () => {
  it("renders a role=application list with the zone id and aria-label", () => {
    const { container } = renderList();
    const ul = container.querySelector("ul")!;
    expect(ul.getAttribute("role")).toBe("application");
    expect(ul.getAttribute("data-zone-id")).toBe("test-list");
    expect(ul.getAttribute("aria-label")).toBe("Test list");
  });

  it("renders each row as a listitem with roledescription and a roving tabIndex", () => {
    const { container } = renderList();
    const rows = container.querySelectorAll('li[data-segment="summary"]');
    expect(rows).toHaveLength(2);
    rows.forEach((li) => expect(li.getAttribute("aria-roledescription")).toBe("item"));
    expect((rows[0] as HTMLElement).tabIndex).toBe(0);
    expect((rows[1] as HTMLElement).tabIndex).toBe(-1);
  });

  it("renders segments as role=group and actions as native buttons", () => {
    const { container } = renderList();
    const seg = container.querySelector('[data-segment="metadata"]')!;
    expect(seg.getAttribute("role")).toBe("group");
    expect(seg.getAttribute("aria-roledescription")).toBe("meta");
    const action = container.querySelector('[data-segment="action-add"]')!;
    expect(action.tagName).toBe("BUTTON");
  });

  it("drives roving focus: entry focuses first row, ArrowDown moves to the next", () => {
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    expect(activeAttrs()).toEqual({ id: "a", seg: "summary" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(activeAttrs()).toEqual({ id: "b", seg: "summary" });
  });

  it("first entry lands on the current first row even if items reordered before focus", () => {
    // Repro of the streams-screen bug: the list mounts under one order (seeding the
    // active item from items[0]), then the persisted sort order arrives and reorders
    // the rows BEFORE the user ever tabs in. The first entry must land on the new
    // first row, not the stale mount-time seed.
    const ref = createRef<ZoneEntry>();
    const make = (order: string[]) => (
      <CompositeList
        ref={ref}
        zoneId="test-list"
        ariaLabel="Test list"
        items={order.map((id) => ({ id, segments: [] }))}
        onTabOut={vi.fn()}
        onAction={vi.fn()}
        renderRow={({ id, isActive, isFocused }) => (
          <CompositeRow key={id} itemId={id} isFocused={isFocused} isActiveRow={isActive} label={`Row ${id}`}>
            {`Row ${id}`}
          </CompositeRow>
        )}
      />
    );
    const { rerender } = render(make(["a", "b", "c"]));
    // Reorder before any focus (simulates the sort order arriving after mount).
    rerender(make(["c", "b", "a"]));
    act(() => ref.current!.focus("forward"));
    expect(activeAttrs()).toEqual({ id: "c", seg: "summary" });

    // Memory still works after the first entry: navigate away, leave, return.
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(activeAttrs()).toEqual({ id: "b", seg: "summary" });
    act(() => (document.activeElement as HTMLElement).blur());
    act(() => ref.current!.focus("forward"));
    expect(activeAttrs()).toEqual({ id: "b", seg: "summary" });
  });

  it("re-anchors the roving tabIndex=0 to the new first row after a reorder before any navigation", () => {
    // The roving tabIndex=0 stop is where a NATIVE Tab into the list lands (it does
    // not go through restoreFocus). If the list reorders before the user navigates,
    // that stop must follow to the new first row — otherwise native Tab focuses the
    // stale mount-time seed row, which is the streams-screen bug under "added" sort.
    const ref = createRef<ZoneEntry>();
    const make = (order: string[]) => (
      <CompositeList
        ref={ref}
        zoneId="test-list"
        ariaLabel="Test list"
        items={order.map((id) => ({ id, segments: [] }))}
        onTabOut={vi.fn()}
        onAction={vi.fn()}
        renderRow={({ id, isActive, isFocused }) => (
          <CompositeRow key={id} itemId={id} isFocused={isFocused} isActiveRow={isActive} label={`Row ${id}`}>
            {`Row ${id}`}
          </CompositeRow>
        )}
      />
    );
    const { rerender, container } = render(make(["a", "b", "c"]));
    const tab = (id: string) =>
      (container.querySelector(`li[data-item-id="${id}"][data-segment="summary"]`) as HTMLElement).tabIndex;
    expect(tab("a")).toBe(0); // mount-time seed: first row is the roving stop

    rerender(make(["c", "b", "a"])); // sort order arrives post-mount, before any nav
    expect(tab("c")).toBe(0); // new first row is now the roving stop
    expect(tab("a")).toBe(-1); // stale seed no longer holds it
  });

  it("Tab exits the zone via onTabOut", () => {
    const { ref, onTabOut } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(onTabOut).toHaveBeenCalledWith(true);
  });

  it("renders the empty slot instead of the <ul> when items is empty", () => {
    const ref = createRef<ZoneEntry>();
    const { container, queryByText } = render(
      <CompositeList
        ref={ref}
        zoneId="test-list"
        ariaLabel="Test list"
        items={[]}
        onTabOut={vi.fn()}
        onAction={vi.fn()}
        empty={<div>nothing here</div>}
        renderRow={() => null}
      />,
    );
    expect(container.querySelector("ul")).toBeNull();
    expect(queryByText("nothing here")).toBeTruthy();
  });

  it("renders the loading slot instead of the <ul>", () => {
    const ref = createRef<ZoneEntry>();
    const { container, queryByText } = render(
      <CompositeList
        ref={ref}
        zoneId="test-list"
        ariaLabel="Test list"
        items={ITEMS}
        onTabOut={vi.fn()}
        onAction={vi.fn()}
        loading={<div>loading…</div>}
        renderRow={() => null}
      />,
    );
    expect(container.querySelector("ul")).toBeNull();
    expect(queryByText("loading…")).toBeTruthy();
  });

  it("right-click on a row suppresses the native menu and clicks the row's trigger", () => {
    const { container, onAction } = renderList();
    const row = container.querySelector<HTMLElement>('[data-item-id="a"][data-segment="summary"]')!;
    const prevented = fireEvent.contextMenu(row, { bubbles: true }) === false;
    expect(prevented).toBe(true);
    expect(onAction).toHaveBeenCalledWith("primary", "a", "action-menu");
  });

  it("renders the footer after the rows inside the <ul>", () => {
    const { container } = renderList({ footer: <li data-testid="footer">more</li> });
    const ul = container.querySelector("ul")!;
    expect(ul.querySelector('[data-testid="footer"]')).toBeTruthy();
  });

  it("exposes extra imperative methods via imperativeExtra", () => {
    const ref = createRef<ZoneEntry & { focusFirst: () => void }>();
    render(
      <CompositeList
        ref={ref}
        zoneId="test-list"
        ariaLabel="Test list"
        items={ITEMS}
        onTabOut={vi.fn()}
        onAction={vi.fn()}
        imperativeExtra={({ focusItem }) => ({ focusFirst: () => focusItem("a", "summary") })}
        renderRow={({ id, isActive, isFocused }) => (
          <CompositeRow key={id} itemId={id} isFocused={isFocused} isActiveRow={isActive} label={id}>
            <span />
          </CompositeRow>
        )}
      />,
    );
    expect(typeof ref.current!.focusFirst).toBe("function");
    act(() => ref.current!.focusFirst());
    expect(activeAttrs()).toEqual({ id: "a", seg: "summary" });
  });
});
