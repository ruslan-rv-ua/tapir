import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import type { ProfileMeta } from "../../lib/tauri";
import { StreamTransferDialog } from "./StreamTransferDialog";

vi.mock("../../i18n/paraglide/messages", () => ({
  copy_stream_to_profile_title: ({ name }: { name: string }) => `Копіювати «${name}» у профіль`,
  move_stream_to_profile_title: ({ name }: { name: string }) => `Перемістити «${name}» у профіль`,
  transfer_create_new_profile: () => "+ Новий профіль…",
  transfer_no_other_profiles: () => "Інших профілів немає",
  transfer_target_profiles: () => "Цільові профілі",
  cancel: () => "Скасувати",
}));

const profiles: ProfileMeta[] = [
  { name: "Jazz", streamCount: 5, isActive: false },
  { name: "Rock", streamCount: 0, isActive: false },
];

function renderDialog(over: Partial<Parameters<typeof StreamTransferDialog>[0]> = {}) {
  const props = {
    mode: "copy" as const, streamName: "Radio Paradise", profiles,
    onSelect: vi.fn(), onCreateNew: vi.fn(), onCancel: vi.fn(), ...over,
  };
  return { ...render(<StreamTransferDialog {...props} />), props };
}

describe("StreamTransferDialog", () => {
  it("shows the copy title and lists the target profiles", () => {
    renderDialog();
    expect(screen.getByText("Копіювати «Radio Paradise» у профіль")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Jazz" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rock" })).toBeTruthy();
  });

  it("shows the move title in move mode", () => {
    renderDialog({ mode: "move" });
    expect(screen.getByText("Перемістити «Radio Paradise» у профіль")).toBeTruthy();
  });

  it("calls onSelect with the chosen profile name", () => {
    const { props } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Jazz" }));
    expect(props.onSelect).toHaveBeenCalledWith("Jazz");
  });

  it("calls onCreateNew when the create entry is clicked", () => {
    const { props } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "+ Новий профіль…" }));
    expect(props.onCreateNew).toHaveBeenCalled();
  });

  it("shows the empty hint and the create entry when there are no profiles", () => {
    renderDialog({ profiles: [] });
    expect(screen.getByText("Інших профілів немає")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Новий профіль…" })).toBeTruthy();
  });
});
