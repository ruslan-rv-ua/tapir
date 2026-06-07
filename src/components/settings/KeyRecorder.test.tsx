import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { KeyRecorder } from "./KeyRecorder";

const LABEL = "Toggle recording";

/** Render the recorder, arm it (click), and return the record button + onChange spy. */
function arm(value = "") {
  const onChange = vi.fn();
  const { getByRole } = render(
    <KeyRecorder label={LABEL} value={value} onChange={onChange} />,
  );
  // The record button's accessible name embeds the label; the clear button
  // (✕) is named by settings_hotkey_clear, so the label regex disambiguates.
  const button = getByRole("button", { name: new RegExp(LABEL) });
  fireEvent.click(button);
  return { button, onChange };
}

describe("KeyRecorder — physical-position (e.code) recording", () => {
  it("records the Latin accelerator even when e.key is Cyrillic", () => {
    const { button, onChange } = arm();
    // Physical R on a Ukrainian layout reports e.key === "к".
    fireEvent.keyDown(button, {
      code: "KeyR",
      key: "к",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(onChange).toHaveBeenCalledWith("Ctrl+Shift+R");
  });

  it("records the digit, not Shift's punctuation glyph", () => {
    const { button, onChange } = arm();
    // Shift+1 reports e.key === "!"; e.code === "Digit1" is stable.
    fireEvent.keyDown(button, { code: "Digit1", key: "!", altKey: true });
    expect(onChange).toHaveBeenCalledWith("Alt+1");
  });

  it("maps arrow codes to short tokens", () => {
    const { button, onChange } = arm();
    fireEvent.keyDown(button, {
      code: "ArrowUp",
      key: "ArrowUp",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(onChange).toHaveBeenCalledWith("Ctrl+Shift+Up");
  });

  it("ignores unsupported keys and stays armed", () => {
    const { button, onChange } = arm();
    fireEvent.keyDown(button, { code: "Minus", key: "-", ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(button).toHaveTextContent(m.settings_hotkey_press_keys());
  });

  it("ignores a lone modifier press", () => {
    const { button, onChange } = arm();
    fireEvent.keyDown(button, { code: "ShiftLeft", key: "Shift", shiftKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(button).toHaveTextContent(m.settings_hotkey_press_keys());
  });

  it("cancels recording on Escape without recording a combo", () => {
    const { button, onChange } = arm("Ctrl+Shift+P");
    fireEvent.keyDown(button, { code: "Escape", key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    // Recording exited → button shows the existing value again.
    expect(button).toHaveTextContent("Ctrl+Shift+P");
  });
});
