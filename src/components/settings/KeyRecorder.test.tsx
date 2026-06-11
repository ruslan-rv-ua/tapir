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
  // Both buttons embed the label in their accessible name; only the record
  // button's name starts with it (the clear button's is "Clear hotkey: …").
  const button = getByRole("button", { name: (name: string) => name.startsWith(LABEL) });
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

describe("KeyRecorder — accessible names", () => {
  it("names the clear button after its action so SR users can tell rows apart", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <KeyRecorder label={LABEL} value="Ctrl+Shift+R" onChange={onChange} />,
    );
    const clear = getByRole("button", {
      name: m.settings_hotkey_clear({ action: LABEL }),
    });
    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("announces an unassigned combo as 'not set', not as the clear action", () => {
    const { getByRole } = render(
      <KeyRecorder label={LABEL} value="" onChange={vi.fn()} />,
    );
    expect(
      getByRole("button", {
        name: `${LABEL}: ${m.settings_hotkey_not_set()}. ${m.settings_hotkey_press_to_change()}`,
      }),
    ).toBeInTheDocument();
  });
});
